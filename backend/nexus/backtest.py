"""Backtest engine + Strategy Lifecycle Protocol gates."""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy.stats import norm

from .config import CONFIG

TDAYS = 252
EULER_GAMMA = 0.5772156649


def _clean(x):
    if x is None:
        return None
    x = float(x)
    return None if (math.isnan(x) or math.isinf(x)) else round(x, 4)


def _sharpe(r: pd.Series) -> float:
    sd = r.std()
    return float(r.mean() / sd * math.sqrt(TDAYS)) if sd and sd > 0 else 0.0


def deflated_sharpe(r: pd.Series, n_trials: int) -> float:
    """Bailey & Lopez de Prado (2014). Per-period SR, null variance of SR ~ 1/T."""
    T = len(r)
    if T < 30 or r.std() == 0:
        return 0.0
    sr = r.mean() / r.std()
    skew = float(r.skew())
    kurt = float(r.kurt()) + 3.0  # pandas gives excess kurtosis
    if n_trials > 1:
        v = 1.0 / T
        sr0 = math.sqrt(v) * ((1 - EULER_GAMMA) * norm.ppf(1 - 1.0 / n_trials)
                              + EULER_GAMMA * norm.ppf(1 - 1.0 / (n_trials * math.e)))
    else:
        sr0 = 0.0
    denom = 1 - skew * sr + (kurt - 1) / 4.0 * sr ** 2
    if denom <= 0:
        return 0.0
    return float(norm.cdf((sr - sr0) * math.sqrt(T - 1) / math.sqrt(denom)))


def backtest(weights: pd.DataFrame, prices: pd.DataFrame, n_trials: int, start=None, cfg=CONFIG) -> dict:
    rets = prices.pct_change(fill_method=None).fillna(0.0)
    w = weights.reindex_like(prices).fillna(0.0)
    held = w.shift(1).fillna(0.0)
    gross_pnl = (held * rets).sum(axis=1)
    turnover = (w - w.shift(1)).abs().sum(axis=1).fillna(0.0)
    net = gross_pnl - turnover.shift(1).fillna(0.0) * cfg.cost_bps / 1e4

    active = held.abs().sum(axis=1) > 0
    first = active.idxmax() if active.any() else net.index[0]
    if start is not None:
        first = max(first, pd.Timestamp(start))
    net = net.loc[first:]
    turnover = turnover.loc[first:]
    gross = held.abs().sum(axis=1).loc[first:]
    mkt = rets.mean(axis=1).loc[first:]  # equal-weight universe return

    eq = (1 + net).cumprod()
    dd = eq / eq.cummax() - 1
    half = len(net) // 2
    # exposure-matched alpha: regress strategy pnl on EW market
    beta = float(np.cov(net, mkt)[0, 1] / mkt.var()) if mkt.var() > 0 else 0.0
    resid = net - beta * mkt
    alpha_ann = float(resid.mean() * TDAYS)
    alpha_t = float(resid.mean() / (resid.std() / math.sqrt(len(resid)))) if resid.std() > 0 else 0.0

    stats = {
        "sharpe": _clean(_sharpe(net)),
        "dsr": _clean(deflated_sharpe(net, n_trials)),
        "maxdd": _clean(dd.min()),
        "ann_ret": _clean(net.mean() * TDAYS),
        "ann_vol": _clean(net.std() * math.sqrt(TDAYS)),
        "split_half": [_clean(_sharpe(net.iloc[:half])), _clean(_sharpe(net.iloc[half:]))],
        "beta": _clean(beta),
        "alpha_ann": _clean(alpha_ann),
        "alpha_t": _clean(alpha_t),
        "turnover_ann": _clean(turnover.mean() * TDAYS),
        "avg_gross": _clean(gross.mean()),
        "n_days": int(len(net)),
        "n_trials": int(n_trials),
        "start": str(net.index[0].date()),
        "end": str(net.index[-1].date()),
    }
    weekly = eq.resample("W-FRI").last().dropna()
    equity = {"dates": [d.strftime("%Y-%m-%d") for d in weekly.index],
              "values": [round(float(v), 5) for v in weekly.values]}
    return {"stats": stats, "equity": equity}


def gate(stats: dict, cfg=CONFIG) -> dict | None:
    """Return an error dict (type perf_bar / risk_limit) if the SLP research gates fail."""
    fails = []
    s = stats
    if s["maxdd"] is None or s["maxdd"] < cfg.max_drawdown:
        return {"type": "risk_limit", "line": None,
                "message": f"RiskLimit: max drawdown {s['maxdd']} breaches {cfg.max_drawdown}"}
    if (s["sharpe"] or 0) < cfg.min_sharpe:
        fails.append(f"Sharpe {s['sharpe']} < {cfg.min_sharpe}")
    if (s["dsr"] or 0) < cfg.min_dsr:
        fails.append(f"Deflated Sharpe {s['dsr']} < {cfg.min_dsr} (after {s['n_trials']} trials)")
    if min((x or 0) for x in s["split_half"]) < cfg.min_split_half:
        fails.append(f"split-half Sharpe {s['split_half']} unstable (min < {cfg.min_split_half})")
    if (s["alpha_ann"] or 0) <= cfg.min_alpha:
        fails.append(f"exposure-matched alpha {s['alpha_ann']} <= {cfg.min_alpha} (beta {s['beta']})")
    if fails:
        return {"type": "perf_bar", "line": None, "message": "PerfBar: " + "; ".join(fails)}
    return None
