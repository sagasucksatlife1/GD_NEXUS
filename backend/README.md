# NEXUS Backend

An autonomous strategy research loop with two agents. The event log it writes is the contract the React terminal reads.

```
GENERATE → SANDBOX → REJECT → DIAGNOSE → PATCH → RE-BACKTEST → VERDICT
   (M6 / M8)   static · runtime · contract · causal audit · SLP gates · sealed holdout
```

## Setup

```bash
cd nexus-backend
python3 -m venv .venv && source .venv/bin/activate    # use a venv; the sandbox subprocess relies on it
pip install -r requirements.txt
ollama pull qwen3:8b
```

## Run

```bash
# 1. Smoke test (no Ollama, no internet, about 1 min). If this passes, everything is wired correctly.
NEXUS_LLM=mock NEXUS_SYNTHETIC=1 python -m nexus.run --cycles 4

# 2. Real headless run
rm -f data/events.jsonl
python -m nexus.run --cycles 10

# 3. Live mode for the terminal (daemon + API)
uvicorn nexus.server:app --port 8000
curl -X POST localhost:8000/api/csi/rebuild
curl -X POST localhost:8000/api/control/start

# 4. Archive mode for Vercel
python scripts/export.py --out ../nexus-frontend/public/data --csi
```

## Porting your old code

1. **Prompts.** Paste the original Model 6 and Model 8 system prompts into `PERSONA_PROMPT` in `nexus/agents/personas.py`. Keep the contract and output format that get appended to them.
2. **Old and rejected strategies.** Drop the files into `legacy/M6/` and `legacy/M8/`. A sibling `.md` file or the module docstring is read as the thesis. Then run `python scripts/seed_legacy.py`.
   - Old code doesn't need to match the new contract.
   - The sandbox rejects it, and the repair agent ports it.
   - The original always remains as v1 in the terminal.
   - See `legacy/_example/`.

## Strategy contract

A strategy is `generate_signals(prices) -> weights` with the same index as `prices`.
- Row t may only use data up to close t; the engine holds the position t→t+1.
- Gross exposure must be ≤ 2 and the output must contain no NaN.
- Only numpy, pandas, scipy, sklearn, and statsmodels are allowed. See `CONTRACT` in `sandbox.py`.

## The gates (Strategy Lifecycle Protocol)

| Stage | Rejects as | How |
|---|---|---|
| Static | `syntax`, `runtime` | AST parse, import whitelist, banned builtins/attrs |
| Runtime | `runtime` | Separate process, CPU limit, timeout, traceback → failing line |
| Contract | `runtime`, `risk_limit` | Index match, no NaN, gross ≤ 2, trades at all |
| **Causal audit** | `lookahead` | Re-runs the strategy on data truncated at 60% and 85%; any past weight that changes means it used the future |
| Research gates | `perf_bar`, `risk_limit` | Sharpe, **Deflated Sharpe** (every version ever tested counts as a trial), split-half, exposure-matched alpha, max DD |
| **Sealed holdout** | final verdict | 2022+ data, touched once, only after all gates pass. A failure here is DEAD with no repair, since repairing against the holdout would contaminate it |

Data window: the loop only sees data through 2021-12-31. All thresholds are env-overridable (`nexus/config.py`).

## API (Live mode)

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Status of Ollama, sandbox, daemon, and last error |
| `GET /api/summary` | Home counters, per-agent stats, failure taxonomy, current CSI |
| `GET /api/events?after=evt_000120` | Poll every 1–2 s; drives the pipeline board and animations |
| `GET /api/strategies`, `/api/strategies/{id}` | Dossiers with version timelines |
| `GET /api/rejections?agent=&error_type=` | Rejection console: rejected code, thesis, diagnosis, patch diff, patched result |
| `GET /api/csi`, `POST /api/csi/rebuild` | Complexity State Index |
| `GET/PATCH /api/control`, `POST /api/control/start\|pause\|stop` | Control panel |

## Event sequence per version

```
generated(v1) | patch(vN)
  sandbox fail  → sandbox_reject(vN)
  sandbox pass  → rebacktest(vN) → gates fail → sandbox_reject(vN, with stats)
                                 → gates pass → verdict VALIDATED | DEAD (holdout)
  after reject  → vN < max → verdict RETRY(vN) → diagnosis(vN) → patch(vN+1)
                → else     → verdict DEAD(vN)
```

Payload additions to the frozen contract (all additive):
- `generated`: `name`, `source`
- `sandbox_reject`: `traceback`
- `rebacktest`: `stats` also carries `ann_vol`, `beta`, `alpha_ann`, `alpha_t`, `turnover_ann`, `avg_gross`, `n_trials`
- `patch`: `parent_version`
- `verdict`: `cause_of_death`, `holdout`, `attempts`

## demo-data/

This is a real export from a mock + synthetic run: 107 events, and every rejection type except syntax appears. Copy it to `nexus-frontend/public/data/` and build against it now. **It is synthetic data. Never show those numbers as results.**

## Honest limits

- The sandbox gives process isolation plus a static policy. That is fine for a local LLM, but it is not a hardened boundary. For that, wrap `runner.py` in `docker run --network none`.
- CSI orientation and weights are v1 modelling choices; calibrate them in Phase 2.
- On Apple Silicon, qwen3:8b takes roughly 20–60 s per generation or repair.
