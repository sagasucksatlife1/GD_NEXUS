import { ALL_AGENTS } from "../../lib/format";
import React, { useMemo } from "react";
import { useData } from "../../lib/data";
import { Link, useQuery, useRouter } from "../../lib/router";
import { PageHead, Panel, AgentBadge, ErrorTag, Empty, Badge, StatsGrid } from "../../components/ui";
import { CodeBlock, DiffView, diffCounts } from "../../components/code";
import { LineChart } from "../../components/charts";
import { ERROR_TYPE, clock, prettyName, num } from "../../lib/format";

const OUTCOME = {
  repaired: { label: "Repaired and passed", color: "#10b981" },
  failed_again: { label: "Patched, failed again", color: "#f59e0b" },
  retesting: { label: "Patch in sandbox", color: "#3b82f6" },
  repairing: { label: "Repair in progress", color: "#c084fc" },
  died: { label: "Died here", color: "#6b7280" },
};

export default function Rejections() {
  const { rejections, mode } = useData();
  const q = useQuery();
  const { navigate } = useRouter();
  const agent = q.get("agent") || "";
  const type = q.get("type") || "";
  const outcome = q.get("outcome") || "";
  const id = q.get("id");

  const setParam = (k, v) => {
    const p = new URLSearchParams(q);
    if (v) p.set(k, v); else p.delete(k);
    navigate(`/terminal/rejections?${p.toString()}`, { replace: true });
  };

  const list = useMemo(() => rejections.filter((r) =>
    (!agent || r.event.agent === agent) &&
    (!type || r.event.payload.error?.type === type) &&
    (!outcome || r.outcome === outcome)
  ), [rejections, agent, type, outcome]);

  const selected = list.find((r) => r.event.event_id === id) || list[0] || null;

  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead title="Rejection console"
        desc="Every piece of code the sandbox denied, kept exactly as it was. For each one: what it was trying to do, why it failed, the patch the repair agent wrote, and what happened next." />

      <div className="row-wrap" data-testid="rejection-filters">
        <span className="label">Agent</span>
        {["", ...ALL_AGENTS].map((a) => (
          <button key={a || "all"} className={`chip ${agent === a ? "on" : ""}`} onClick={() => setParam("agent", a)}>{a || "All"}</button>
        ))}
        <span className="label" style={{ marginLeft: 10 }}>Gate</span>
        <button className={`chip ${!type ? "on" : ""}`} onClick={() => setParam("type", "")}>All</button>
        {Object.entries(ERROR_TYPE).map(([k, m]) => (
          <button key={k} className={`chip ${type === k ? "on" : ""}`} style={{ "--c": m.color }} onClick={() => setParam("type", k)} data-testid={`filter-type-${k}`}>{m.label}</button>
        ))}
        <span className="label" style={{ marginLeft: 10 }}>Outcome</span>
        <select className="chip" value={outcome} onChange={(e) => setParam("outcome", e.target.value)} style={{ background: "var(--card)" }} aria-label="Filter by outcome">
          <option value="">All</option>
          {Object.entries(OUTCOME).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
        </select>
      </div>

      {!rejections.length ? (
        <Panel><Empty title="No rejections yet">{mode === "LIVE" ? "The first sandbox rejection will show up here within seconds of it happening." : "Scrub the replay forward, rejections appear as the run progresses."}</Empty></Panel>
      ) : (
        <div className="rc">
          <Panel title={`${list.length} rejections`} flush>
            <div className="rc-list" data-testid="rejection-list">
              {!list.length && <Empty title="No matches">Clear a filter to see more.</Empty>}
              {list.map((r) => {
                const e = r.event;
                const sel = selected?.event.event_id === e.event_id;
                return (
                  <button key={e.event_id} className={`rc-item ${sel ? "sel" : ""}`} onClick={() => setParam("id", e.event_id)} data-testid={`rejection-item-${e.event_id}`}>
                    <div className="row" style={{ gap: 6 }}>
                      <AgentBadge agent={e.agent} />
                      <ErrorTag type={e.payload.error?.type} />
                      <span className="spacer" />
                      <span className="mono muted" style={{ fontSize: 10 }}>{clock(e.timestamp)}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 12, color: "var(--text)", margin: "5px 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {prettyName(r.lineage)} <span className="muted">v{e.version}</span>
                    </div>
                    <div className="mono" style={{ fontSize: 10.5, color: "#fca5a5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.payload.error?.message}</div>
                    <div className="mono" style={{ fontSize: 10, color: OUTCOME[r.outcome].color, marginTop: 3 }}>{OUTCOME[r.outcome].label}</div>
                  </button>
                );
              })}
            </div>
          </Panel>
          {selected ? <Detail r={selected} /> : <Panel><Empty title="Select a rejection" /></Panel>}
        </div>
      )}
    </div>
  );
}

function Detail({ r }) {
  const e = r.event;
  const err = e.payload.error || {};
  const code = e.payload.code || r.version?.code;
  const next = r.next;
  const counts = next?.diff ? diffCounts(next.diff) : null;
  return (
    <div className="col" style={{ gap: 12, minWidth: 0 }} data-testid="rejection-detail">
      <div className="panel" style={{ padding: "12px 14px" }}>
        <div className="row-wrap">
          <AgentBadge agent={e.agent} full />
          <Link to={`/terminal/dossiers/${r.lineage.id}`} className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{prettyName(r.lineage)}</Link>
          <span className="mono muted">v{e.version}</span>
          {r.lineage.source === "legacy" && <Badge color="#f59e0b">legacy import</Badge>}
          <span className="spacer" />
          <Badge color={OUTCOME[r.outcome].color} dot>{OUTCOME[r.outcome].label}</Badge>
        </div>
      </div>

      <div className="rc-panes">
        <Panel title="Denied code" sub={`v${e.version} · ${err.line ? `failed at line ${err.line}` : "failed a gate"}`} right={<ErrorTag type={err.type} />}>
          <div className="col" style={{ gap: 10 }}>
            <pre className="traceback" data-testid="rejection-error">{err.message}</pre>
            <CodeBlock code={code} highlightLine={err.line} maxHeight={420} testId="rejected-code" />
            {e.payload.traceback && (
              <details>
                <summary className="label" style={{ cursor: "pointer" }}>Full traceback</summary>
                <pre className="traceback" style={{ marginTop: 8 }}>{e.payload.traceback}</pre>
              </details>
            )}
          </div>
        </Panel>

        <Panel title="Diagnosis" sub="what it aimed for vs what it did">
          <div className="col" style={{ gap: 14 }}>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Original thesis</div>
              <p className="prose-sm">{r.lineage.thesis || "No thesis recorded."}</p>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 6 }}>Repair agent's analysis</div>
              {r.version?.diagnosis ? <p className="prose" style={{ fontSize: 13.5 }} data-testid="diagnosis-text">{r.version.diagnosis}</p>
                : <p className="prose-sm muted">{r.outcome === "died" ? "No repair attempted: this was the final allowed version." : "Waiting for the repair agent."}</p>}
            </div>
            {e.payload.stats && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Backtest of the rejected version</div>
                <div className="grid g3">
                  <Mini k="Sharpe" v={num(e.payload.stats.sharpe)} />
                  <Mini k="Deflated SR" v={num(e.payload.stats.dsr, 3)} />
                  <Mini k="Max DD" v={e.payload.stats.maxdd != null ? `${(e.payload.stats.maxdd * 100).toFixed(1)}%` : "—"} />
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel title="Patch" sub={next ? `v${e.version} → v${next.version}${counts ? ` · +${counts.add} −${counts.del}` : ""}` : "no patch"}>
          {next ? (
            <div className="col" style={{ gap: 12 }}>
              <DiffView diff={next.diff} maxHeight={360} />
              <div>
                <div className="label" style={{ marginBottom: 6 }}>Re-test of v{next.version}</div>
                {next.status === "PASSED" && <p className="mono green" style={{ fontSize: 12 }}>Passed all gates and the sealed holdout.</p>}
                {(next.status === "REJECTED" || next.status === "DEAD") && next.error && (
                  <p className="mono" style={{ fontSize: 12, color: "#fca5a5" }}><ErrorTag type={next.error.type} /> {next.error.message}</p>
                )}
                {(next.status === "PENDING" || next.status === "TESTED") && <p className="mono sky" style={{ fontSize: 12 }}>In the sandbox now.</p>}
                {next.equity?.values?.length > 2 && (
                  <div style={{ marginTop: 8 }}>
                    <LineChart dates={next.equity.dates} series={[{ key: "eq", name: `v${next.version} equity`, color: next.status === "PASSED" ? "#10b981" : "#f59e0b", values: next.equity.values }]} height={150} legend={false} />
                  </div>
                )}
                {next.stats && <details style={{ marginTop: 8 }}><summary className="label" style={{ cursor: "pointer" }}>All stats</summary><StatsGrid stats={next.stats} holdout={next.holdout?.stats} /></details>}
              </div>
            </div>
          ) : (
            <Empty title={r.outcome === "died" ? "No more attempts" : "Repair pending"}>
              {r.outcome === "died" ? `The lineage hit its repair limit. Cause of death: ${r.lineage.cause_of_death || err.message}` : "The repair agent is reading this failure."}
            </Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Mini({ k, v }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--grid)", padding: "6px 8px" }}>
      <div className="label" style={{ fontSize: 9.5 }}>{k}</div>
      <div className="mono tnum" style={{ fontSize: 14, fontWeight: 700 }}>{v}</div>
    </div>
  );
}
