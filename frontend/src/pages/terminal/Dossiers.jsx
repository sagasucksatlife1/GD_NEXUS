import { ALL_AGENTS } from "../../lib/format";
import React, { useEffect, useMemo, useState } from "react";
import { useData } from "../../lib/data";
import { Link, useRouter } from "../../lib/router";
import { PageHead, Panel, AgentBadge, StatusBadge, ErrorTag, Empty, Stamp, StatsGrid, EventTag, Icon, Badge } from "../../components/ui";
import { CodeBlock, DiffView } from "../../components/code";
import { LineChart, Sparkline } from "../../components/charts";
import { VERDICT, time, clock, prettyName, num } from "../../lib/format";

export function DossierList() {
  const { lineages } = useData();
  const { navigate } = useRouter();
  const [agent, setAgent] = useState("");
  const [status, setStatus] = useState("");
  const rows = lineages.filter((l) => (!agent || l.agent === agent) && (!status || l.status === status));
  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead title="Strategy dossiers" desc="One dossier per lineage. A lineage is the original idea plus every repaired version of it." />
      <div className="row-wrap">
        {["", ...ALL_AGENTS].map((a) => <button key={a || "all"} className={`chip ${agent === a ? "on" : ""}`} onClick={() => setAgent(a)}>{a || "All agents"}</button>)}
        <span style={{ width: 10 }} />
        {["", "IN_PROGRESS", "VALIDATED", "DEAD"].map((s) => (
          <button key={s || "all"} className={`chip ${status === s ? "on" : ""}`} style={{ "--c": VERDICT[s] }} onClick={() => setStatus(s)}>
            {s ? s.replace("_", " ").toLowerCase() : "Any status"}
          </button>
        ))}
      </div>
      <Panel flush>
        {!rows.length ? <Empty title="No dossiers match" /> : (
          <div className="scroll-x">
            <table className="data" data-testid="dossier-table">
              <thead><tr><th>Strategy</th><th>Agent</th><th>Status</th><th className="num">Versions</th><th className="num">Sharpe</th><th className="num">Deflated SR</th><th>Equity</th><th>Updated</th></tr></thead>
              <tbody>
                {rows.map((L) => (
                  <tr key={L.id} className="clickable" onClick={() => navigate(`/terminal/dossiers/${L.id}`)}>
                    <td style={{ color: "var(--text)" }}>{prettyName(L)}{L.source === "legacy" && <span className="amber" style={{ fontSize: 10, marginLeft: 6 }}>legacy</span>}{L.source === "reference" && <span style={{ fontSize: 10, marginLeft: 6, color: "#10b981" }}>reference</span>}</td>
                    <td><AgentBadge agent={L.agent} /></td>
                    <td><StatusBadge status={L.status} /></td>
                    <td className="num">{L.attempts}</td>
                    <td className="num">{num(L.best?.stats?.sharpe)}</td>
                    <td className="num">{num(L.best?.stats?.dsr, 3)}</td>
                    <td><Sparkline values={L.best?.equity?.values} color={L.status === "VALIDATED" ? "#10b981" : "#64748b"} /></td>
                    <td className="muted">{time(L.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function VersionTimeline({ versions, active, onSelect }) {
  const color = (v) => VERDICT[v.status] || "#6b7280";
  return (
    <div className="vt" data-testid="version-timeline">
      {versions.map((v, i) => (
        <React.Fragment key={v.version}>
          <button className={`vt-node ${active === v.version ? "active" : ""}`} style={{ "--c": color(v) }} onClick={() => onSelect(v.version)} data-testid={`version-node-v${v.version}`}>
            <span className="vt-dot">v{v.version}</span>
            <span className="vt-lbl">{v.status.toLowerCase()}</span>
          </button>
          {i < versions.length - 1 && <span className="vt-wire" style={{ background: `linear-gradient(90deg, ${color(v)}, ${color(versions[i + 1])})` }} />}
        </React.Fragment>
      ))}
    </div>
  );
}

export function DossierDetail({ id }) {
  const { byId } = useData();
  const L = byId.get(id);
  const [active, setActive] = useState(null);
  const [tab, setTab] = useState("code");

  useEffect(() => { setActive(null); }, [id]);
  const versions = L?.versions || [];
  const V = useMemo(() => versions.find((v) => v.version === active) || L?.best || versions[versions.length - 1], [versions, active, L]);

  if (!L) {
    return (
      <Panel><Empty title="Lineage not found">
        It may not exist yet at this replay position. <Link to="/terminal/dossiers" className="sky">Back to all dossiers</Link>
      </Empty></Panel>
    );
  }

  const tabs = [["code", "Code"], ["diff", "Patch diff"], ["backtest", "Backtest"], ["events", "Event log"]];
  return (
    <div className="col" style={{ gap: 12 }}>
      <Link to="/terminal/dossiers" className="mono muted row" style={{ fontSize: 12 }}><Icon name="back" size={13} /> All dossiers</Link>
      <div className="panel" style={{ padding: 16 }}>
        <div className="row-wrap" style={{ gap: 12 }}>
          <AgentBadge agent={L.agent} full />
          {L.source === "legacy" && <Badge color="#f59e0b">imported from ai-hedge-fund</Badge>}{L.source === "reference" && <Badge color="#10b981">reference strategy · published method</Badge>}
          <span className="spacer" />
          {L.status !== "IN_PROGRESS" ? <Stamp verdict={L.status} /> : <StatusBadge status={L.status} />}
        </div>
        <h1 className="mono" style={{ fontSize: 22, fontWeight: 700, marginTop: 10, wordBreak: "break-word" }}>{prettyName(L)}</h1>
        <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{L.id} · created {time(L.created_at)}</div>
        <p className="prose" style={{ marginTop: 12 }}>{L.thesis}</p>
        {L.status === "DEAD" && <p className="mono" style={{ marginTop: 10, color: "#fca5a5", fontSize: 12.5 }}>Cause of death: {L.cause_of_death}</p>}
      </div>

      <Panel title="Version lineage" sub="click a version">
        <VersionTimeline versions={versions} active={V?.version} onSelect={(v) => { setActive(v); }} />
      </Panel>

      {V && (
        <Panel
          title={`Version ${V.version}`}
          sub={V.error ? V.error.message : V.status === "PASSED" ? "passed every gate" : V.status.toLowerCase()}
          right={<div className="seg">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "on-replay" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>}
        >
          {tab === "code" && (
            <div className="col" style={{ gap: 10 }}>
              {V.error && <div className="row-wrap"><ErrorTag type={V.error.type} /><span className="mono" style={{ fontSize: 12, color: "#fca5a5" }}>{V.error.message}</span></div>}
              <CodeBlock code={V.code} highlightLine={V.error?.line} maxHeight={560} />
              {V.diagnosis && (
                <div style={{ borderLeft: "2px solid var(--violet)", paddingLeft: 12 }}>
                  <div className="label" style={{ marginBottom: 4 }}>Diagnosis of v{V.version}</div>
                  <p className="prose" style={{ fontSize: 13.5 }}>{V.diagnosis}</p>
                </div>
              )}
            </div>
          )}
          {tab === "diff" && (V.diff ? <DiffView diff={V.diff} maxHeight={560} /> : <Empty title="No diff">v1 is the original generation, there is nothing to compare against.</Empty>)}
          {tab === "backtest" && (
            <div className="col" style={{ gap: 12 }}>
              {V.equity?.values?.length > 2 ? (
                <LineChart
                  dates={V.holdout?.equity ? [...V.equity.dates, ...V.holdout.equity.dates] : V.equity.dates}
                  series={[
                    { key: "r", name: "Research window", color: "#38bdf8", values: V.equity.values },
                    ...(V.holdout?.equity ? [{ key: "h", name: "Sealed holdout (rebased)", color: "#10b981",
                      values: [...V.equity.values.map(() => null), ...V.holdout.equity.values.map((x) => x * V.equity.values[V.equity.values.length - 1])] }] : []),
                  ]}
                  height={280} yFormat={(v) => v.toFixed(2)}
                />
              ) : <Empty title="No equity curve">This version was rejected before it reached the backtest.</Empty>}
              <StatsGrid stats={V.stats} holdout={V.holdout?.stats} />
            </div>
          )}
          {tab === "events" && (
            <table className="data">
              <thead><tr><th>Time</th><th>Event</th><th>Version</th><th>Detail</th></tr></thead>
              <tbody>
                {L.events.map((e) => (
                  <tr key={e.event_id}>
                    <td className="muted">{clock(e.timestamp)}</td>
                    <td><EventTag type={e.event_type} /></td>
                    <td>v{e.version}</td>
                    <td style={{ maxWidth: 520, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.payload.verdict || e.payload.error?.message || (e.payload.stats ? `Sharpe ${num(e.payload.stats.sharpe)}, DSR ${num(e.payload.stats.dsr, 3)}` : "") || e.payload.diagnosis || e.payload.name || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      )}
    </div>
  );
}
