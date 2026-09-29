import React from "react";
import { useData } from "../../lib/data";
import { Link, useRouter } from "../../lib/router";
import { PageHead, Panel, Stat, StatusBadge, Empty, Stamp } from "../../components/ui";
import { Donut, LineChart } from "../../components/charts";
import { AGENT, ERROR_TYPE, num, pctAbs, prettyName, time } from "../../lib/format";

export default function Agents({ agent }) {
  const { summary, lineages } = useData();
  const { navigate } = useRouter();
  const a = AGENT[agent];
  if (!a) return <Panel><Empty title="Unknown agent">Only M6 and M8 exist.</Empty></Panel>;
  const s = summary.agents[agent];
  const other = agent === "M6" ? "M8" : "M6";
  const o = summary.agents[other];
  const mine = lineages.filter((l) => l.agent === agent);
  const donut = Object.entries(s.taxonomy).map(([k, v]) => ({ label: ERROR_TYPE[k]?.label || k, value: v, color: ERROR_TYPE[k]?.color || "#64748b" }));

  const h2h = [
    ["Lineages", s.lineages, o.lineages, "high"],
    ["Rejection rate", s.rejectRate, o.rejectRate, "low", pctAbs],
    ["Validated", s.validated, o.validated, "high"],
    ["Avg attempts to pass", s.avgAttemptsToPass, o.avgAttemptsToPass, "low", (x) => num(x, 1)],
    ["Dead", s.dead, o.dead, "low"],
  ];

  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead
        title={<span><span style={{ color: a.color }}>{agent}</span> · {a.name}</span>}
        desc={`${a.method}. ${a.philosophy}`}
        right={<Link to={`/terminal/agents/${other}`} className="btn">Open {other} room</Link>}
      />

      <Panel title="Head to head" sub={`${agent} vs ${other}`} flush>
        <table className="data" data-testid="agent-head-to-head">
          <thead><tr><th>Metric</th><th className="num" style={{ color: a.color }}>{agent}</th><th className="num" style={{ color: AGENT[other].color }}>{other}</th></tr></thead>
          <tbody>
            {h2h.map(([k, x, y, better, f = (v) => (v ?? "—")]) => {
              const win = x != null && y != null && x !== y && (better === "high" ? x > y : x < y);
              return (
                <tr key={k}>
                  <td className="dim">{k}</td>
                  <td className="num" style={{ color: win ? "var(--text)" : undefined, fontWeight: win ? 700 : 400 }}>{f(x)}</td>
                  <td className="num">{f(y)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className="grid g4">
        <Stat label="Versions written" value={s.versions} sub={`${s.lineages} ideas`} accent={a.color} />
        <Stat label="Rejections" value={s.rejections} sub={s.rejectRate != null ? `${pctAbs(s.rejectRate)} of versions` : ""} accent="#ef4444" />
        <Stat label="Validated" value={s.validated} sub={s.avgAttemptsToPass ? `${num(s.avgAttemptsToPass, 1)} attempts on average` : "none yet"} accent="#10b981" />
        <Stat label="In progress" value={s.inProgress} sub={`${s.dead} dead`} accent="#6b7280" />
      </div>

      <div className="grid g2">
        <Panel title="Failure taxonomy" sub="how this agent characteristically breaks">
          {donut.length ? <Donut data={donut} testId="failure-donut" /> : <Empty title="No rejections yet" />}
        </Panel>
        <Panel title="Best validated strategy" sub="highest research Sharpe">
          {s.best ? (
            <div className="col" style={{ gap: 8 }}>
              <div className="row-wrap">
                <Link to={`/terminal/dossiers/${s.best.id}`} className="mono" style={{ fontWeight: 700 }}>{prettyName(s.best)}</Link>
                <span className="spacer" />
                <Stamp verdict="VALIDATED" />
              </div>
              <div className="mono dim" style={{ fontSize: 12 }}>
                Sharpe {num(s.best.best.stats?.sharpe)} · DSR {num(s.best.best.stats?.dsr, 3)} · holdout Sharpe {num(s.best.best.holdout?.stats?.sharpe)} · {s.best.attempts} version(s)
              </div>
              {s.best.best.equity && <LineChart dates={s.best.best.equity.dates} series={[{ key: "e", name: "equity", color: a.color, values: s.best.best.equity.values }]} height={170} legend={false} area />}
            </div>
          ) : <Empty title="Nothing validated yet">The first strategy from {agent} that survives every gate and the holdout will appear here.</Empty>}
        </Panel>
      </div>

      <Panel title={`${agent} lineages`} flush>
        {!mine.length ? <Empty title="No lineages yet" /> : (
          <table className="data">
            <thead><tr><th>Strategy</th><th>Status</th><th className="num">Versions</th><th>Last failure</th><th>Updated</th></tr></thead>
            <tbody>
              {mine.map((L) => {
                const lastErr = [...L.versions].reverse().find((v) => v.error)?.error;
                return (
                  <tr key={L.id} className="clickable" onClick={() => navigate(`/terminal/dossiers/${L.id}`)}>
                    <td style={{ color: "var(--text)" }}>{prettyName(L)}</td>
                    <td><StatusBadge status={L.status} /></td>
                    <td className="num">{L.attempts}</td>
                    <td style={{ maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#fca5a5" }}>{lastErr?.message || "—"}</td>
                    <td className="muted">{time(L.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
