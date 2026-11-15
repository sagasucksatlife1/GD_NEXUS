"""Global tactical asset allocation, 10-month moving-average timing (Faber, 2007).
Equal-weight a diversified basket of equity, bond and gold ETFs, but hold each asset only while its close
is above its 200-day moving average; otherwise that slice sits in cash. Long-only and simple, it keeps most
of the upside of a balanced portfolio while stepping aside in long drawdowns. Falsified if MA timing stops
cutting drawdowns relative to buy-and-hold across a full cycle."""
import numpy as np
import pandas as pd


def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    basket = [c for c in ["SPY", "EFA", "EEM", "TLT", "GLD", "IYR"] if c in prices.columns]
    px = prices[basket]
    ma = px.rolling(200, min_periods=200).mean()
    on = (px > ma).astype(float)
    first_day = prices.index.to_series().dt.month.diff().fillna(1) != 0
    on = on.where(first_day).ffill().fillna(0.0)
    w = on / len(basket)
    out = pd.DataFrame(0.0, index=prices.index, columns=prices.columns)
    out[basket] = w.fillna(0.0)
    return out
