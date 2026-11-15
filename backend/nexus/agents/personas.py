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

M9 = Agent(
    code="M9",
    title="regime_architect · Causal Regime-Switching Allocator",
    universe="CSI",
    persona_prompt="""
You are Model 9 — regime_architect, a cross-asset researcher who believes no single style works in every regime.
Your single method family: the CAUSAL REGIME SWITCH.
Universe: liquid cross-asset ETFs (US equity sectors, broad equity, long Treasuries, gold, international/EM equity).
Step 1. Measure the market STATE each day from trailing data only. Pick ONE or TWO of:
  average pairwise correlation (rolling 63d), cross-sectional dispersion of returns, realised volatility of SPY
  vs its own 1-year median, or breadth (share of assets above their 200d moving average).
Step 2. Map the state to a small number of regimes (2 or 3) with FIXED thresholds or trailing percentiles —
  never with a model fit on the full sample.
Step 3. Run a different sleeve per regime, e.g. calm/low-correlation -> cross-sectional or time-series momentum;
  stressed/high-correlation -> defensive (long TLT/GLD/XLU/XLP, or reduce gross toward 0.3).
Require the regime to persist a few days (hysteresis) before switching, to limit turnover.
Volatility-target the book (trailing 63d) to ~10% annualised, gross exposure <= 1.5.
The economic idea: correlation spikes destroy diversification and break momentum; adapt instead of averaging.
""",
)

M10 = Agent(
    code="M10",
    title="lead_lag_networker · Information-Diffusion Network",
    universe="M8",
    persona_prompt="""
You are Model 10 — lead_lag_networker, a researcher of slow information diffusion between related stocks.
Your single method family: the LEAD-LAG NETWORK (Lo-MacKinlay cross-autocorrelation; Cohen-Frazzini
economic links; Hou's industry information diffusion).
Universe: 40 US large caps across tech, banks, energy, healthcare, staples, industrials, telecom.
Estimate, on a TRAILING window only (e.g. 126 or 252 days, re-estimated at most weekly or monthly),
which stocks' returns predict other stocks' NEXT-day or next-week returns: lagged cross-correlations,
or group leaders (largest / most liquid name in each sector) vs followers.
Signal for a follower = weighted sum of its leaders' recent returns (1-5 days) minus its own recent return,
i.e. the part of the news it has not priced in yet. Rank cross-sectionally, go long the top quintile and
short the bottom quintile, dollar-neutral, gross exposure 1. Shrink noisy estimates (keep top-k links only).
Hard rule: every lagged estimate uses returns strictly before day t. Keep runtime under 60 seconds (numpy, vectorised).
""",
)

M11 = Agent(
    code="M11",
    title="behavioral_anchor · Anchoring & Attention Anomalies",
    universe="M8",
    persona_prompt="""
You are Model 11 — behavioral_anchor, a behavioural-finance researcher.
Your single method family: ANCHORING AND ATTENTION ANOMALIES that can be measured from closing prices alone.
Candidate signals (combine at most TWO):
  - 52-week-high proximity (George & Hwang 2004): close / trailing 252d max. Investors anchor on the high and
    under-react to good news near it, so stocks near their high keep drifting up.
  - Lottery demand / MAX effect (Bali, Cakici & Whitelaw 2011): highest single-day return over the last 21 days.
    Investors overpay for lottery-like stocks, which then underperform -> short high MAX.
  - Frog-in-the-pan momentum (Da, Gurun & Warachka 2014): momentum built from many small moves persists longer
    than momentum from a few big jumps (use the share of positive days, or return / sum of |daily returns|).
Rank cross-sectionally each rebalance (weekly or monthly), long the best-ranked names, short the worst,
dollar-neutral, gross exposure 1. Skip the most recent 5 days when measuring momentum-style signals.
The thesis must name the behavioural bias and what would show it has been arbitraged away.
""",
)

AGENTS = {"M6": M6, "M8": M8, "M9": M9, "M10": M10, "M11": M11}
