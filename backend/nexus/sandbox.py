"""Sandbox. Strategy code runs in a separate Python process with CPU/memory limits,
an import whitelist, and no builtins for file/exec access.

NOTE: this is process isolation + static policy, good enough for code from a local LLM.
It is not a hardened security boundary against a deliberate attacker. For that, run the
runner inside Docker (`docker run --network none ...`) -- the interface stays the same.
"""
from __future__ import annotations

import ast
import json
import pickle
import re
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from .config import CONFIG

CONTRACT = textwrap.dedent('''
    Strategy code contract (enforced by the sandbox):
    - Define `generate_signals(prices: pd.DataFrame) -> pd.DataFrame`.
    - `prices`: daily adjusted closes, DatetimeIndex, one column per ticker. May contain NaN early on.
    - Return target portfolio weights with EXACTLY the same index as `prices`, columns a subset of prices.columns.
    - Row t = weights decided using data up to and including close t. The engine holds them from t to t+1.
      Never use data after t (no center=True, no bfill, no full-sample fit/normalisation, no shift(-k)).
    - Sum of |weights| per row must stay <= 2.0. No NaN/inf in the output (use 0 for no position).
    - Allowed imports: numpy, pandas, scipy, sklearn, statsmodels, math, itertools, functools,
      collections, typing, warnings, dataclasses. No file, network, os, subprocess, eval/exec.
    - Must be deterministic (set random_state / seeds) and finish in < 60 seconds on ~3000 rows.
''').strip()

ALLOWED_ROOTS = {"numpy", "pandas", "scipy", "sklearn", "statsmodels", "math", "itertools",
                 "functools", "collections", "typing", "warnings", "dataclasses", "__future__"}
BANNED_NAMES = {"open", "eval", "exec", "compile", "__import__", "input", "breakpoint",
                "globals", "vars", "memoryview"}
BANNED_ATTRS = {"system", "popen", "remove", "unlink", "rmtree", "to_pickle", "read_pickle",
                "to_csv", "read_csv", "to_parquet", "read_parquet", "__subclasses__", "__globals__",
                "__builtins__", "__code__"}


@dataclass
class SandboxResult:
    ok: bool
    error: dict | None = None          # {"type","message","line"}
    traceback: str | None = None
    weights: pd.DataFrame | None = None
    extra: dict = field(default_factory=dict)


# ---------------------------------------------------------------- static layer
def static_check(code: str) -> SandboxResult | None:
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return SandboxResult(False, {"type": "syntax", "message": f"SyntaxError: {e.msg}", "line": e.lineno})
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            for n in names:
                if n.split(".")[0] not in ALLOWED_ROOTS:
                    return SandboxResult(False, {"type": "runtime", "line": node.lineno,
                                                 "message": f"SecurityViolation: import '{n}' not allowed"})
        elif isinstance(node, ast.Name) and node.id in BANNED_NAMES:
            return SandboxResult(False, {"type": "runtime", "line": node.lineno,
                                         "message": f"SecurityViolation: '{node.id}' not allowed"})
        elif isinstance(node, ast.Attribute) and node.attr in BANNED_ATTRS:
            return SandboxResult(False, {"type": "runtime", "line": node.lineno,
                                         "message": f"SecurityViolation: attribute '.{node.attr}' not allowed"})
    if not any(isinstance(n, ast.FunctionDef) and n.name == "generate_signals" for n in tree.body):
        return SandboxResult(False, {"type": "runtime", "line": 1,
                                     "message": "ContractError: top-level function generate_signals(prices) not found"})
    return None


# ------------------------------------------------------------ runtime layer
RUNNER = r'''
import sys, pickle, json, traceback, importlib.util, warnings
warnings.filterwarnings("ignore")
work = sys.argv[1]; cpu = int(sys.argv[2])
try:
    import resource
    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    try:
        resource.setrlimit(resource.RLIMIT_AS, (6 * 1024**3, 6 * 1024**3))
    except Exception:
        pass  # macOS does not support RLIMIT_AS
except Exception:
    pass
with open(work + "/job.pkl", "rb") as f:
    job = pickle.load(f)
try:
    spec = importlib.util.spec_from_file_location("strategy", work + "/strategy.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    outs = {}
    for name, n_rows in job["runs"]:
        px = job["prices"].iloc[:n_rows].copy()
        outs[name] = mod.generate_signals(px)
    with open(work + "/out.pkl", "wb") as f:
        pickle.dump(outs, f)
except BaseException as e:
    tb = traceback.format_exc()
    line = None
    for fr in traceback.extract_tb(e.__traceback__):
        if fr.filename.endswith("strategy.py"):
            line = fr.lineno
    with open(work + "/error.json", "w") as f:
        json.dump({"message": f"{type(e).__name__}: {e}", "line": line, "traceback": tb}, f)
    sys.exit(1)
'''


