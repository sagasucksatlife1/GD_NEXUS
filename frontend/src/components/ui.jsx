import React from "react";
import { REGIME, VERDICT, AGENT, ERROR_TYPE, EVENT } from "../lib/format";

/* ------------------------------------------------------------------ icons */
const P = {
  pipeline: "M3 12h4l3-8 4 16 3-8h4",
  reject: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-6.3 2.7 12.6 12.6",
  file: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8l-5-5Zm0 0v5h5M8 13h8M8 17h5",
  agent: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  grave: "M7 21V10a5 5 0 0 1 10 0v11M4 21h16M12 11v5M10 13h4",
  chart: "M4 20V4M4 20h16M8 16l4-5 3 3 5-7",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Zm0 14a2 2 0 0 1 2-2h13",
  paper: "M7 3h10l3 3v15H4V3h3Zm2 6h6M9 13h6M9 17h4",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4",
  play: "M7 4v16l13-8L7 4Z",
  pause: "M7 4h3v16H7zM14 4h3v16h-3z",
  stop: "M6 6h12v12H6z",
  back: "M11 5 4 12l7 7M4 12h16",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 5 5",
  skull: "M12 3a8 8 0 0 0-5 14.2V20h10v-2.8A8 8 0 0 0 12 3Zm-3 9h.01M15 12h.01M10 20v-2M14 20v-2",
  arrow: "M5 12h14M13 6l6 6-6 6",
  home: "M4 11 12 4l8 7v9h-5v-6H9v6H4v-9Z",
  github: "M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  refresh: "M20 11A8 8 0 1 0 18 17M20 4v7h-7",
  x: "M6 6l12 12M18 6 6 18",
};

export function Icon({ name, size = 15, stroke = 1.7, className = "", style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      <path d={P[name] || P.file} />
    </svg>
  );
}

