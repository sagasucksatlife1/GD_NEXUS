"""Sector momentum rotation (Moskowitz & Grinblatt, 1999).
Each month, rank the nine SPDR sector ETFs by 6-month return (skipping the last week to avoid short-term
reversal) and hold the top three equally, but only while SPY is above its 200-day average; otherwise sit
in cash. Industry momentum explains a large part of stock momentum because sector news diffuses slowly.
Falsified if the top-ranked sectors stop beating the bottom-ranked ones over the next month."""
import numpy as np
import pandas as pd


def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    sectors = [c for c in ["XLF", "XLE", "XLK", "XLU", "XLP", "XLY", "XLI", "XLB", "XLV"] if c in prices.columns]
    mom = prices[sectors].shift(5) / prices[sectors].shift(126) - 1.0
    ma = prices["SPY"].rolling(200, min_periods=200).mean()
    risk_on = (prices["SPY"] > ma)
    first_day = prices.index.to_series().dt.month.diff().fillna(1) != 0
    rank = mom.rank(axis=1, ascending=False)
    pick = ((rank <= 3) & mom.notna()).astype(float) / 3.0
    pick = pick.mul(risk_on.astype(float), axis=0)
    pick = pick.where(first_day).ffill().fillna(0.0)
    out = pd.DataFrame(0.0, index=prices.index, columns=prices.columns)
    out[sectors] = pick
    return out
