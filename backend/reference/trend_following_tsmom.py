"""Time-series momentum (Moskowitz, Ooi & Pedersen, 2012).
Each asset is held long if its trailing 12-month return (skipping the last month) is positive and short
if negative, sized by inverse trailing volatility so every asset contributes similar risk. Trend persists
because investors under-react to news early and over-extend late; it historically pays most in prolonged
selloffs (e.g. 2022, when it went short long-duration Treasuries). Falsified if 12-1 trends stop predicting
the sign of next-month returns across asset classes."""
import numpy as np
import pandas as pd


def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    rets = prices.pct_change(fill_method=None)
    mom = prices.shift(21) / prices.shift(252) - 1.0
    vol = rets.rolling(63, min_periods=40).std() * np.sqrt(252)
    raw = np.sign(mom) * (0.10 / vol)
    raw = raw.replace([np.inf, -np.inf], np.nan).fillna(0.0)
    # rebalance on the first trading day of each month using data known at that close
    first_day = prices.index.to_series().dt.month.diff().fillna(1) != 0
    w = raw.where(first_day).ffill().fillna(0.0)
    gross = w.abs().sum(axis=1)
    scale = (1.5 / gross).clip(upper=1.0).replace([np.inf, -np.inf], 0.0).fillna(0.0)
    return w.mul(scale, axis=0).fillna(0.0)
