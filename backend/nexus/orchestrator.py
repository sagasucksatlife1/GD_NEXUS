"""The NEXUS loop.

Per lineage, per version v:
  generated(v1) | patch(v>1)
  -> sandbox (static, runtime, contract, causal audit)
       fail -> sandbox_reject(v)
       pass -> rebacktest(v) -> SLP gates
                 fail -> sandbox_reject(v, with stats)
                 pass -> sealed holdout (run once) -> verdict VALIDATED | DEAD
  after sandbox_reject(v):
       v < max_attempts -> verdict RETRY(v) -> diagnosis(v) -> patch(v+1) -> loop
       else             -> verdict DEAD(v)
"""
from __future__ import annotations

import threading
import time
import traceback as tb_mod
from datetime import datetime, timezone

import pandas as pd

from . import backtest as bt
from .agents.personas import AGENTS
from .config import CONFIG
from .data import load_prices
from .events import EventStore
from .llm import get_llm
from .repair import repair, unified_diff
from .sandbox import run_full_period, run_sandbox


class Stopped(Exception):
    pass


class Orchestrator:
    def __init__(self, cfg=CONFIG, store: EventStore | None = None, llm=None):
        self.cfg = cfg
        cfg.ensure_dirs()
        self.store = store or EventStore(cfg.events_file)
        self.llm = llm or get_llm(cfg)
        self._prices: dict[str, tuple[float, pd.DataFrame]] = {}
        self._run = threading.Event()      # set = running
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None
        self._agent_turn = 0
        self.state = {
            "status": "stopped", "current": None, "cycles": 0, "last_error": None,
            "max_attempts": cfg.max_attempts, "agents_enabled": list(cfg.agents_enabled),
            "started_at": None,
        }

    # ---------------------------------------------------------------- control
    def start(self):
        self._stop.clear()
        self._run.set()
        self.state["status"] = "running"
        if not self._thread or not self._thread.is_alive():
            self.state["started_at"] = _now()
            self._thread = threading.Thread(target=self._loop, daemon=True, name="nexus-loop")
            self._thread.start()

    def pause(self):
        self._run.clear()
        self.state["status"] = "paused"

    def stop(self):
        self._stop.set()
        self._run.set()
        self.state["status"] = "stopping"

    def configure(self, max_attempts: int | None = None, agents_enabled: list[str] | None = None):
        if max_attempts is not None:
            self.cfg.max_attempts = max(1, min(int(max_attempts), 10))
            self.state["max_attempts"] = self.cfg.max_attempts
        if agents_enabled is not None:
            valid = [a for a in agents_enabled if a in AGENTS]
            self.state["agents_enabled"] = valid

    def _checkpoint(self, **current):
        if current:
            self.state["current"] = {**(self.state["current"] or {}), **current}
        while not self._run.is_set():
            time.sleep(0.2)
        if self._stop.is_set():
            raise Stopped()

    # ------------------------------------------------------------------ loop
    def _loop(self):
        try:
            while not self._stop.is_set():
                self._checkpoint()
                try:
                    self.run_cycle()
                    self.state["last_error"] = None
                except Stopped:
                    break
                except Exception as e:  # noqa: BLE001  (infra failure: log, back off, keep going)
                    self.state["last_error"] = {"at": _now(), "message": f"{type(e).__name__}: {e}",
                                                "traceback": tb_mod.format_exc()[-2000:]}
                    time.sleep(10)
                self.state["cycles"] += 1
                self.state["current"] = None
                time.sleep(self.cfg.cycle_sleep_s)
        finally:
            self.state["status"] = "stopped"
            self.state["current"] = None

    def run_cycle(self):
        """Pending seeded (legacy) lineages first, otherwise the next enabled agent generates."""
        pending = [p for p in self.store.pending_lineages() if p["agent"] in self.state["agents_enabled"]]
        if pending:
            e = pending[0]
            return self.process_lineage(AGENTS[e["agent"]], e["lineage_root"], e["payload"]["thesis"],
                                        e["payload"]["code"])
        enabled = self.state["agents_enabled"]
        if not enabled:
            time.sleep(2)
            return None
        agent = AGENTS[enabled[self._agent_turn % len(enabled)]]
        self._agent_turn += 1
        return self.generate_and_process(agent)

    def generate_and_process(self, agent):
        self._checkpoint(agent=agent.code, stage="generating", lineage=None, version=1)
        tickers = list(self.prices(agent.universe).columns)
        text = self.llm.chat(agent.system_prompt(),
                             agent.user_prompt(tickers, self.store.recent_theses(agent.code)),
                             self.cfg.llm_temperature)
        s = agent.parse(text)
        self.store.emit(lineage_root=s["lineage_root"], version=1, agent=agent.code, event_type="generated",
                        payload={"name": s["name"], "thesis": s["thesis"], "code": s["code"], "source": "agent"})
        return self.process_lineage(agent, s["lineage_root"], s["thesis"], s["code"])

    # -------------------------------------------------------- lineage engine
    def process_lineage(self, agent, lineage: str, thesis: str, code: str) -> str:
        px_full = self.prices(agent.universe)
        research = px_full.loc[: self.cfg.research_end]
        version = 1
        emit = lambda et, p, v=None: self.store.emit(  # noqa: E731
            lineage_root=lineage, version=v or version, agent=agent.code, event_type=et, payload=p)

        while True:
            self._checkpoint(agent=agent.code, lineage=lineage, version=version, stage="sandbox")
            res = run_sandbox(code, research, self.cfg)
            stats = equity = None
            error, trace = res.error, res.traceback

            if res.ok:
                self._checkpoint(stage="backtest")
                n_trials = self.store.trials_count()
                out = bt.backtest(res.weights, research, n_trials, cfg=self.cfg)
                stats, equity = out["stats"], out["equity"]
                emit("rebacktest", {"stats": stats, "equity": equity, "window": "research"})
                error = bt.gate(stats, self.cfg)

                if error is None:
                    return self._holdout(agent, lineage, version, code, px_full, n_trials, emit)

            reject = {"code": code, "error": error}
            if trace:
                reject["traceback"] = trace
            if stats:
                reject["stats"], reject["equity"] = stats, equity
            emit("sandbox_reject", reject)

            if version >= self.cfg.max_attempts:
                emit("verdict", {"verdict": "DEAD", "cause_of_death": error["message"],
                                 "error": error, "attempts": version, "stats": stats})
                return "DEAD"

            emit("verdict", {"verdict": "RETRY", "error": error, "attempts": version})
            self._checkpoint(stage="diagnosing")
            try:
                fix = repair(self.llm, self.cfg, thesis, code, error, trace, stats, attempt=version)
            except Exception as e:  # noqa: BLE001
                emit("verdict", {"verdict": "DEAD", "attempts": version,
                                 "cause_of_death": f"Repair agent failed: {type(e).__name__}: {e}"})
                return "DEAD"
            emit("diagnosis", {"diagnosis": fix["diagnosis"], "error": error, "thesis": thesis})
            self._checkpoint(stage="patching")
            new_v = version + 1
            emit("patch", {"code": fix["code"], "diff": unified_diff(code, fix["code"], version, new_v),
                           "diagnosis": fix["diagnosis"], "parent_version": version}, v=new_v)
            code, version = fix["code"], new_v

    def _holdout(self, agent, lineage, version, code, px_full, n_trials, emit) -> str:
        self._checkpoint(stage="holdout")
        start = pd.Timestamp(self.cfg.research_end) + pd.Timedelta(days=1)
        if px_full.index[-1] <= start + pd.Timedelta(days=90):
            emit("verdict", {"verdict": "VALIDATED", "attempts": version, "holdout": None,
                             "note": "no holdout data available"})
            return "VALIDATED"
        res = run_full_period(code, px_full, self.cfg)
        if not res.ok:
            emit("verdict", {"verdict": "DEAD", "attempts": version, "error": res.error,
                             "cause_of_death": f"Holdout run failed: {res.error['message']}"})
            return "DEAD"
        out = bt.backtest(res.weights, px_full, n_trials, start=start, cfg=self.cfg)
        hs = out["stats"]
        holdout = {"stats": hs, "equity": out["equity"], "window": "holdout"}
        if (hs["sharpe"] or 0) <= self.cfg.min_holdout_sharpe:
            # a holdout failure is final: repairing against the holdout would contaminate it
            emit("verdict", {"verdict": "DEAD", "attempts": version, "holdout": holdout,
                             "error": {"type": "perf_bar", "line": None,
                                       "message": f"PerfBar: sealed holdout Sharpe {hs['sharpe']} "
                                                  f"<= {self.cfg.min_holdout_sharpe}"},
                             "cause_of_death": f"Passed research gates, failed sealed holdout "
                                               f"(Sharpe {hs['sharpe']}). Overfit to research window."})
            return "DEAD"
        emit("verdict", {"verdict": "VALIDATED", "attempts": version, "holdout": holdout})
        return "VALIDATED"

    # ------------------------------------------------------------------ data
    def prices(self, universe: str) -> pd.DataFrame:
        cached = self._prices.get(universe)
        if cached and time.time() - cached[0] < 86400:
            return cached[1]
        px = load_prices(universe, self.cfg)
        self._prices[universe] = (time.time(), px)
        return px


def _now():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
