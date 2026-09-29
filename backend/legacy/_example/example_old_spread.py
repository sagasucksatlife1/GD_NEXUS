"""EXAMPLE legacy file (delete me). Old ai-hedge-fund format: returns a signal Series for one pair,
not the new generate_signals contract. XLE vs XOP: producers' synthetic fair value tracks energy sector."""
import pandas as pd

def strategy(df):
    spread = df["XOP"] - 1.2 * df["XLE"]
    z = (spread - spread.mean()) / spread.std()
    return -z.clip(-1, 1)
