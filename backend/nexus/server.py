"""Live-mode API.   uvicorn nexus.server:app --port 8000

GET  /api/health                      ollama + sandbox + data status
GET  /api/summary                     home-page counters (+ current CSI if built)
GET  /api/events?after=evt_000120&limit=500   poll this every 1-2s for the live stream
GET  /api/strategies?agent=M6&status=DEAD
GET  /api/strategies/{lineage_id}     full dossier with version timeline
GET  /api/rejections?agent=&error_type=&limit=   rejection console feed (newest first)
GET  /api/csi                         csi_history.json
POST /api/csi/rebuild                 recompute CSI
GET  /api/control                     daemon state
POST /api/control/start | /pause | /stop
PATCH /api/control                    {"max_attempts": 4, "agents_enabled": ["M6","M8"]}
"""
from __future__ import annotations

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agents.personas import AGENTS
from .config import CONFIG
from .orchestrator import Orchestrator
from .sandbox import run_sandbox

orch = Orchestrator(CONFIG)
_sandbox_health: dict = {"ok": None}


def _check_sandbox():
    import numpy as np
    import pandas as pd
    idx = pd.bdate_range("2020-01-01", periods=300)
    px = pd.DataFrame(100 * np.exp(np.cumsum(np.random.default_rng(0).normal(0, 0.01, (300, 2)), axis=0)),
                      index=idx, columns=["A", "B"])
    code = ("import pandas as pd\n"
            "def generate_signals(prices):\n"
            "    return (prices.pct_change(20) > 0).astype(float) * 0.5\n")
    r = run_sandbox(code, px, CONFIG)
    return {"ok": r.ok, "error": r.error}


@asynccontextmanager
async def lifespan(app):
    import asyncio
    global _sandbox_health
    _sandbox_health = await asyncio.to_thread(_check_sandbox)
    yield
    orch.stop()


app = FastAPI(title="NEXUS Live API", version="1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=list(CONFIG.cors_origins), allow_methods=["*"],
                   allow_headers=["*"])


@app.get("/api/health")
def health():
    llm = orch.llm.health()
    return {"ok": bool(llm.get("ok") and _sandbox_health.get("ok")), "mode": "live",
            "llm": llm, "sandbox": _sandbox_health, "synthetic_data": CONFIG.synthetic,
            "daemon": orch.state["status"], "last_error": orch.state["last_error"]}


@app.get("/api/summary")
def summary():
    s = orch.store.summary()
    csi_file = CONFIG.data_dir / "csi_history.json"
    if csi_file.exists():
        s["csi"] = json.loads(csi_file.read_text())["current"]
    s["mode"] = "live"
    s["daemon"] = {"status": orch.state["status"], "current": orch.state["current"]}
    return s


@app.get("/api/events")
def events(after: str | None = None, limit: int = Query(500, le=5000)):
    evts = orch.store.after(after, limit)
    return {"events": evts, "last_event_id": evts[-1]["event_id"] if evts else after}


@app.get("/api/strategies")
def strategies(agent: str | None = None, status: str | None = None, include_code: bool = False):
    out = []
    for L in sorted(orch.store.lineages().values(), key=lambda l: l["updated_at"], reverse=True):
        if agent and L["agent"] != agent or status and L["status"] != status:
            continue
        if not include_code:
            L = {**L, "versions": [{k: v for k, v in ver.items() if k not in ("code", "diff", "equity")}
                                   for ver in L["versions"]]}
        out.append(L)
    return out


@app.get("/api/strategies/{lineage_id}")
def strategy(lineage_id: str):
    L = orch.store.lineages().get(lineage_id)
    if not L:
        raise HTTPException(404, "unknown lineage")
    L["events"] = [e for e in orch.store.all() if e["lineage_root"] == lineage_id]
    return L


@app.get("/api/rejections")
def rejections(agent: str | None = None, error_type: str | None = None, limit: int = 100):
    evts = orch.store.all()
    by_key = {(e["lineage_root"], e["version"], e["event_type"]): e for e in evts}
    theses = {e["lineage_root"]: e["payload"].get("thesis") for e in evts if e["event_type"] == "generated"}
    out = []
    for e in reversed(evts):
        if e["event_type"] != "sandbox_reject":
            continue
        if agent and e["agent"] != agent or error_type and e["payload"]["error"]["type"] != error_type:
            continue
        key = (e["lineage_root"], e["version"])
        diag = by_key.get((*key, "diagnosis"))
        patch = by_key.get((e["lineage_root"], e["version"] + 1, "patch"))
        retest = by_key.get((e["lineage_root"], e["version"] + 1, "rebacktest"))
        out.append({
            "reject": e,
            "thesis": theses.get(e["lineage_root"]),
            "diagnosis": diag["payload"]["diagnosis"] if diag else None,
            "patch": patch["payload"] if patch else None,
            "patched_result": retest["payload"]["stats"] if retest else None,
        })
        if len(out) >= limit:
            break
    return out


@app.get("/api/csi")
def csi():
    f = CONFIG.data_dir / "csi_history.json"
    if not f.exists():
        raise HTTPException(404, "CSI not built yet: POST /api/csi/rebuild or run scripts/export.py --csi")
    return json.loads(f.read_text())


@app.post("/api/csi/rebuild")
def csi_rebuild():
    from .csi import compute_csi, to_contract
    from .data import load_prices
    px = load_prices("CSI", CONFIG)
    data = to_contract(compute_csi(px), px)
    (CONFIG.data_dir / "csi_history.json").write_text(json.dumps(data, allow_nan=False))
    return data["current"]


class ControlPatch(BaseModel):
    max_attempts: int | None = None
    agents_enabled: list[str] | None = None


@app.get("/api/control")
def control_state():
    return {**orch.state, "agents": {k: a.title for k, a in AGENTS.items()}}


@app.post("/api/control/{action}")
def control(action: str):
    if action not in ("start", "pause", "stop"):
        raise HTTPException(400, "action must be start | pause | stop")
    getattr(orch, action)()
    return orch.state


@app.patch("/api/control")
def control_patch(body: ControlPatch):
    orch.configure(body.max_attempts, body.agents_enabled)
    return orch.state
