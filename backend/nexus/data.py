"""Daily close prices. yfinance with a pickle cache; deterministic synthetic fallback."""
from __future__ import annotations

import hashlib

import numpy as np
import pandas as pd

from .config import CONFIG


def load_prices(universe: str, cfg=CONFIG) -> pd.DataFrame:
    tickers = cfg.universes[universe]
    cfg.ensure_dirs()
    if cfg.synthetic:
        return synthetic_prices(tickers, cfg.start_date)
    key = hashlib.md5((",".join(tickers) + cfg.start_date).encode()).hexdigest()[:10]
    cache = cfg.cache_dir / f"{universe}_{key}.pkl"
    if cache.exists():
        age_days = (pd.Timestamp.now().timestamp() - cache.stat().st_mtime) / 86400
        if age_days < 3:
            return pd.read_pickle(cache)
    try:
        import yfinance as yf
        raw = yf.download(tickers, start=cfg.start_date, auto_adjust=True, progress=False, threads=True)
        px = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw[["Close"]].rename(columns={"Close": tickers[0]})
        px = px.dropna(axis=1, thresh=int(len(px) * 0.9)).ffill().dropna()
        if px.empty or px.shape[1] < 2:
            raise RuntimeError("yfinance returned no usable data")
        px.index = pd.DatetimeIndex(px.index).tz_localize(None)
        px.to_pickle(cache)
        return px
    except Exception as exc:  # noqa: BLE001
        if cache.exists():
            return pd.read_pickle(cache)
        raise RuntimeError(f"No data for {universe}: {exc}. Set NEXUS_SYNTHETIC=1 to run offline.") from exc


def split_research_holdout(px: pd.DataFrame, cfg=CONFIG):
    research = px.loc[: cfg.research_end]
    return research, px  # holdout evaluated on the tail of the full series


def synthetic_prices(tickers: list[str], start: str, seed: int = 7) -> pd.DataFrame:
    """Correlated GBM + a few genuinely cointegrated pairs so stat-arb has something real to find."""
    rng = np.random.default_rng(seed)
    idx = pd.bdate_range(start, pd.Timestamp.today().normalize())
    n, k = len(idx), len(tickers)
    mkt = rng.normal(0.0003, 0.011, n)
    # regime-switching vol so CSI has structure
    vol_scale = np.ones(n)
    for s in rng.choice(n - 120, size=6, replace=False):
        vol_scale[s:s + rng.integers(40, 120)] = rng.uniform(2.0, 3.5)
    rets = np.empty((n, k))
    for j in range(k):
        beta = rng.uniform(0.5, 1.4)
        rets[:, j] = beta * mkt * vol_scale + rng.normal(0.0001, 0.012, n) * vol_scale
    logp = np.cumsum(rets, axis=0) + np.log(100)
    # make every (0,1), (2,3), ... pair cointegrated via an OU spread
    for j in range(0, k - 1, 4):
        ou = np.zeros(n)
        for t in range(1, n):
            ou[t] = ou[t - 1] * 0.97 + rng.normal(0, 0.01)
        logp[:, j + 1] = logp[:, j] + ou + 0.05
    return pd.DataFrame(np.exp(logp), index=idx, columns=tickers)
