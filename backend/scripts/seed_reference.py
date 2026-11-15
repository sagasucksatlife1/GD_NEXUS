"""Seed well-known, published strategies into the book as REFERENCE strategies.

    python scripts/seed_reference.py            (idempotent; only seeds strategies with a positive 2022+ holdout)
    python scripts/seed_reference.py --all      (seed every one regardless)

Each file in reference/ is run through the same sandbox (static, runtime, contract, causal audit),
backtested on the research window and then on the 2022+ holdout, on the real CSI universe prices.
The numbers recorded are the real computed numbers. They are NOT put through the agents' research gates
and they are tagged source="reference", agent="REF", so the site shows them as a reference book that the
agents' discoveries are allocated alongside, not as agent output.
"""
from __future__ import annotations

import ast
import sys
import uuid
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nexus import backtest as bt  # noqa: E402
from nexus.config import CONFIG, ROOT  # noqa: E402
from nexus.data import load_prices  # noqa: E402
from nexus.events import EventStore  # noqa: E402
from nexus.sandbox import run_full_period, run_sandbox  # noqa: E402

UNIVERSE = "CSI"


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true",
                    help="seed every reference strategy, even ones with a negative 2022+ holdout")
    args = ap.parse_args()
    CONFIG.ensure_dirs()
    store = EventStore(CONFIG.events_file)
    done = {e["payload"].get("reference_file") for e in store.all() if e["event_type"] == "generated"}
    px = load_prices(UNIVERSE, CONFIG)
    research = px.loc[: CONFIG.research_end]
    start = pd.Timestamp(CONFIG.research_end) + pd.Timedelta(days=1)
    print(f"prices {px.shape} {px.index[0].date()} -> {px.index[-1].date()}")

    for py in sorted((ROOT / "reference").glob("*.py")):
        if py.name in done:
            print(f"skip (already seeded) {py.name}")
            continue
        code = py.read_text()
        thesis = ast.get_docstring(ast.parse(code)) or py.stem
        name = py.stem.replace("_", "-")
        lineage = f"ref-{name}-{uuid.uuid4().hex[:6]}"
        emit = lambda et, p: store.emit(lineage_root=lineage, version=1, agent="REF",  # noqa: E731
                                        event_type=et, payload=p)

        res = run_sandbox(code, research, CONFIG)
        if not res.ok:
            print(f"FAILED sandbox {py.name}: {res.error}")
            continue
        full = run_full_period(code, px, CONFIG)
        if not full.ok:
            print(f"FAILED full-period {py.name}: {full.error}")
            continue
        n_trials = store.trials_count()
        r = bt.backtest(res.weights, research, n_trials, cfg=CONFIG)
        h = bt.backtest(full.weights, px, n_trials, start=start, cfg=CONFIG)
        hs = h["stats"]
        if not args.all and not ((hs["ann_ret"] or 0) > 0 and (hs["sharpe"] or 0) > 0):
            print(f"NOT SEEDED {name:<28} holdout {hs['start']}..{hs['end']} ann.ret {hs['ann_ret']} "
                  f"Sharpe {hs['sharpe']} (negative since 2022; use --all to include anyway)")
            continue

        emit("generated", {"name": name, "thesis": thesis, "code": code, "source": "reference",
                           "reference_file": py.name})
        emit("rebacktest", {"stats": r["stats"], "equity": r["equity"], "window": "research"})
        emit("verdict", {"verdict": "VALIDATED", "attempts": 1,
                         "holdout": {"stats": h["stats"], "equity": h["equity"], "window": "holdout"},
                         "note": "reference strategy (published method), seeded directly into the book"})
        rs = r["stats"]
        print(f"SEEDED {name:<28} holdout {hs['start']}..{hs['end']}  ann.ret {hs['ann_ret']}  "
              f"Sharpe {hs['sharpe']}  maxDD {hs['maxdd']}  (research Sharpe {rs['sharpe']})")


if __name__ == "__main__":
    main()
