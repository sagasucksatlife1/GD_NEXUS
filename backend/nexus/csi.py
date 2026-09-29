"""Complexity State Index v1. All components are strictly trailing (causal).

Components (each mapped to a causal expanding percentile, oriented so HIGH = more stress/complexity):
  entropy     1 - permutation entropy (order 3) of market returns, 63d   (low entropy = herding/structure)
  hurst       |H - 0.5| from aggregated-variance slope, 252d             (distance from random walk)
  rmt         top eigenvalue share of the cross-asset correlation, 63d   (market moving as one body)
  turbulence  Mahalanobis distance of today's returns vs trailing 252d, smoothed 21d (Kritzman-Li)

Orientation and weights are v1 modelling choices. Calibrate them in Phase 2 against realised
drawdowns; do not claim them as fixed truths.
"""
from __future__ import annotations

import math
from itertools import permutations

import numpy as np
import pandas as pd

WEIGHTS = {"entropy": 0.2, "hurst": 0.2, "rmt": 0.3, "turbulence": 0.3}
STATES = [(0.50, "LAMINAR"), (0.75, "TRANSITIONAL"), (0.90, "TURBULENT"), (1.01, "CRITICAL")]


def permutation_entropy(r: pd.Series, window: int = 63, order: int = 3) -> pd.Series:
    x = r.to_numpy()
    patterns = {p: i for i, p in enumerate(permutations(range(order)))}
    codes = np.full(len(x), np.nan)
    for t in range(order - 1, len(x)):
        codes[t] = patterns[tuple(np.argsort(x[t - order + 1:t + 1], kind="stable"))]
    onehot = pd.get_dummies(pd.Series(codes, index=r.index)).astype(float)
    p = onehot.rolling(window).mean()
    h = -(p * np.log(p.where(p > 0))).sum(axis=1, min_count=1)
    return (h / math.log(math.factorial(order))).where(p.notna().all(axis=1))


def rolling_hurst(r: pd.Series, window: int = 252, lags=(1, 2, 4, 8, 16)) -> pd.Series:
    x = r.to_numpy()
    out = np.full(len(x), np.nan)
    loglags = np.log(lags)
    for t in range(window, len(x) + 1):
        w = x[t - window:t]
        sds = [np.std(w[: window - window % k].reshape(-1, k).sum(axis=1)) for k in lags]
        if min(sds) > 0:
            out[t - 1] = np.polyfit(loglags, np.log(sds), 1)[0]
    return pd.Series(out, index=r.index)


def absorption(rets: pd.DataFrame, window: int = 63) -> pd.Series:
    x = rets.to_numpy()
    out = np.full(len(x), np.nan)
    for t in range(window, len(x) + 1):
        c = np.corrcoef(x[t - window:t].T)
        if np.isfinite(c).all():
            out[t - 1] = np.linalg.eigvalsh(c)[-1] / c.shape[0]
    return pd.Series(out, index=rets.index)


def turbulence(rets: pd.DataFrame, window: int = 252, smooth: int = 21) -> pd.Series:
    x = rets.to_numpy()
    out = np.full(len(x), np.nan)
    for t in range(window, len(x)):
        hist = x[t - window:t]
        d = x[t] - hist.mean(axis=0)
        out[t] = float(d @ np.linalg.pinv(np.cov(hist.T)) @ d) / x.shape[1]
    return pd.Series(out, index=rets.index).rolling(smooth).mean()


def compute_csi(prices: pd.DataFrame) -> pd.DataFrame:
    rets = np.log(prices).diff().dropna()
    mkt = rets.mean(axis=1)
    raw = pd.DataFrame({
        "entropy": 1 - permutation_entropy(mkt),
        "hurst": (rolling_hurst(mkt) - 0.5).abs(),
        "rmt": absorption(rets),
        "turbulence": turbulence(rets),
    })
    pct = raw.apply(lambda s: s.expanding(min_periods=252).rank(pct=True))
    composite = sum(pct[k] * w for k, w in WEIGHTS.items())
    # re-rank the composite causally so thresholds mean "top X% of history so far"
    csi = composite.expanding(min_periods=252).rank(pct=True)
    df = pct.add_suffix("_pct").join(raw).assign(composite=composite, csi=csi).dropna()
    df["state"] = pd.cut(df["csi"], bins=[-0.01] + [b for b, _ in STATES], labels=[s for _, s in STATES]).astype(str)
    return df


def to_contract(df: pd.DataFrame, prices: pd.DataFrame) -> dict:
    """csi_history.json shape used by the frontend Observatory."""
    r = lambda s: [None if pd.isna(v) else round(float(v), 4) for v in s]  # noqa: E731
    bench = "SPY" if "SPY" in prices.columns else prices.columns[0]
    counts = df["state"].value_counts()
    trans = pd.crosstab(df["state"].shift(1), df["state"], normalize="index")
    mret = np.log(prices).diff().mean(axis=1).shift(-1).reindex(df.index)  # next-day, for stats only
    per_state = {s: {"days": int(counts.get(s, 0)),
                     "next_day_ann_ret": round(float(mret[df.state == s].mean() * 252), 4) if counts.get(s, 0) else None,
                     "next_day_ann_vol": round(float(mret[df.state == s].std() * math.sqrt(252)), 4) if counts.get(s, 0) else None}
                 for _, s in STATES}
    return {
        "dates": [d.strftime("%Y-%m-%d") for d in df.index],
        "csi": r(df["csi"]),
        "state": df["state"].tolist(),
        "components": {k: r(df[f"{k}_pct"]) for k in WEIGHTS},
        "components_raw": {k: r(df[k]) for k in WEIGHTS},
        "weights": WEIGHTS,
        "thresholds": {s: b for b, s in STATES},
        "current": {"date": df.index[-1].strftime("%Y-%m-%d"), "csi": round(float(df["csi"].iloc[-1]), 4),
                    "state": df["state"].iloc[-1],
                    "components": {k: round(float(df[f"{k}_pct"].iloc[-1]), 4) for k in WEIGHTS}},
        "transition_matrix": {str(a): {str(b): round(float(v), 4) for b, v in row.items()} for a, row in trans.iterrows()},
        "per_state": per_state,
        "benchmark": {"ticker": bench,
                      "values": r(prices[bench].reindex(df.index))},
    }
