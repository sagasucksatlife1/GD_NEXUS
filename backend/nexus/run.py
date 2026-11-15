"""Headless runner: `python -m nexus.run --cycles 10`  (no server, prints progress)."""
from __future__ import annotations

import argparse

from .config import CONFIG
from .orchestrator import Orchestrator


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cycles", type=int, default=5)
    ap.add_argument("--agents", default="M6,M8,M9,M10,M11")
    ap.add_argument("--max-attempts", type=int, default=None)
    args = ap.parse_args()

    orch = Orchestrator(CONFIG)
    orch.configure(max_attempts=args.max_attempts, agents_enabled=args.agents.split(","))
    orch._run.set()
    seen = len(orch.store.all())
    for i in range(args.cycles):
        verdict = orch.run_cycle()
        for e in orch.store.all()[seen:]:
            p = e["payload"]
            extra = p.get("error", {}).get("message", "") if e["event_type"] == "sandbox_reject" else \
                p.get("verdict", "") if e["event_type"] == "verdict" else \
                f"sharpe={p['stats']['sharpe']} dsr={p['stats']['dsr']}" if e["event_type"] == "rebacktest" else ""
            print(f"{e['event_id']} {e['agent']} {e['lineage_root'][:40]:<40} v{e['version']} "
                  f"{e['event_type']:<15} {str(extra)[:110]}")
        seen = len(orch.store.all())
        print(f"--- cycle {i + 1}/{args.cycles}: {verdict}")
    s = orch.store.summary()
    print(f"\nlineages={s['lineages']} versions={s['versions']} rejections={s['rejections']} "
          f"validated={s['validated']} dead={s['dead']}")


if __name__ == "__main__":
    main()