def _execute(code: str, prices: pd.DataFrame, runs: list[tuple[str, int]], cfg=CONFIG):
    with tempfile.TemporaryDirectory(prefix="nexus_sbx_") as work:
        w = Path(work)
        (w / "strategy.py").write_text(code)
        (w / "runner.py").write_text(RUNNER)
        with (w / "job.pkl").open("wb") as f:
            pickle.dump({"prices": prices, "runs": runs}, f)
        try:
            proc = subprocess.run(
                [sys.executable, str(w / "runner.py"), str(w), str(cfg.sandbox_cpu_s)],
                cwd=work, capture_output=True, text=True, timeout=cfg.sandbox_timeout_s,
                env={"PATH": "/usr/bin:/bin", "HOME": work, "OMP_NUM_THREADS": "2", "MKL_NUM_THREADS": "2",
                     "PYTHONHASHSEED": "0", "MPLBACKEND": "Agg"},
            )
        except subprocess.TimeoutExpired:
            return None, {"type": "runtime", "line": None,
                          "message": f"Timeout: strategy exceeded {cfg.sandbox_timeout_s}s"}, None
        if (w / "error.json").exists():
            err = json.loads((w / "error.json").read_text())
            return None, {"type": "runtime", "message": err["message"][:1000], "line": err["line"]}, err["traceback"][-4000:]
        if proc.returncode != 0 or not (w / "out.pkl").exists():
            msg = (proc.stderr or "process died").strip().splitlines()[-1:] or ["process died"]
            if proc.returncode in (-9, -24, 137, 152):
                msg = ["ResourceLimit: CPU or memory limit exceeded"]
            return None, {"type": "runtime", "message": msg[0][:500], "line": None}, proc.stderr[-4000:]
        with (w / "out.pkl").open("rb") as f:
            return pickle.load(f), None, None


def _contract(name: str, out, prices: pd.DataFrame, n_rows: int, cfg=CONFIG):
    idx = prices.index[:n_rows]
    if not isinstance(out, pd.DataFrame):
        return None, {"type": "runtime", "line": None,
                      "message": f"ContractError: generate_signals must return a DataFrame, got {type(out).__name__}"}
    if not out.index.equals(idx):
        return None, {"type": "runtime", "line": None,
                      "message": f"ContractError: output index must equal prices.index "
                                 f"(got {len(out.index)} rows, expected {len(idx)}; do not dropna rows)"}
    bad = set(out.columns) - set(prices.columns)
    if bad:
        return None, {"type": "runtime", "line": None, "message": f"ContractError: unknown columns {sorted(bad)[:5]}"}
    try:
        out = out.astype(float)
    except Exception:  # noqa: BLE001
        return None, {"type": "runtime", "line": None, "message": "ContractError: weights must be numeric"}
    if not np.isfinite(out.to_numpy()).all():
        return None, {"type": "risk_limit", "line": None,
                      "message": "RiskLimit: output contains NaN or inf (use 0 for no position)"}
    gross = out.abs().sum(axis=1).max()
    if gross > cfg.max_gross + 1e-9:
        return None, {"type": "risk_limit", "line": None,
                      "message": f"RiskLimit: max gross exposure {gross:.2f} > {cfg.max_gross}"}
    if out.abs().sum().sum() == 0:
        return None, {"type": "perf_bar", "line": None, "message": "NoTrades: strategy never takes a position"}
    return out.reindex(columns=prices.columns, fill_value=0.0), None


def run_sandbox(code: str, research: pd.DataFrame, cfg=CONFIG) -> SandboxResult:
    """Static check -> full run -> contract -> causal audit (truncation test)."""
    static = static_check(code)
    if static:
        return static
    n = len(research)
    cuts = [int(n * c) for c in cfg.lookahead_cuts]
    runs = [("full", n)] + [(f"cut_{c}", c) for c in cuts]
    outs, err, tb = _execute(code, research, runs, cfg)
    if err:
        return SandboxResult(False, err, tb)
    full, err = _contract("full", outs["full"], research, n, cfg)
    if err:
        return SandboxResult(False, err)
    # causal audit: weights on rows <= cut must not change when future rows are removed
    for c in cuts:
        part, err = _contract(f"cut_{c}", outs[f"cut_{c}"], research, c, cfg)
        if err:
            return SandboxResult(False, err)
        diff = (full.iloc[:c] - part).abs()
        worst = float(diff.to_numpy().max())
        if worst > cfg.lookahead_tol:
            first_bad = diff.max(axis=1)
            first_bad = first_bad[first_bad > cfg.lookahead_tol].index[0]
            return SandboxResult(False, {
                "type": "lookahead", "line": None,
                "message": (f"LookAhead: weights on {first_bad.date()} change by {worst:.4g} when data after "
                            f"{research.index[c - 1].date()} is removed. The signal uses future information "
                            f"(check center=True, bfill, shift(-k), full-sample fit or normalisation)."),
            })
    return SandboxResult(True, weights=full)


def run_full_period(code: str, prices: pd.DataFrame, cfg=CONFIG) -> SandboxResult:
    """Used once, for the holdout. No audit needed beyond contract (code already passed audit)."""
    outs, err, tb = _execute(code, prices, [("full", len(prices))], cfg)
    if err:
        return SandboxResult(False, err, tb)
    w, err = _contract("full", outs["full"], prices, len(prices), cfg)
    if err:
        return SandboxResult(False, err)
    return SandboxResult(True, weights=w)


def extract_code(text: str) -> str:
    m = re.findall(r"```(?:python|py)?\s*\n(.*?)```", text, flags=re.S)
    return (max(m, key=len) if m else text).strip() + "\n"
