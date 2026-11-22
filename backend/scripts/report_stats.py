"""Print every number the PBL-3 report tables need, from data/events.jsonl and data/csi_history.json.

    python scripts/report_stats.py                 (prints to the terminal)
    python scripts/report_stats.py > results.txt   (saves to a file)
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nexus.config import CONFIG  # noqa: E402
from nexus.events import EventStore  # noqa: E402


def f(x, pct=False, d=2):
    if x is None:
        return "-"
    return f"{x * 100:+.1f}%" if pct else f"{x:.{d}f}"


def main():
    store = EventStore(CONFIG.events_file)
    ev = store.all()
    s = store.summary()
    lins = store.lineages()
    print("=" * 78)
    print(f"NEXUS run statistics   ({ev[0]['timestamp'] if ev else '-'} -> {ev[-1]['timestamp'] if ev else '-'})")
    print("=" * 78)

    print("\n[Table 7.1] Run statistics")
    for k in ("events", "lineages", "versions", "rejections", "repairs", "validated", "dead", "in_progress"):
        print(f"  {k:<14} {s[k]}")
    agent_lins = [l for l in lins.values() if l["agent"] != "REF"]
    agent_val = [l for l in agent_lins if l["status"] == "VALIDATED"]
    print(f"  agent-generated lineages {len(agent_lins)}, agent-validated {len(agent_val)}, "
          f"reference strategies {sum(1 for l in lins.values() if l['agent'] == 'REF')}")
    tested = sum(l["attempts"] for l in agent_lins)
    print(f"  rejection rate (agents)  {s['rejections'] / tested * 100:.1f}% of {tested} versions" if tested else "")
    repaired = [l for l in agent_val if l["attempts"] > 1]
    print(f"  validated after >=1 repair {len(repaired)}")

    print("\n[Per agent]")
    print(f"  {'agent':<6}{'lineages':>9}{'versions':>9}{'rejects':>9}{'valid':>7}{'dead':>6}  failure types")
    for a, x in s["by_agent"].items():
        print(f"  {a:<6}{x['lineages']:>9}{x['versions']:>9}{x['rejections']:>9}{x['validated']:>7}{x['dead']:>6}  "
              f"{x['failure_taxonomy']}")

    print("\n[Table 7.2] Rejections by failure type")
    tot = sum(s["failure_taxonomy"].values()) or 1
    for k, v in sorted(s["failure_taxonomy"].items(), key=lambda kv: -kv[1]):
        print(f"  {k:<12} {v:>5}  {v / tot * 100:5.1f}%")
    deaths = Counter()
    for l in agent_lins:
        if l["status"] == "DEAD":
            c = (l.get("cause_of_death") or "")
            deaths["holdout" if "holdout" in c.lower() else "exhausted repairs / other"] += 1
    print(f"  causes of death: {dict(deaths)}")

    print("\n[Table 7.3] Validated strategies (research window -> sealed holdout 2022+)")
    print(f"  {'strategy':<36}{'agent':<5}{'ver':>4}{'R.Sharpe':>9}{'DSR':>6}{'H.Sharpe':>9}{'H.ret/yr':>9}{'H.maxDD':>9}")
    val = [l for l in lins.values() if l["status"] == "VALIDATED"]
    for l in sorted(val, key=lambda l: (l["agent"] == "REF", l["id"])):
        v = next((v for v in l["versions"] if v["status"] == "PASSED"), l["versions"][-1])
        st, hs = v.get("stats") or {}, ((v.get("holdout") or {}).get("stats") or {})
        print(f"  {(l['name'] or l['id'])[:35]:<36}{l['agent']:<5}{l['attempts']:>4}{f(st.get('sharpe')):>9}"
              f"{f(st.get('dsr')):>6}{f(hs.get('sharpe')):>9}{f(hs.get('ann_ret'), True):>9}{f(hs.get('maxdd'), True):>9}")
    if not val:
        print("  (none)")

    csi_file = CONFIG.data_dir / "csi_history.json"
    if csi_file.exists():
        c = json.loads(csi_file.read_text())
        print(f"\n[Table 7.6] CSI states ({c['dates'][0]} -> {c['dates'][-1]}), current {c['current']}")
        n = sum(v["days"] for v in c["per_state"].values()) or 1
        for st, v in c["per_state"].items():
            print(f"  {st:<10} days {v['days']:>5} ({v['days'] / n * 100:4.1f}%)  next-day ann.ret "
                  f"{f(v['next_day_ann_ret'], True)}  ann.vol {v['next_day_ann_vol'] * 100:.1f}%")
    print("\nTables 7.4/7.5 (live allocation, always-on vs CSI-gated book): see the Portfolio page.")


if __name__ == "__main__":
    main()
