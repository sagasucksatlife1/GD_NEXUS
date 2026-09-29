import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "../lib/router";
import { useData } from "../lib/data";
import { Icon, StateBadge, ErrorBoundary, Loading, ErrorBox } from "./ui";
import { AGENT, ERROR_TYPE, clock, prettyName } from "../lib/format";

export const NAV = [
  { group: "Loop" },
  { to: "/terminal", label: "Pipeline monitor", icon: "pipeline", exact: true, key: "pipeline" },
  { to: "/terminal/rejections", label: "Rejection console", icon: "reject", key: "rejections" },
  { to: "/terminal/dossiers", label: "Strategy dossiers", icon: "file", key: "dossiers" },
  { group: "Agents" },
  { to: "/terminal/agents/M6", label: "M6 stat-arb", icon: "agent", key: "m6" },
  { to: "/terminal/agents/M8", label: "M8 ML engineer", icon: "agent", key: "m8" },
  { group: "Markets" },
  { to: "/terminal/observatory", label: "Observatory", icon: "eye", key: "observatory" },
  { to: "/terminal/portfolio", label: "Portfolio", icon: "chart", key: "portfolio" },
  { to: "/terminal/graveyard", label: "Graveyard", icon: "grave", key: "graveyard" },
  { group: "Reference" },
  { to: "/terminal/library", label: "Library", icon: "book", key: "library" },
  { to: "/terminal/research", label: "Research", icon: "paper", key: "research" },
  { to: "/terminal/control", label: "Control panel", icon: "sliders", key: "control" },
];

