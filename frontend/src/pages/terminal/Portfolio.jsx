import React, { useMemo } from "react";
import { useData } from "../../lib/data";
import { Link } from "../../lib/router";
import { PageHead, Panel, Stat, Empty, AgentBadge } from "../../components/ui";
import { LineChart } from "../../components/charts";
import { abstentionBook, drawdown, stateRuns } from "../../lib/derive";
import { REGIME, num, pct, pctAbs, prettyName } from "../../lib/format";
import { ALLOC } from "../../lib/derive";

export default function Portfolio() {
  const { lineages, csi } = useData();
  const book = useMemo(() => abstentionBook(lineages, csi), [lineages, csi]);

  if (!book) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <PageHead title="Portfolio" desc="The book is built only from validated strategies." />
        <Panel><Empty title="No validated strategies yet">A strategy joins the book after it passes every sandbox gate, the research performance bar, and the sealed holdout.</Empty></Panel>
      </div>
    );
  }

  const bands = stateRuns(book.states.map((s) => s || "")).map((r) => ({ ...r, color: REGIME[r.state].color, opacity: 0.12 }));
  const U = book.statsU, G = book.statsG;
  const holdouts = book.strategies.filter((l) => l.best.holdout?.stats);

  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead title="Portfolio"
        desc={`Every validated strategy, weighted by inverse trailing volatility (${ALLOC.lookback} weeks, capped at ${Math.round(ALLOC.cap * 100)}% each). The curve runs through the research window and on into the sealed holdout, up to ${book.asOf}. The gated version holds cash in any week that follows a turbulent or critical CSI reading.`}
      />

      <div className="grid g4">
        <Stat label="Strategies in book" value={book.n} accent="#10b981" />
        <Stat label="Sharpe, always on" value={num(U?.sharpe)} sub={`max DD ${pct(U?.maxdd)}`} accent="#94a3b8" />
        <Stat label="Sharpe, CSI-gated" value={num(G?.sharpe)} sub={`max DD ${pct(G?.maxdd)}`} accent="#38bdf8" />
        <Stat label="Weeks in cash" value={`${Math.round(book.abstainShare * 100)}%`} sub={book.csiCoverage < 0.95 ? `CSI covers ${Math.round(book.csiCoverage * 100)}% of weeks` : "abstention rate"} accent="#f59e0b" />
      </div>

      <Panel title="Live allocation" sub={`weights for the week after ${book.asOf} · CSI ${book.csiState || "unknown"}${book.gateOff ? " → gate is ON, book in cash" : ""}`} flush>
        <table className="data" data-testid="live-allocation">
          <thead><tr><th>Strategy</th><th>Agent</th><th className="num">Trailing vol</th><th className="num">Weight</th><th style={{ width: "30%" }}></th><th className="num">After CSI gate</th></tr></thead>
          <tbody>
            {book.allocation.map(({ L, vol, weight, gatedWeight }) => (
              <tr key={L.id}>
                <td><Link to={`/terminal/dossiers/${L.id}`} style={{ color: "var(--text)" }}>{prettyName(L)}</Link>{L.source === "reference" && <span style={{ fontSize: 10, marginLeft: 6, color: "#10b981" }}>reference</span>}</td>
                <td><AgentBadge agent={L.agent} /></td>
                <td className="num">{vol != null ? pctAbs(vol, 1) : "—"}</td>
                <td className="num">{pctAbs(weight, 1)}</td>
                <td><div style={{ height: 8, borderRadius: 4, background: "var(--line, #1e293b)" }}><div style={{ width: `${weight * 100}%`, height: 8, borderRadius: 4, background: "#10b981" }} /></div></td>
                <td className="num">{pctAbs(gatedWeight, 1)}</td>
              </tr>
            ))}
            <tr><td className="dim">Cash</td><td /><td /><td className="num">{pctAbs(book.cash, 1)}</td><td /><td className="num">{pctAbs(book.gateOff ? 1 : book.cash, 1)}</td></tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Abstention test" sub="shaded weeks were held in cash by the gated book">
        <LineChart dates={book.dates} bands={bands} height={300} yFormat={(v) => v.toFixed(2)}
          series={[
            { key: "u", name: "Always on", color: "#94a3b8", values: book.ungated, width: 1.5 },
            { key: "g", name: "CSI-gated", color: "#38bdf8", values: book.gated, width: 2 },
          ]} testId="gated-equity" />
      </Panel>

      <div className="grid g2">
        <Panel title="Drawdown">
          <LineChart dates={book.dates} height={200} yFormat={(v) => `${(v * 100).toFixed(0)}%`}
            series={[
              { key: "u", name: "Always on", color: "#94a3b8", values: drawdown(book.ungated), width: 1.3 },
              { key: "g", name: "CSI-gated", color: "#38bdf8", values: drawdown(book.gated), width: 1.6 },
            ]} />
        </Panel>
        <Panel title="Side by side" flush>
          <table className="data">
            <thead><tr><th>Metric</th><th className="num">Always on</th><th className="num">CSI-gated</th></tr></thead>
            <tbody>
              <tr><td className="dim">Ann. return</td><td className="num">{pct(U?.annRet)}</td><td className="num">{pct(G?.annRet)}</td></tr>
              <tr><td className="dim">Ann. vol</td><td className="num">{pct(U?.annVol)}</td><td className="num">{pct(G?.annVol)}</td></tr>
              <tr><td className="dim">Sharpe</td><td className="num">{num(U?.sharpe)}</td><td className="num">{num(G?.sharpe)}</td></tr>
              <tr><td className="dim">Max drawdown</td><td className="num">{pct(U?.maxdd)}</td><td className="num">{pct(G?.maxdd)}</td></tr>
            </tbody>
          </table>
          <p className="prose-sm" style={{ padding: "10px 14px" }}>
            Computed in the browser from the validated strategies' weekly research and holdout curves and the causal CSI, lagged one week. Weights use only returns up to the previous week.
          </p>
        </Panel>
      </div>

      <Panel title="Constituents" flush>
        <table className="data">
          <thead><tr><th>Strategy</th><th>Agent</th><th className="num">Versions</th><th className="num">Research Sharpe</th><th className="num">Deflated SR</th><th className="num">Holdout Sharpe</th><th className="num">Holdout DD</th></tr></thead>
          <tbody>
            {book.strategies.map((L) => (
              <tr key={L.id}>
                <td><Link to={`/terminal/dossiers/${L.id}`} style={{ color: "var(--text)" }}>{prettyName(L)}</Link></td>
                <td><AgentBadge agent={L.agent} /></td>
                <td className="num">{L.attempts}</td>
                <td className="num">{num(L.best.stats?.sharpe)}</td>
                <td className="num">{num(L.best.stats?.dsr, 3)}</td>
                <td className="num">{num(L.best.holdout?.stats?.sharpe)}</td>
                <td className="num">{pct(L.best.holdout?.stats?.maxdd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!holdouts.length && <p className="prose-sm" style={{ padding: "10px 14px" }}>No holdout results recorded yet.</p>}
      </Panel>
    </div>
  );
}