/* ------------------------------------------------------------------ layout */
export function Panel({ title, sub, right, children, flush = false, className = "", style, testId }) {
  return (
    <section className={`panel ${className}`} style={style} data-testid={testId}>
      {(title || right) && (
        <header className="panel-head">
          <div style={{ minWidth: 0 }}>
            {title && <h3 className="panel-title">{title}</h3>}
            {sub && <div className="panel-sub">{sub}</div>}
          </div>
          <div className="spacer" />
          {right}
        </header>
      )}
      <div className={`panel-body ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}

export function PageHead({ title, desc, right }) {
  return (
    <div className="page-head">
      <div style={{ minWidth: 0 }}>
        <h1 className="page-title">{title}</h1>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      <div className="spacer" />
      {right}
    </div>
  );
}

export function Stat({ label, value, sub, accent, testId }) {
  return (
    <div className="stat" style={{ "--accent": accent }} data-testid={testId}>
      <div className="label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */
export function Badge({ color, children, dot = false, pulse = false, title, testId }) {
  return (
    <span className="badge" style={{ "--c": color }} title={title} data-testid={testId}>
      {dot && <span className={`dot ${pulse ? "pulse" : ""}`} />}
      {children}
    </span>
  );
}

export function StateBadge({ state, pulse = false }) {
  if (!state) return <Badge color="#475569">no csi</Badge>;
  return <Badge color={REGIME[state]?.color || "#475569"} dot pulse={pulse} testId={`regime-badge-${state.toLowerCase()}`}>{state}</Badge>;
}

export function StatusBadge({ status }) {
  const label = status === "IN_PROGRESS" ? "in progress" : status;
  return <Badge color={VERDICT[status] || "#6b7280"} dot={status === "IN_PROGRESS"} pulse={status === "IN_PROGRESS"}>{label}</Badge>;
}

export function AgentBadge({ agent, full = false }) {
  const a = AGENT[agent];
  return (
    <Badge color={a?.color || "#64748b"} testId={`agent-badge-${(agent || "").toLowerCase()}`}>
      {agent}{full && a ? <span style={{ color: "var(--muted)", textTransform: "none", letterSpacing: 0, fontWeight: 400 }}> {a.name}</span> : null}
    </Badge>
  );
}

export function ErrorTag({ type }) {
  const m = ERROR_TYPE[type] || { label: type || "error", color: "#fb923c" };
  return <Badge color={m.color}>{m.label}</Badge>;
}

export function EventTag({ type }) {
  const m = EVENT[type] || { label: type, color: "#64748b" };
  return <span className="mono" style={{ color: m.color, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em" }}>{m.label}</span>;
}

export function Stamp({ verdict, slam = false }) {
  const color = VERDICT[verdict] || "#6b7280";
  return <span className={`stamp ${slam ? "slam" : ""}`} style={{ "--c": color }} data-testid={`verdict-stamp-${(verdict || "").toLowerCase()}`}>{verdict}</span>;
}

/* ------------------------------------------------------------------ states */
export function Loading({ label = "Loading" }) {
  return (
    <div className="state-box" data-testid="loading-state">
      <div className="spinner" />
      <p>{label}</p>
    </div>
  );
}

export function ErrorBox({ message, onRetry, action }) {
  return (
    <div className="state-box" data-testid="error-state">
      <Icon name="reject" size={26} style={{ color: "var(--red)" }} />
      <p style={{ color: "#fca5a5" }}>{message}</p>
      <div className="row">
        {onRetry && <button className="btn" onClick={onRetry}><Icon name="refresh" size={13} /> Retry</button>}
        {action}
      </div>
    </div>
  );
}

export function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="state-box" data-testid="empty-state">
      <div className="label">{title}</div>
      {children && <p>{children}</p>}
    </div>
  );
}

export class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null }); }
  render() {
    if (this.state.err) {
      return (
        <div className="panel"><ErrorBox message={`This panel crashed: ${this.state.err.message}`} onRetry={() => this.setState({ err: null })} /></div>
      );
    }
    return this.props.children;
  }
}

/* ------------------------------------------------------------------ stats table */
export function StatsGrid({ stats, holdout }) {
  if (!stats) return <Empty title="No backtest">This version never reached the backtest.</Empty>;
  const rows = [
    ["Sharpe", stats.sharpe?.toFixed?.(2)],
    ["Deflated Sharpe", stats.dsr?.toFixed?.(3)],
    ["Ann. return", fmtP(stats.ann_ret)],
    ["Ann. vol", fmtP(stats.ann_vol)],
    ["Max drawdown", fmtP(stats.maxdd)],
    ["Split-half Sharpe", stats.split_half ? stats.split_half.map((x) => x?.toFixed?.(2) ?? "—").join(" / ") : "—"],
    ["Beta to universe", stats.beta?.toFixed?.(2)],
    ["Alpha (ann.)", fmtP(stats.alpha_ann)],
    ["Alpha t-stat", stats.alpha_t?.toFixed?.(2)],
    ["Turnover (ann.)", stats.turnover_ann != null ? `${stats.turnover_ann.toFixed(0)}x` : "—"],
    ["Trials counted", stats.n_trials],
    ["Window", stats.start ? `${stats.start} → ${stats.end}` : "—"],
  ];
  return (
    <table className="data">
      <thead><tr><th>Metric</th><th className="num">Research</th>{holdout && <th className="num">Sealed holdout</th>}</tr></thead>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td className="dim">{k}</td>
            <td className="num">{v ?? "—"}</td>
            {holdout && <td className="num">{holdoutValue(k, holdout)}</td>}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function fmtP(x) {
  return typeof x === "number" ? `${(x * 100).toFixed(1)}%` : "—";
}

function holdoutValue(k, h) {
  const map = {
    "Sharpe": h.sharpe?.toFixed?.(2), "Deflated Sharpe": h.dsr?.toFixed?.(3), "Ann. return": fmtP(h.ann_ret),
    "Ann. vol": fmtP(h.ann_vol), "Max drawdown": fmtP(h.maxdd),
    "Split-half Sharpe": h.split_half ? h.split_half.map((x) => x?.toFixed?.(2) ?? "—").join(" / ") : "—",
    "Beta to universe": h.beta?.toFixed?.(2), "Alpha (ann.)": fmtP(h.alpha_ann), "Alpha t-stat": h.alpha_t?.toFixed?.(2),
    "Turnover (ann.)": h.turnover_ann != null ? `${h.turnover_ann.toFixed(0)}x` : "—", "Trials counted": h.n_trials,
    "Window": h.start ? `${h.start} → ${h.end}` : "—",
  };
  return map[k] ?? "—";
}
