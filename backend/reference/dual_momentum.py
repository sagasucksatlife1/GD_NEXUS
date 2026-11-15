"""Dual momentum (Antonacci, 2014).
Each month, compare 12-month returns of US equities (SPY) and international equities (EFA).
Relative momentum picks the stronger one; absolute momentum only holds it if it also beat long Treasuries
(TLT) over the same window. Otherwise the whole book moves to TLT, or to GLD if bonds are also in a
downtrend. One position at a time, fully invested. It captures equity trends and exits in bear markets.
Falsified if the winner of the 12-month race stops outperforming over the following month."""
import numpy as np
import pandas as pd


def generate_signals(prices: pd.DataFrame) -> pd.DataFrame:
    r12 = prices / prices.shift(252) - 1.0
    first_day = prices.index.to_series().dt.month.diff().fillna(1) != 0
    out = pd.DataFrame(0.0, index=prices.index, columns=prices.columns)
    choice = pd.Series(index=prices.index, dtype=object)
    for t in prices.index[first_day.values]:
        row = r12.loc[t]
        if row[["SPY", "EFA", "TLT"]].isna().any():
            continue
        eq = "SPY" if row["SPY"] >= row["EFA"] else "EFA"
        if row[eq] > row["TLT"]:
            choice[t] = eq
        elif row["TLT"] > 0 or "GLD" not in prices.columns:
            choice[t] = "TLT"
        else:
            choice[t] = "GLD"
    choice = choice.ffill()
    for c in ["SPY", "EFA", "TLT", "GLD"]:
        if c in out.columns:
            out[c] = (choice == c).astype(float)
    return out.fillna(0.0)
