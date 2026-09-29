"""Append-only event store. This file IS the contract with the frontend.

Event shape (frozen):
{
  "event_id": "evt_000123",
  "timestamp": ISO-8601 UTC,
  "strategy_id": str,          # == lineage_root (versions tracked via "version")
  "lineage_root": str,
  "version": int,
  "agent": "M6" | "M8",
  "event_type": "generated" | "sandbox_reject" | "diagnosis" | "patch" | "rebacktest" | "verdict",
  "payload": {...}             # only the fields relevant to event_type
}
"""
from __future__ import annotations

import json
import threading
from collections import Counter, OrderedDict
from datetime import datetime, timezone
from pathlib import Path

EVENT_TYPES = ("generated", "sandbox_reject", "diagnosis", "patch", "rebacktest", "verdict")
ERROR_TYPES = ("syntax", "runtime", "lookahead", "risk_limit", "perf_bar")
VERDICTS = ("VALIDATED", "REJECTED", "RETRY", "DEAD")


class EventStore:
    def __init__(self, path: Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._events: list[dict] = []
        if self.path.exists():
            with self.path.open() as f:
                for line in f:
                    line = line.strip()
                    if line:
                        self._events.append(json.loads(line))

    # ------------------------------------------------------------------ write
    def emit(self, *, lineage_root: str, version: int, agent: str, event_type: str, payload: dict) -> dict:
        if event_type not in EVENT_TYPES:
            raise ValueError(f"bad event_type {event_type}")
        err = payload.get("error")
        if err and err.get("type") not in ERROR_TYPES:
            raise ValueError(f"bad error type {err.get('type')}")
        if "verdict" in payload and payload["verdict"] not in VERDICTS:
            raise ValueError(f"bad verdict {payload['verdict']}")
        with self._lock:
            evt = {
                "event_id": f"evt_{len(self._events) + 1:06d}",
                "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "strategy_id": lineage_root,
                "lineage_root": lineage_root,
                "version": int(version),
                "agent": agent,
                "event_type": event_type,
                "payload": payload,
            }
            with self.path.open("a") as f:
                f.write(json.dumps(evt, default=_json_default) + "\n")
            self._events.append(json.loads(json.dumps(evt, default=_json_default)))
            return evt

    # ------------------------------------------------------------------- read
    def all(self) -> list[dict]:
        with self._lock:
            return list(self._events)

    def after(self, event_id: str | None, limit: int = 500) -> list[dict]:
        evts = self.all()
        if event_id:
            try:
                idx = int(event_id.split("_")[1])
            except (IndexError, ValueError):
                idx = 0
            evts = evts[idx:]
        return evts[:limit]

    def trials_count(self) -> int:
        """Every version ever backtested counts as a trial for the Deflated Sharpe Ratio."""
        return sum(1 for e in self.all() if e["event_type"] == "rebacktest") + 1

    def recent_theses(self, agent: str, n: int = 10) -> list[str]:
        out = [e["payload"].get("name", "") + ": " + e["payload"].get("thesis", "")[:160]
               for e in self.all() if e["agent"] == agent and e["event_type"] == "generated"
               and e["version"] == 1]
        return out[-n:]

    def pending_lineages(self) -> list[dict]:
        """Lineages whose last event is 'generated' (e.g. seeded legacy code) and never tested."""
        last: "OrderedDict[str, dict]" = OrderedDict()
        for e in self.all():
            last[e["lineage_root"]] = e
            last.move_to_end(e["lineage_root"])
        return [e for e in last.values() if e["event_type"] == "generated"]

    # ------------------------------------------------------------ aggregates
    def lineages(self) -> dict[str, dict]:
        out: dict[str, dict] = {}
        for e in self.all():
            lid = e["lineage_root"]
            p = e["payload"]
            L = out.setdefault(lid, {
                "id": lid, "agent": e["agent"], "name": None, "thesis": None, "source": "agent",
                "status": "IN_PROGRESS", "stage": "generated", "versions": {},
                "created_at": e["timestamp"], "updated_at": e["timestamp"],
            })
            L["updated_at"] = e["timestamp"]
            L["stage"] = e["event_type"]
            v = L["versions"].setdefault(e["version"], {
                "version": e["version"], "code": None, "error": None, "diagnosis": None,
                "diff": None, "stats": None, "equity": None, "holdout": None, "status": "PENDING",
            })
            if e["event_type"] in ("generated", "patch"):
                v["code"] = p.get("code")
                if e["event_type"] == "generated":
                    L["name"] = p.get("name") or L["name"]
                    L["thesis"] = p.get("thesis") or L["thesis"]
                    L["source"] = p.get("source", "agent")
                else:
                    v["diff"] = p.get("diff")
            elif e["event_type"] == "sandbox_reject":
                v["error"] = p.get("error")
                v["status"] = "REJECTED"
                if p.get("stats"):
                    v["stats"], v["equity"] = p.get("stats"), p.get("equity")
            elif e["event_type"] == "diagnosis":
                # diagnosis is attached to the version it diagnoses
                v["diagnosis"] = p.get("diagnosis")
            elif e["event_type"] == "rebacktest":
                v["stats"], v["equity"] = p.get("stats"), p.get("equity")
            elif e["event_type"] == "verdict":
                verdict = p.get("verdict")
                if verdict in ("VALIDATED", "DEAD"):
                    L["status"] = verdict
                    v["status"] = "PASSED" if verdict == "VALIDATED" else v["status"]
                    if p.get("holdout"):
                        v["holdout"] = p["holdout"]
                    L["cause_of_death"] = p.get("cause_of_death")
        for L in out.values():
            L["versions"] = [L["versions"][k] for k in sorted(L["versions"])]
            L["attempts"] = len(L["versions"])
        return out

    def summary(self) -> dict:
        evts = self.all()
        lins = self.lineages()
        rejects = [e for e in evts if e["event_type"] == "sandbox_reject"]
        by_agent = {}
        for a in ("M6", "M8"):
            al = [l for l in lins.values() if l["agent"] == a]
            ar = [e for e in rejects if e["agent"] == a]
            validated = [l for l in al if l["status"] == "VALIDATED"]
            by_agent[a] = {
                "lineages": len(al),
                "versions": sum(l["attempts"] for l in al),
                "rejections": len(ar),
                "validated": len(validated),
                "dead": sum(1 for l in al if l["status"] == "DEAD"),
                "avg_attempts_to_pass": round(sum(l["attempts"] for l in validated) / len(validated), 2) if validated else None,
                "failure_taxonomy": dict(Counter(e["payload"]["error"]["type"] for e in ar)),
            }
        return {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "events": len(evts),
            "lineages": len(lins),
            "versions": sum(l["attempts"] for l in lins.values()),
            "rejections": len(rejects),
            "repairs": sum(1 for e in evts if e["event_type"] == "patch"),
            "validated": sum(1 for l in lins.values() if l["status"] == "VALIDATED"),
            "dead": sum(1 for l in lins.values() if l["status"] == "DEAD"),
            "in_progress": sum(1 for l in lins.values() if l["status"] == "IN_PROGRESS"),
            "failure_taxonomy": dict(Counter(e["payload"]["error"]["type"] for e in rejects)),
            "by_agent": by_agent,
            "last_event_id": evts[-1]["event_id"] if evts else None,
        }


def _json_default(o):
    try:
        import numpy as np
        if isinstance(o, (np.floating,)):
            return None if np.isnan(o) else float(o)
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
    except ImportError:
        pass
    return str(o)
