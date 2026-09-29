"""Archive-mode export. Writes the static JSON the React app reads on Vercel.

    python scripts/export.py --out ../nexus-frontend/public/data
    python scripts/export.py --out ../nexus-frontend/public/data --csi   (also rebuild CSI)

Outputs: repair_log.json, summary.json, strategies.json, csi_history.json (if available)
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from nexus.config import CONFIG  # noqa: E402
from nexus.events import EventStore  # noqa: E402


def write(path: Path, obj):
    path.write_text(json.dumps(obj, separators=(",", ":"), allow_nan=False))
    print(f"  {path.name:<20} {path.stat().st_size / 1024:>8.1f} KB")


def build_csi(out: Path):
    from nexus.csi import compute_csi, to_contract
    from nexus.data import load_prices
    px = load_prices("CSI", CONFIG)
    data = to_contract(compute_csi(px), px)
    write(CONFIG.data_dir / "csi_history.json", data)
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=CONFIG.export_dir)
    ap.add_argument("--csi", action="store_true", help="recompute CSI before exporting")
    a = ap.parse_args()
    out = a.out.expanduser()
    out.mkdir(parents=True, exist_ok=True)
    CONFIG.ensure_dirs()

    store = EventStore(CONFIG.events_file)
    print(f"exporting {len(store.all())} events -> {out}")
    write(out / "repair_log.json", store.all())
    summary = store.summary()
    if a.csi:
        build_csi(out)
    csi_file = CONFIG.data_dir / "csi_history.json"
    if csi_file.exists():
        shutil.copy(csi_file, out / "csi_history.json")
        csi = json.loads(csi_file.read_text())
        summary["csi"] = csi["current"]
        print(f"  {'csi_history.json':<20} copied")
    summary["mode"] = "archive"
    write(out / "meta.json", {"synthetic": CONFIG.synthetic, "llm": CONFIG.llm_backend,
                              "model": CONFIG.ollama_model, "research_end": CONFIG.research_end,
                              "exported_at": summary["generated_at"]})
    write(out / "summary.json", summary)
    lineages = sorted(store.lineages().values(), key=lambda l: l["updated_at"], reverse=True)
    write(out / "strategies.json", lineages)


if __name__ == "__main__":
    main()
