export const REGIMES = ["LAMINAR", "TRANSITIONAL", "TURBULENT", "CRITICAL"];

export const REGIME = {
  LAMINAR: { color: "#10b981", desc: "Calm structure, strategies allowed to trade" },
  TRANSITIONAL: { color: "#3b82f6", desc: "State is shifting, reduced conviction" },
  TURBULENT: { color: "#f59e0b", desc: "High disorder, defensive" },
  CRITICAL: { color: "#ef4444", desc: "System stress, abstain" },
};

export const VERDICT = {
  VALIDATED: "#10b981",
  PASSED: "#10b981",
  REJECTED: "#ef4444",
  RETRY: "#f59e0b",
  DEAD: "#6b7280",
  PENDING: "#38bdf8",
  TESTED: "#eab308",
  IN_PROGRESS: "#38bdf8",
};

export const ERROR_TYPE = {
  syntax: { label: "Syntax", color: "#a78bfa" },
  runtime: { label: "Runtime", color: "#fb923c" },
  lookahead: { label: "Look-ahead", color: "#ef4444" },
  risk_limit: { label: "Risk limit", color: "#eab308" },
  perf_bar: { label: "Perf bar", color: "#f59e0b" },
};

export const EVENT = {
  generated: { label: "generated", color: "#38bdf8" },
  sandbox_reject: { label: "sandbox reject", color: "#ef4444" },
  diagnosis: { label: "diagnosis", color: "#c084fc" },
  patch: { label: "patch", color: "#3b82f6" },
  rebacktest: { label: "backtest", color: "#eab308" },
  verdict: { label: "verdict", color: "#10b981" },
};

export const AGENT = {
  M6: { name: "quant_stat_arb", method: "Synthetic Fair-Value Spread", color: "#38bdf8",
        philosophy: "Price an asset against a synthetic twin built from its peers, trade the gap when it stretches." },
  M8: { name: "quant_ml_engineer", method: "3-Feature Orthogonal Ensemble", color: "#c084fc",
        philosophy: "Three unrelated signals, made orthogonal, learned walk-forward. No single feature dominates." },
  M9: { name: "regime_architect", method: "Causal Regime-Switching Allocator", color: "#f59e0b",
        philosophy: "Read the market state from correlation, dispersion and breadth, then run the sleeve that fits it." },
  M10: { name: "lead_lag_networker", method: "Information-Diffusion Network", color: "#22d3ee",
         philosophy: "News reaches leaders first. Trade the followers before they catch up." },
  M11: { name: "behavioral_anchor", method: "Anchoring & Attention Anomalies", color: "#f472b6",
         philosophy: "52-week-high anchoring, lottery demand, frog-in-the-pan: trade the biases that persist." },
  REF: { name: "reference_book", method: "Published strategies (not agent output)", color: "#10b981",
         philosophy: "Well-known published methods, run through the same sandbox and holdout, as the base book." },
};

/** LLM agents (generate strategies). REF is the reference book and is not an agent. */
export const AGENT_CODES = ["M6", "M8", "M9", "M10", "M11"];
export const ALL_AGENTS = [...AGENT_CODES, "REF"];

export const COLUMNS = [
  { id: "GENERATED", label: "Generated", color: "#38bdf8" },
  { id: "SANDBOX", label: "In sandbox", color: "#eab308" },
  { id: "REJECTED", label: "Rejected", color: "#ef4444" },
  { id: "REPAIR", label: "In repair", color: "#c084fc" },
  { id: "RETEST", label: "Re-testing", color: "#3b82f6" },
  { id: "VALIDATED", label: "Validated", color: "#10b981" },
  { id: "DEAD", label: "Dead", color: "#6b7280" },
];

const isNum = (x) => typeof x === "number" && Number.isFinite(x);

export const num = (x, d = 2) => (isNum(x) ? x.toFixed(d) : "—");
export const int = (x) => (isNum(x) ? Math.round(x).toLocaleString("en-US") : "—");
export const pct = (x, d = 1) => (isNum(x) ? `${x > 0 ? "+" : ""}${(x * 100).toFixed(d)}%` : "—");
export const pctAbs = (x, d = 0) => (isNum(x) ? `${(x * 100).toFixed(d)}%` : "—");

export function time(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").replace("Z", "").slice(0, 19);
}

export function clock(iso) {
  if (!iso) return "—";
  return iso.slice(11, 19);
}

export function ago(iso) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function shortId(id = "") {
  return id.length > 34 ? `${id.slice(0, 31)}…` : id;
}

export function prettyName(L) {
  if (!L) return "";
  return (L.name || L.id || "").replace(/-/g, " ");
}
