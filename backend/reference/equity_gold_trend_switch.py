"""Equity trend with a gold/Treasury fallback (trend-following asset allocation).
Hold SPY while it is above its 200-day moving average. When it falls below, rotate into whichever of GLD or
TLT is itself above its 200-day average (gold first), else cash. Equity bear markets are usually long and
trend-identifiable; gold and long bonds tend to hold up while equities trend down, but not always together
(2022), so each fallback has its own trend filter. Falsified if the 200-day filter stops reducing drawdowns."""
import numpy as np
import pandas as pd


def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    ma = prices.rolling(200, min_periods=200).mean()
    up = (prices > ma) & ma.notna()
    out = pd.DataFrame(0.0, index=prices.index, columns=prices.columns)
    spy = up["SPY"]
    gld = up["GLD"] & ~spy if "GLD" in prices.columns else spy & False
    tlt = up["TLT"] & ~spy & ~gld if "TLT" in prices.columns else spy & False
    out["SPY"] = spy.astype(float)
    if "GLD" in out.columns:
        out["GLD"] = gld.astype(float)
    if "TLT" in out.columns:
        out["TLT"] = tlt.astype(float)
    # confirm on weekly basis (Fridays) to limit whipsaw: hold last Friday's decision
    fri = prices.index.to_series().dt.dayofweek == 4
    return out.where(fri).ffill().fillna(0.0)