/* ------------------------------------------------------------------ replay */
export function ReplayControls() {
  const { replay, visible } = useData();
  const { cursor, setCursor, playing, setPlaying, play, speed, setSpeed, total } = replay;
  const at = visible[visible.length - 1];
  return (
    <div className="transport" data-testid="replay-controls">
      <button className="btn sm" onClick={() => (playing ? setPlaying(false) : play())} data-testid="replay-play"
        aria-label={playing ? "Pause replay" : "Play replay"} title={playing ? "Pause" : cursor >= total ? "Replay from start" : "Play"}>
        <Icon name={playing ? "pause" : "play"} size={12} />
      </button>
      <input type="range" min={0} max={total} value={cursor} onChange={(e) => { setPlaying(false); setCursor(+e.target.value); }}
        aria-label="Replay position" data-testid="replay-scrubber-slider" />
      <span className="mono tnum hide-sm" style={{ fontSize: 10.5, color: "var(--muted)", minWidth: 110 }}>
        {cursor}/{total} {at ? clock(at.timestamp) : ""}
      </span>
      <div className="seg">
        {[1, 10, 100].map((s) => (
          <button key={s} className={speed === s ? "on-replay" : ""} onClick={() => setSpeed(s)} data-testid={`replay-speed-${s}x`}>{s}x</button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ status bar */
function Lights() {
  const { mode, live } = useData();
  if (mode !== "LIVE") return null;
  const h = live.health;
  const c = live.control;
  const on = (ok) => (ok == null ? "#475569" : ok ? "#10b981" : "#ef4444");
  const enabled = c?.agents_enabled || [];
  const running = c?.status === "running";
  return (
    <div className="row hide-sm" style={{ gap: 12 }}>
      {["M6", "M8"].map((a) => (
        <span key={a} className="light" style={{ "--c": enabled.includes(a) && running ? AGENT[a].color : "#475569" }} title={`${a} ${enabled.includes(a) ? "enabled" : "disabled"}`}><i />{a}</span>
      ))}
      <span className="light" style={{ "--c": on(h?.llm?.ok) }} title={h?.llm?.error || h?.llm?.model || "LLM"}><i />LLM</span>
      <span className="light" style={{ "--c": on(h?.sandbox?.ok) }} title="Sandbox self-test"><i />SANDBOX</span>
    </div>
  );
}

export function StatusBar() {
  const { mode, setMode, csi, meta, setCmdOpen, live } = useData();
  const cur = csi?.current;
  return (
    <header className="statusbar">
      <Link to="/" className="brand" data-testid="brand-home-link"><span className="brand-dot" />NEXUS</Link>
      <div className="seg" role="group" aria-label="Data mode">
        <button className={mode === "LIVE" ? "on-live" : ""} onClick={() => setMode("LIVE")} data-testid="mode-toggle-live">● LIVE</button>
        <button className={mode === "REPLAY" ? "on-replay" : ""} onClick={() => setMode("REPLAY")} data-testid="mode-toggle-replay">REPLAY</button>
      </div>
      {mode === "REPLAY" && <ReplayControls />}
      {mode === "LIVE" && live.control?.current && (
        <span className="mono hide-sm" style={{ fontSize: 11, color: "var(--text-3)" }}>
          <span className="pulse" style={{ color: "var(--red)" }}>●</span> {live.control.current.agent} {live.control.current.stage}
          {live.control.current.version ? ` v${live.control.current.version}` : ""}
        </span>
      )}
      <div className="spacer" />
      {meta?.synthetic && <span className="demo-flag" title="This archive was produced with the mock LLM on synthetic prices">DEMO DATA</span>}
      {cur && (
        <div className="row hide-sm" title={`CSI on ${cur.date}`}>
          <span className="label">CSI</span>
          <span className="mono tnum" style={{ fontWeight: 700 }}>{Math.round(cur.csi * 100)}</span>
          <StateBadge state={cur.state} pulse />
        </div>
      )}
      <Lights />
      <button className="btn sm" onClick={() => setCmdOpen(true)} data-testid="cmd-k-trigger" aria-label="Open command palette">
        <Icon name="search" size={12} /> <span className="kbd">⌘K</span>
      </button>
    </header>
  );
}

/* ------------------------------------------------------------------ nav */
function NavRail() {
  const { summary, rejections } = useData();
  const counts = {
    pipeline: summary.inProgress || null,
    rejections: rejections.length,
    dossiers: summary.lineages,
    graveyard: summary.dead,
    portfolio: summary.validated,
    m6: summary.agents.M6.lineages,
    m8: summary.agents.M8.lineages,
  };
  return (
    <nav className="navrail" aria-label="Terminal">
      {NAV.map((n, i) =>
        n.group ? <div key={`g${i}`} className="group">{n.group}</div> : (
          <Link key={n.to} to={n.to} exact={n.exact} className="navlink" activeClass="active" data-testid={`nav-${n.key}`}>
            <Icon name={n.icon} />{n.label}
            {counts[n.key] ? <span className="count tnum">{counts[n.key]}</span> : null}
          </Link>
        )
      )}
    </nav>
  );
}

export function TerminalLayout({ children }) {
  const { status, reload, mode, setMode } = useData();
  const { path } = useRouter();
  let body;
  if (status.loading) body = <Loading label={mode === "LIVE" ? "Connecting to the NEXUS daemon" : "Loading the archived run"} />;
  else if (status.error) {
    body = (
      <div className="panel">
        <ErrorBox message={status.error} onRetry={reload}
          action={mode === "LIVE" ? <button className="btn" onClick={() => setMode("REPLAY")}>Switch to replay</button> : null} />
      </div>
    );
  } else body = <ErrorBoundary resetKey={path}>{children}</ErrorBoundary>;
  return (
    <div className="term">
      <StatusBar />
      <div className="term-body">
        <NavRail />
        <main className="term-main">{body}</main>
      </div>
      <CommandPalette />
    </div>
  );
}

/* ------------------------------------------------------------------ command palette */
export function CommandPalette() {
  const { cmdOpen, setCmdOpen, lineages, rejections, setMode, mode } = useData();
  const { navigate } = useRouter();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const list = useRef(null);

  useEffect(() => {
    if (cmdOpen) { setQ(""); setSel(0); setTimeout(() => input.current?.focus(), 10); }
  }, [cmdOpen]);

  const items = useMemo(() => {
    const out = [];
    NAV.filter((n) => n.to).forEach((n) => out.push({ group: "Pages", label: n.label, hint: n.to, run: () => navigate(n.to) }));
    out.push({ group: "Pages", label: "Home: project story", hint: "/", run: () => navigate("/") });
    out.push({ group: "Actions", label: mode === "LIVE" ? "Switch to replay mode" : "Switch to live mode", hint: "mode", run: () => setMode(mode === "LIVE" ? "REPLAY" : "LIVE") });
    Object.keys(ERROR_TYPE).forEach((t) => out.push({ group: "Actions", label: `Filter rejections: ${ERROR_TYPE[t].label}`, hint: t, run: () => navigate(`/terminal/rejections?type=${t}`) }));
    lineages.forEach((L) => out.push({ group: "Strategies", label: prettyName(L), hint: `${L.agent} · ${L.status.toLowerCase()} · v${L.attempts}`, run: () => navigate(`/terminal/dossiers/${L.id}`) }));
    rejections.slice(0, 60).forEach((r) => out.push({
      group: "Rejections",
      label: `${prettyName(r.lineage)} v${r.event.version}: ${r.event.payload.error?.message?.slice(0, 60) || ""}`,
      hint: r.event.payload.error?.type, run: () => navigate(`/terminal/rejections?id=${r.event.event_id}`),
    }));
    const s = q.trim().toLowerCase();
    if (!s) return out.filter((x) => x.group !== "Rejections").slice(0, 40);
    return out.filter((x) => `${x.label} ${x.hint} ${x.group}`.toLowerCase().includes(s)).slice(0, 60);
  }, [q, lineages, rejections, navigate, setMode, mode]);

  useEffect(() => { setSel(0); }, [q]);
  useEffect(() => {
    const el = list.current?.querySelector(".cmdk-item.sel");
    el?.scrollIntoView({ block: "nearest" });
  }, [sel]);

  if (!cmdOpen) return null;
  const run = (it) => { setCmdOpen(false); it?.run(); };
  const onKey = (e) => {
    if (e.key === "Escape") setCmdOpen(false);
    else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(items.length - 1, s + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); run(items[sel]); }
  };
  let lastGroup = null;
  return (
    <div className="cmdk-backdrop" onMouseDown={() => setCmdOpen(false)}>
      <div className="cmdk" role="dialog" aria-label="Command palette" onMouseDown={(e) => e.stopPropagation()}>
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
          placeholder="Jump to a page, strategy or rejection…" data-testid="cmd-k-search-input" />
        <div className="cmdk-list" ref={list}>
          {!items.length && <div className="cmdk-item muted">No matches for “{q}”</div>}
          {items.map((it, i) => {
            const head = it.group !== lastGroup ? <div className="cmdk-group">{it.group}</div> : null;
            lastGroup = it.group;
            return (
              <React.Fragment key={`${it.group}-${i}`}>
                {head}
                <div className={`cmdk-item ${i === sel ? "sel" : ""}`} onMouseEnter={() => setSel(i)} onClick={() => run(it)}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.label}</span>
                  <span className="hint">{it.hint}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
