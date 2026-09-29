"""The two NEXUS agents.

>>> PORTING YOUR OLD PROMPTS <<<
Paste the original system prompt from ai-hedge-fund into PERSONA_PROMPT for each agent.
Keep the output-format block (OUTPUT_FORMAT) and CONTRACT appended as-is: the parser and
sandbox depend on them.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass

from ..llm import tag
from ..sandbox import CONTRACT, extract_code

OUTPUT_FORMAT = """
Respond in exactly this format and nothing else:
<name>short-kebab-case-name</name>
<thesis>2-4 sentences: the economic mechanism, why it should persist, what would falsify it.</thesis>
```python
# full, self-contained code implementing generate_signals(prices)
```
"""


@dataclass
class Agent:
    code: str            # "M6" | "M8"
    title: str
    universe: str
    persona_prompt: str

    def system_prompt(self) -> str:
        return f"{self.persona_prompt.strip()}\n\n{CONTRACT}\n{OUTPUT_FORMAT}"

    def user_prompt(self, tickers: list[str], recent: list[str]) -> str:
        avoid = "\n".join(f"- {r}" for r in recent) or "- (none yet)"
        return (f"Universe: {', '.join(tickers)}\n"
                f"Research data: daily closes.\n\n"
                f"Strategies you already proposed (do NOT repeat them, explore a different variant):\n{avoid}\n\n"
                f"Propose ONE new strategy now.")

    def parse(self, text: str) -> dict:
        name = tag(text, "name") or f"{self.code.lower()}-strategy"
        name = re.sub(r"[^a-z0-9-]+", "-", name.lower()).strip("-")[:48] or "strategy"
        return {
            "name": name,
            "thesis": tag(text, "thesis") or "(no thesis returned)",
            "code": extract_code(text),
            "lineage_root": f"{self.code.lower()}-{name}-{uuid.uuid4().hex[:6]}",
        }


M6 = Agent(
    code="M6",
    title="quant_stat_arb · Synthetic Fair-Value Spread",
    universe="M6",
    persona_prompt="""
You are Model 6 — quant_stat_arb, a statistical-arbitrage researcher.
Your single method family: the SYNTHETIC FAIR-VALUE SPREAD.
For a target asset, build a synthetic fair value from one or more economically related assets
(sector peers, commodity/producer links, country/currency links) using a TRAILING hedge ratio
(rolling OLS, rolling beta, or a causal Kalman filter). The spread = log(target) - log(synthetic).
Standardise it with trailing statistics only, enter when the dislocation is large, exit on reversion,
and stop out if the relationship breaks (e.g. rolling stationarity/half-life deteriorates).
Positions must be hedged (target leg vs synthetic legs), sized so gross exposure <= 2.
Prefer robustness over clever parameters: few parameters, economically motivated pairings.
""",
)

M8 = Agent(
    code="M8",
    title="quant_ml_engineer · 3-Feature Orthogonal Ensemble",
    universe="M8",
    persona_prompt="""
You are Model 8 — quant_ml_engineer, a machine-learning researcher for cross-sectional equity signals.
Your single method family: the 3-FEATURE ORTHOGONAL ENSEMBLE.
Build EXACTLY three features from DIFFERENT families using only closes
(e.g. medium-term momentum, short-term reversal, volatility/risk, trend quality, drawdown-from-high).
Make them orthogonal cross-sectionally at each date (rank-transform, then residualise features 2 and 3
against the earlier ones, e.g. Gram-Schmidt on ranks). Combine them with a small ensemble
(e.g. equal-weight + ridge + shallow tree) trained WALK-FORWARD on an expanding window only,
refit at most monthly, predicting next-period cross-sectional rank. Set random_state everywhere.
Convert predictions to a dollar-neutral long/short book with gross exposure 1.
Keep runtime under 60 seconds: vectorise, refit monthly, small models.
""",
)

AGENTS = {"M6": M6, "M8": M8}
