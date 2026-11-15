"""NEXUS config. Every knob lives here; env vars override defaults."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _env(name: str, default):
    raw = os.environ.get(name)
    if raw is None:
        return default
    if isinstance(default, bool):
        return raw.lower() in ("1", "true", "yes")
    if isinstance(default, int):
        return int(raw)
    if isinstance(default, float):
        return float(raw)
    return raw


@dataclass
class Config:
    # --- paths ---
    data_dir: Path = ROOT / "data"
    events_file: Path = ROOT / "data" / "events.jsonl"
    cache_dir: Path = ROOT / "data" / "cache"
    legacy_dir: Path = ROOT / "legacy"
    export_dir: Path = Path(_env("NEXUS_EXPORT_DIR", str(ROOT / "export")))

    # --- LLM ---
    llm_backend: str = _env("NEXUS_LLM", "ollama")          # "ollama" | "mock"
    ollama_url: str = _env("OLLAMA_URL", "http://localhost:11434")
    ollama_model: str = _env("NEXUS_MODEL", "qwen3:8b")
    llm_temperature: float = _env("NEXUS_TEMP", 0.7)
    repair_temperature: float = _env("NEXUS_REPAIR_TEMP", 0.2)
    llm_timeout_s: int = _env("NEXUS_LLM_TIMEOUT", 600)

    # --- data ---
    synthetic: bool = _env("NEXUS_SYNTHETIC", False)
    start_date: str = "2010-01-01"
    research_end: str = "2021-12-31"   # everything the loop sees
    # holdout (2022+) is touched ONCE per strategy, only after it passes research gates

    universes: dict = field(default_factory=lambda: {
        "M6": ["XLF", "KBE", "KRE", "XLE", "XOP", "XLK", "QQQ", "SMH", "GLD", "GDX",
               "SLV", "EWA", "EWC", "XLU", "XLP", "XLY", "XLI", "XLB", "XLV", "IYR"],
        "M8": ["AAPL", "MSFT", "AMZN", "GOOGL", "META", "NVDA", "JPM", "BAC", "WFC", "GS",
               "XOM", "CVX", "COP", "JNJ", "PFE", "MRK", "UNH", "ABT", "PG", "KO",
               "PEP", "WMT", "COST", "HD", "MCD", "NKE", "DIS", "CMCSA", "VZ", "T",
               "INTC", "CSCO", "ORCL", "IBM", "CAT", "DE", "BA", "HON", "MMM", "GE"],
        "CSI": ["SPY", "XLF", "XLE", "XLK", "XLU", "XLP", "XLY", "XLI", "XLB", "XLV",
                "IYR", "TLT", "GLD", "EFA", "EEM"],
    })

    # --- loop ---
    max_attempts: int = _env("NEXUS_MAX_ATTEMPTS", 4)       # v1 + up to 3 repairs
    agents_enabled: tuple = ("M6", "M8", "M9", "M10", "M11")
    cycle_sleep_s: float = _env("NEXUS_CYCLE_SLEEP", 2.0)

    # --- sandbox ---
    sandbox_timeout_s: int = _env("NEXUS_SANDBOX_TIMEOUT", 180)
    sandbox_cpu_s: int = _env("NEXUS_SANDBOX_CPU", 240)
    lookahead_cuts: tuple = (0.6, 0.85)                    # fractions of research window
    lookahead_tol: float = 1e-6

    # --- backtest / gates (SLP) ---
    cost_bps: float = _env("NEXUS_COST_BPS", 5.0)
    max_gross: float = _env("NEXUS_MAX_GROSS", 2.0)
    min_sharpe: float = _env("NEXUS_MIN_SHARPE", 0.6)
    min_dsr: float = _env("NEXUS_MIN_DSR", 0.5)
    max_drawdown: float = _env("NEXUS_MAX_DD", -0.35)
    min_split_half: float = _env("NEXUS_MIN_SPLIT", 0.2)
    min_alpha: float = _env("NEXUS_MIN_ALPHA", 0.0)
    min_holdout_sharpe: float = _env("NEXUS_MIN_HOLDOUT_SHARPE", 0.0)

    # --- server ---
    cors_origins: tuple = ("http://localhost:5173", "http://127.0.0.1:5173")

    def ensure_dirs(self):
        for p in (self.data_dir, self.cache_dir, self.export_dir):
            p.mkdir(parents=True, exist_ok=True)


CONFIG = Config()
