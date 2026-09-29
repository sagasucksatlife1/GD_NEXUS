"""Repair agent. Reads what the strategy was aiming for (thesis) + why the sandbox killed it,
writes a diagnosis, and returns patched code. Every patch is a new version and a new DSR trial."""
from __future__ import annotations

import difflib

from .llm import tag
from .sandbox import CONTRACT, extract_code

REPAIR_SYSTEM = f"""You are the NEXUS repair engineer. A quant strategy was rejected by the sandbox.
Your job: make the code faithfully express the ORIGINAL THESIS while satisfying the contract.

Rules:
- Fix the root cause named in the error. Do not rewrite the strategy into a different idea.
- LookAhead errors: remove every use of future data (center=True, bfill, shift(-k), full-sample fits,
  full-sample normalisation, fitting a model on the whole history). Use trailing/expanding windows.
- Runtime/Contract errors: return a DataFrame with the exact prices.index, zeros for no position, no NaN.
- PerfBar errors: you may improve the CONSTRUCTION (hedging, sizing, exits, orthogonalisation) in the
  spirit of the thesis. Do NOT grid-search or tune parameters to the backtest. Every attempt is counted
  as a trial and penalised by the Deflated Sharpe Ratio, and a sealed holdout decides the final verdict.
- If the thesis itself looks unsound, say so in the diagnosis and make the most honest implementation.

{CONTRACT}

Respond in exactly this format:
<diagnosis>What the strategy was aiming for, what the code actually did, the root cause, and the fix.
3-6 sentences.</diagnosis>
```python
# full corrected code
```
"""


def build_repair_prompt(thesis: str, code: str, error: dict, traceback: str | None,
                        stats: dict | None, attempt: int, max_attempts: int) -> str:
    parts = [
        "REPAIR TASK",
        f"Attempt {attempt} of {max_attempts - 1} repairs.",
        f"ORIGINAL THESIS:\n{thesis}",
        f"REJECTED CODE:\n```python\n{code}```",
        f"ERROR TYPE: {error['type']}",
        f"ERROR: {error['message']}",
    ]
    if error.get("line"):
        lines = code.splitlines()
        ln = error["line"]
        ctx = "\n".join(f"{i + 1:>4} {'>>' if i + 1 == ln else '  '} {lines[i]}"
                        for i in range(max(0, ln - 3), min(len(lines), ln + 2)))
        parts.append(f"FAILING LINE CONTEXT:\n{ctx}")
    if traceback:
        parts.append(f"TRACEBACK (tail):\n{traceback[-1500:]}")
    if stats:
        parts.append(f"BACKTEST STATS OF REJECTED VERSION: {stats}")
    return "\n\n".join(parts)


def unified_diff(old: str, new: str, old_v: int, new_v: int) -> str:
    return "".join(difflib.unified_diff(
        old.splitlines(keepends=True), new.splitlines(keepends=True),
        fromfile=f"v{old_v}/strategy.py", tofile=f"v{new_v}/strategy.py", n=3))


def repair(llm, cfg, thesis, code, error, traceback, stats, attempt) -> dict:
    user = build_repair_prompt(thesis, code, error, traceback, stats, attempt, cfg.max_attempts)
    text = llm.chat(REPAIR_SYSTEM, user, cfg.repair_temperature)
    return {
        "diagnosis": tag(text, "diagnosis") or "(repair agent returned no diagnosis)",
        "code": extract_code(text),
    }
