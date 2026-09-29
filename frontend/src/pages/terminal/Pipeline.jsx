import React from "react";
import { useData } from "../../lib/data";
import { Link } from "../../lib/router";
import { PageHead, Panel, Stat, AgentBadge, EventTag, Empty, ErrorTag } from "../../components/ui";
import { COLUMNS, clock, prettyName, int } from "../../lib/format";

function KCard({ L }) {
  const err = L.latest?.error;
  return (
    <Link to={`/terminal/dossiers/${L.id}`} className="kcard" data-testid={`kanban-card-${L.id}`}>
      <div className="row">
        <AgentBadge agent={L.agent} />
        <span className="mono muted" style={{ fontSize: 10.5 }}>v{L.attempts}</span>
        {L.source === "legacy" && <span className="mono amber" style={{ fontSize: 9.5 }}>legacy</span>}
      </div>
      <div className="nm" title={L.name || L.id}>{prettyName(L)}</div>
      {err && L.column !== "VALIDATED" && (
        <div className="mono" style={{ fontSize: 10.5, color: "#fca5a5", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={err.message}>
          {err.message}
        </div>
      )}
      <div className="meta"><span>{clock(L.updated_at)}</span>{L.latest?.stats && <span>SR {L.latest.stats.sharpe?.toFixed(2)}</span>}</div>
    </Link>
  );
}

export default function Pipeline() {
  const { lineages, summary, visible, mode, live } = useData();
  const byCol = Object.fromEntries(COLUMNS.map((c) => [c.id, []]));
  for (const L of lineages) byCol[L.column]?.push(L);
  const feed = visible.slice(-40).reverse();
  const cur = live.control?.current;

  return (
    <div className="col" style={{ gap: 14 }}>
      <PageHead
        title="Pipeline monitor"
        desc="Every strategy lineage and where it sits in the loop right now. Cards move as the event stream advances."
        right={mode === "LIVE" && (
          <div className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>
            daemon <b style={{ color: live.control?.status === "running" ? "var(--green)" : "var(--amber)" }}>{live.control?.status || "unreachable"}</b>
            {cur && <> · {cur.agent} {cur.stage} {cur.lineage ? `· ${cur.lineage}` : ""}</>}
          </div>
        )}
      />

      <div className="grid g5">
        <Stat label="Lineages" value={int(summary.lineages)} sub={`${int(summary.versions)} versions`} accent="#38bdf8" testId="stat-lineages" />
        <Stat label="Sandbox rejections" value={int(summary.rejections)} sub={summary.versions ? `${Math.round((summary.rejections / summary.versions) * 100)}% of versions` : ""} accent="#ef4444" testId="stat-rejections" />
        <Stat label="Autonomous repairs" value={int(summary.repairs)} sub="patches written" accent="#c084fc" />
        <Stat label="Validated" value={int(summary.validated)} sub="passed gates + holdout" accent="#10b981" testId="stat-validated" />
        <Stat label="Dead" value={int(summary.dead)} sub="in the graveyard" accent="#6b7280" />
      </div>

      {!lineages.length ? (
        <Panel><Empty title="No strategies yet">{mode === "LIVE" ? "Start the daemon from the control panel and the first lineage will appear here." : "Press play to replay the run from the first event."}</Empty></Panel>
      ) : (
        <div className="board" data-testid="pipeline-board">
          {COLUMNS.map((c) => (
            <div key={c.id} className="board-col">
              <div className="board-col-head" style={{ "--c": c.color }}>{c.label.toUpperCase()}<span className="n tnum">{byCol[c.id].length}</span></div>
              <div className="board-cards">
                {byCol[c.id].map((L) => <KCard key={`${L.id}-${L.column}-${L.attempts}`} L={L} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid g2">
        <Panel title="Event stream" sub="newest first" flush>
          <div className="scroll-y" style={{ maxHeight: 380 }} data-testid="event-feed">
            {!feed.length && <Empty title="Stream empty" />}
            {feed.map((e) => (
              <Link key={e.event_id} to={e.event_type === "sandbox_reject" ? `/terminal/rejections?id=${e.event_id}` : `/terminal/dossiers/${e.lineage_root}`} className="feed-item">
                <span className="muted tnum">{clock(e.timestamp)}</span>
                <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  <EventTag type={e.event_type} /> <span className="dim">{e.agent}</span> {e.lineage_root} <span className="muted">v{e.version}</span>
                  {e.payload?.verdict && <b style={{ marginLeft: 6, color: e.payload.verdict === "VALIDATED" ? "var(--green)" : e.payload.verdict === "DEAD" ? "var(--grey)" : "var(--amber)" }}>{e.payload.verdict}</b>}
                  {e.payload?.error && e.event_type === "sandbox_reject" && <span style={{ marginLeft: 6, color: "#fca5a5" }}>{e.payload.error.message}</span>}
                </span>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel title="Why they fail" sub="rejections by gate">
          <div className="col" style={{ gap: 10 }}>
            {Object.entries(summary.taxonomy).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <div key={k} className="row">
                <div style={{ width: 96 }}><ErrorTag type={k} /></div>
                <div className="fillbar" style={{ flex: 1 }}>
                  <div style={{ width: `${(v / Math.max(1, summary.rejections)) * 100}%`, transition: "width .6s", background: "linear-gradient(90deg,#334155,#64748b)" }} />
                </div>
                <span className="mono tnum" style={{ width: 34, textAlign: "right" }}>{v}</span>
              </div>
            ))}
            {!summary.rejections && <Empty title="No rejections yet" />}
            <p className="prose-sm" style={{ marginTop: 6 }}>
              Gates run in order: static checks, runtime, output contract, causal truncation audit, then research performance gates. A strategy that passes all of them gets one shot at the sealed holdout.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
