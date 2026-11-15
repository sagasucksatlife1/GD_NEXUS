"""Cross-asset relative + absolute momentum (Asness, Moskowitz & Pedersen 2013, "Value and Momentum Everywhere").
Each month, rank all fifteen cross-asset ETFs (equity sectors, international, EM, Treasuries, gold, REITs) by
12-month return skipping the last month, and hold the top two equally, but only if each also has a positive
12-1 return (absolute momentum); otherwise that half sits in cash. Momentum is one of the most persistent
premia across asset classes. Falsified if past 12-1 winners stop outperforming next month."""
import numpy as np
import pandas as pd


def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    mom = prices.shift(21) / prices.shift(252) - 1.0
    first_day = prices.index.to_series().dt.month.diff().fillna(1) != 0
    rank = mom.rank(axis=1, ascending=False)
    pick = ((rank <= 2) & (mom > 0)).astype(float) * 0.5
    pick = pick.where(first_day).ffill().fillna(0.0)
    return pick
