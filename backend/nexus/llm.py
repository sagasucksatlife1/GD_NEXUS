"""LLM backends. Ollama for real runs; Mock for offline testing and generating frontend data."""
from __future__ import annotations

import json
import random
import re
import urllib.error
import urllib.request

from .config import CONFIG


def strip_think(text: str) -> str:
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def tag(text: str, name: str) -> str | None:
    m = re.search(rf"<{name}>(.*?)</{name}>", text, flags=re.S | re.I)
    return m.group(1).strip() if m else None


class OllamaLLM:
    def __init__(self, cfg=CONFIG):
        self.cfg = cfg

    def chat(self, system: str, user: str, temperature: float) -> str:
        body = json.dumps({
            "model": self.cfg.ollama_model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "stream": False,
            "think": False,
            "options": {"temperature": temperature, "num_ctx": 16384},
        }).encode()
        req = urllib.request.Request(f"{self.cfg.ollama_url}/api/chat", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=self.cfg.llm_timeout_s) as r:
            data = json.loads(r.read())
        return strip_think(data["message"]["content"])

    def health(self) -> dict:
        try:
            with urllib.request.urlopen(f"{self.cfg.ollama_url}/api/tags", timeout=3) as r:
                models = [m["name"] for m in json.loads(r.read()).get("models", [])]
            return {"ok": self.cfg.ollama_model in models, "backend": "ollama",
                    "model": self.cfg.ollama_model, "available": models}
        except (urllib.error.URLError, OSError) as e:
            return {"ok": False, "backend": "ollama", "model": self.cfg.ollama_model, "error": str(e)}


# --------------------------------------------------------------------- mock
_M6_LOOKAHEAD = '''import numpy as np
import pandas as pd

def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    logp = np.log(prices)
    w = pd.DataFrame(0.0, index=prices.index, columns=prices.columns)
    cols = list(prices.columns)
    for i in range(0, len(cols) - 1, 4):
        a, b = cols[i], cols[i + 1]
        spread = logp[b] - logp[a]
        mu = spread.rolling(60, center=True).mean()
        sd = spread.rolling(60, center=True).std()
        z = ((spread - mu) / sd).fillna(0)
        pos = -np.sign(z) * (z.abs() > 1.0)
        w[b] = pos * 0.2
        w[a] = -pos * 0.2
    return w
'''
_M6_FIXED = _M6_LOOKAHEAD.replace(", center=True", "")
_M8_SYNTAX = '''import numpy as np
import pandas as pd

def generate_signals(prices: pd.DataFrame) -> pd.DataFrame
    rets = prices.pct_change()
    f1 = prices.pct_change(126).shift(21)
    f2 = -prices.pct_change(5)
    f3 = -rets.rolling(63).std()
    score = sum(f.rank(axis=1, pct=True) for f in (f1, f2, f3))
    score = score.sub(score.mean(axis=1), axis=0)
    w = score.div(score.abs().sum(axis=1), axis=0)
    return w.fillna(0.0)
'''
_M8_FIXED = _M8_SYNTAX.replace("-> pd.DataFrame\n", "-> pd.DataFrame:\n", 1)
_M8_RUNTIME = _M8_FIXED.replace("f3 = -rets.rolling(63).std()", "f3 = -rets.rolling(63).std()['volume']")
_M8_NORMALISE = _M8_FIXED.replace("f1 = prices.pct_change(126).shift(21)",
                                  "f1 = prices.pct_change(126).shift(21)\n    f1 = f1 - f1.mean()")


class MockLLM:
    """Deterministic-ish canned agent. Produces real code with real bugs so the whole loop runs."""

    def __init__(self, seed: int = 11):
        self.rng = random.Random(seed)

    def chat(self, system: str, user: str, temperature: float) -> str:
        if "REPAIR TASK" in user:
            code = _M6_FIXED if "spread" in user else _M8_FIXED
            if "LookAhead" in user:
                diag = "The z-score uses rolling(center=True), so each day's mean and std include the next 30 days."
            elif "SyntaxError" in user:
                diag = "The function signature is missing its trailing colon."
            elif "KeyError" in user:
                diag = "The code indexes a 'volume' column that does not exist; only closes are provided."
            elif "PerfBar" in user or "RiskLimit" in user:
                diag = "The construction is sound but the edge does not clear the bar; widening entry threshold."
                code = code.replace("> 1.0", "> 1.5") if "spread" in user else code.replace("126", "252")
            else:
                diag = "Rewrote the offending section to satisfy the contract."
            return f"<diagnosis>{diag}</diagnosis>\n```python\n{code}```"
        if "Model 6" in system:
            name, thesis, code = ("etf-pair-fair-value", "Cointegrated ETF pairs revert to a synthetic fair value "
                                  "built from a rolling hedge; trade 1-sigma dislocations.", _M6_LOOKAHEAD)
        else:
            name, thesis, code = self.rng.choice([
                ("orthogonal-mom-rev-vol", "Momentum, short reversal and low-vol ranks are near-orthogonal; "
                 "their equal-weight ensemble is more stable than any one.", _M8_SYNTAX),
                ("orthogonal-rank-blend", "Blend three orthogonal cross-sectional ranks into a dollar-neutral book.",
                 _M8_RUNTIME),
                ("zscore-ensemble", "Standardise the three-feature ensemble score before sizing.", _M8_NORMALISE),
            ])
        return f"<name>{name}</name>\n<thesis>{thesis}</thesis>\n```python\n{code}```"

    def health(self) -> dict:
        return {"ok": True, "backend": "mock", "model": "mock"}


def get_llm(cfg=CONFIG):
    return MockLLM() if cfg.llm_backend == "mock" else OllamaLLM(cfg)
