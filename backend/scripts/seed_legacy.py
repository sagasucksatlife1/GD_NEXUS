"""Import your OLD strategy code (including everything the old sandbox rejected) into NEXUS.

Drop files like:
    legacy/M6/spread_xlf_kbe.py      (+ optional spread_xlf_kbe.md with the thesis)
    legacy/M8/ortho_ensemble_v1.py

Thesis source, in order: sibling .md/.txt file -> module docstring -> placeholder.
The old code does NOT need to match the new contract: the sandbox will reject it with a
ContractError and the repair agent will port it to generate_signals(prices) autonomously.
Every original is kept as v1 in the log, so the terminal shows exactly what was denied.

Usage:  python scripts/seed_legacy.py            (seeds legacy/M6 and legacy/M8)
        python scripts/seed_legacy.py --dir ~/ai-hedge-fund/rejected --agent M8
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nexus.config import CONFIG  # noqa: E402
from nexus.events import EventStore  # noqa: E402


def thesis_for(py: Path, code: str) -> str:
    for ext in (".md", ".txt"):
        side = py.with_suffix(ext)
        if side.exists():
            return side.read_text().strip()[:2000]
    try:
        doc = ast.get_docstring(ast.parse(code))
        if doc:
            return doc.strip()[:2000]
    except SyntaxError:
        m = re.match(r'\s*[\'"]{3}(.*?)[\'"]{3}', code, flags=re.S)
        if m:
            return m.group(1).strip()[:2000]
    return f"Legacy strategy '{py.stem}' imported from ai-hedge-fund; thesis not recorded. Infer it from the code."


def seed(folder: Path, agent: str, store: EventStore) -> int:
    existing = {e["payload"].get("legacy_file") for e in store.all() if e["event_type"] == "generated"}
    n = 0
    for py in sorted(folder.glob("*.py")):
        key = f"{agent}/{py.name}"
        if key in existing:
            print(f"skip (already seeded) {key}")
            continue
        code = py.read_text()
        name = re.sub(r"[^a-z0-9-]+", "-", py.stem.lower()).strip("-")[:48]
        lineage = f"{agent.lower()}-legacy-{name}-{uuid.uuid4().hex[:6]}"
        store.emit(lineage_root=lineage, version=1, agent=agent, event_type="generated",
                   payload={"name": name, "thesis": thesis_for(py, code), "code": code,
                            "source": "legacy", "legacy_file": key})
        print(f"seeded {key} -> {lineage}")
        n += 1
    return n


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", type=Path)
    ap.add_argument("--agent", choices=["M6", "M8"])
    a = ap.parse_args()
    store = EventStore(CONFIG.events_file)
    if a.dir:
        if not a.agent:
            ap.error("--agent is required with --dir")
        total = seed(a.dir.expanduser(), a.agent, store)
    else:
        total = sum(seed(CONFIG.legacy_dir / ag, ag, store) for ag in ("M6", "M8"))
    print(f"\n{total} legacy strategies queued. Start the loop; they are processed before new generations.")
