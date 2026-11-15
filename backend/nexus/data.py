"""Daily close prices from Yahoo (direct HTTPS by default, yfinance optional) with a pickle cache;
deterministic synthetic fallback."""
from __future__ import annotations

import hashlib
import json
import time
import urllib.parse
import urllib.request

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
        if cfg.data_source == "yfinance":
            import yfinance as yf
            raw = yf.download(tickers, start=cfg.start_date, auto_adjust=True, progress=False, threads=True)
            px = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw[["Close"]].rename(columns={"Close": tickers[0]})
        else:
            px = yahoo_direct(tickers, cfg.start_date)
        px = px.dropna(axis=1, thresh=int(len(px) * 0.9)).ffill().dropna()
        if px.empty or px.shape[1] < 2:
            raise RuntimeError("Yahoo returned no usable data")
        px.index = pd.DatetimeIndex(px.index).tz_localize(None)
        px.to_pickle(cache)
        return px
    except Exception as exc:  # noqa: BLE001
        if cache.exists():
            return pd.read_pickle(cache)
        raise RuntimeError(f"No data for {universe}: {exc}. Set NEXUS_SYNTHETIC=1 to run offline.") from exc


_UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
       "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
_OPENER = None
_CRUMB = None


def _opener():
    """urllib opener with a cookie jar and certifi's CA bundle when available (fixes macOS SSL errors)."""
    global _OPENER
    if _OPENER is None:
        import http.cookiejar
        import ssl
        try:
            import certifi
            ctx = ssl.create_default_context(cafile=certifi.where())
        except Exception:  # noqa: BLE001
            ctx = ssl.create_default_context()
        _OPENER = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx),
                                              urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        _OPENER.addheaders = [("User-Agent", _UA), ("Accept", "*/*"), ("Accept-Language", "en-US,en;q=0.9")]
    return _OPENER


def _get(url: str, timeout: int = 30) -> bytes:
    with _opener().open(url, timeout=timeout) as r:
        return r.read()


def _yahoo_crumb() -> str | None:
    """Yahoo wants a session cookie + crumb for some clients. Best effort."""
    global _CRUMB
    if _CRUMB is None:
        _CRUMB = ""
        for u in ("https://fc.yahoo.com", "https://finance.yahoo.com/quote/SPY"):
            try:
                _get(u, 15)
            except Exception:  # noqa: BLE001  (fc.yahoo.com answers 404 but still sets the cookie)
                pass
        try:
            _CRUMB = _get("https://query1.finance.yahoo.com/v1/test/getcrumb", 15).decode().strip()
        except Exception:  # noqa: BLE001
            _CRUMB = ""
    return _CRUMB or None


def _yahoo_series(ticker: str, start: str) -> pd.Series:
    """Dividend/split-adjusted daily closes from Yahoo's chart endpoint (plain HTTPS)."""
    params = {"period1": int(pd.Timestamp(start).timestamp()), "period2": int(time.time()) + 86400,
              "interval": "1d", "events": "div,split", "includeAdjustedClose": "true"}
    last = None
    for attempt in range(3):
        for host in ("query1", "query2"):
            q = dict(params)
            if attempt > 0 and _yahoo_crumb():
                q["crumb"] = _yahoo_crumb()
            try:
                raw = _get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(ticker)}?"
                           + urllib.parse.urlencode(q))
                res = json.loads(raw)["chart"]["result"][0]
                ts = res.get("timestamp") or []
                ind = res["indicators"]
                vals = (ind.get("adjclose") or [{}])[0].get("adjclose") or ind["quote"][0]["close"]
                off = res.get("meta", {}).get("gmtoffset", 0) or 0
                idx = pd.to_datetime([t + off for t in ts], unit="s").normalize()
                s = pd.Series(vals, index=idx, dtype="float64", name=ticker)
                return s[~s.index.duplicated(keep="last")]
            except Exception as e:  # noqa: BLE001
                last = e
        time.sleep(1.0 * (attempt + 1))
    raise RuntimeError(f"yahoo {ticker}: {type(last).__name__}: {last}")


_STOOQ = {"DX-Y.NYB": None}


def _stooq_series(ticker: str, start: str) -> pd.Series:
    """Fallback: Stooq daily CSV (split-adjusted). US tickers are <symbol>.us."""
    import io
    sym = _STOOQ.get(ticker, f"{ticker.lower().replace('.', '-')}.us")
    if sym is None:
        raise RuntimeError(f"stooq {ticker}: no symbol")
    url = f"https://stooq.com/q/d/l/?s={sym}&d1={pd.Timestamp(start):%Y%m%d}&i=d"
    txt = _get(url).decode("utf-8", "replace")
    if not txt.startswith("Date"):
        raise RuntimeError(f"stooq {ticker}: {txt[:80].strip()!r}")
    df = pd.read_csv(io.StringIO(txt), parse_dates=["Date"]).set_index("Date")
    return df["Close"].astype("float64").rename(ticker)


def yahoo_direct(tickers: list[str], start: str) -> pd.DataFrame:
    cols, failed = {}, []
    for t in tickers:
        errs = []
        for fn in (_yahoo_series, _stooq_series):
            try:
                cols[t] = fn(t, start)
                break
            except Exception as e:  # noqa: BLE001
                errs.append(str(e)[:160])
        else:
            failed.append(" | ".join(errs))
        time.sleep(0.2)
    print(f"[data] downloaded {len(cols)}/{len(tickers)} tickers", flush=True)
    for f in failed[:3]:
        print(f"[data] failed: {f}", flush=True)
    return pd.DataFrame(cols).sort_index()


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
