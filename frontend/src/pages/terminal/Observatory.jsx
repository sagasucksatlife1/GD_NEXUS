import React, { useMemo, useState } from "react";
import { useData } from "../../lib/data";
import { PageHead, Panel, StateBadge, Empty, ErrorBox } from "../../components/ui";
import { Gauge, LineChart, RegimeStrip, RegimeLegend, TransitionMatrix } from "../../components/charts";
import { REGIME, REGIMES, pct, int } from "../../lib/format";
import { stateRuns } from "../../lib/derive";

const COMPONENTS = [
  { key: "entropy", label: "Entropy", desc: "1 − permutation entropy of market returns. High means herding and structure." },
  { key: "hurst", label: "Hurst distance", desc: "|H − 0.5|. High means the market is far from a random walk." },
  { key: "rmt", label: "Absorption", desc: "Top eigenvalue share of the correlation matrix. High means assets move as one." },
  { key: "turbulence", label: "Turbulence", desc: "Mahalanobis distance of today's returns from recent history." },
];

export default function Observatory() {
  const { csi, mode, live } = useData();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [range, setRange] = useState("all");

  const view = useMemo(() => {
    if (!csi?.dates?.length) return null;
    const n = csi.dates.length;
    const from = range === "all" ? 0 : Math.max(0, n - { "1y": 252, "5y": 1260 }[range]);
    const sl = (a) => (a ? a.slice(from) : []);
    const states = sl(csi.state);
    return {
      dates: sl(csi.dates), csi: sl(csi.csi), states, bench: sl(csi.benchmark?.values),
      runs: stateRuns(states).map((r) => ({ ...r, color: REGIME[r.state].color, opacity: r.state === "CRITICAL" ? 0.22 : 0.13 })),
      comps: Object.fromEntries(COMPONENTS.map((c) => [c.key, sl(csi.components?.[c.key])])),
    };
  }, [csi, range]);

  if (!csi) {
    return (
      <div className="col" style={{ gap: 12 }}>
        <PageHead title="Complexity Observatory" />
        <Panel>
          {mode === "LIVE" ? (
            <ErrorBox message={err || "The CSI has not been built on the backend yet."}
              action={<button className="btn primary" disabled={busy} onClick={async () => { setBusy(true); setErr(null); try { await live.rebuildCsi(); } catch (e) { setErr(`Rebuild failed: ${e.message}`); } setBusy(false); }}>{busy ? "Building…" : "Build CSI now"}</button>} />
          ) : <Empty title="No CSI in this archive">Export with <span className="mono">python scripts/export.py --csi</span> to include it.</Empty>}
        </Panel>
      </div>
    );
  }

  const cur = csi.current;
  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead
        title="Complexity Observatory"
        desc="The Complexity State Index fuses four trailing measures into one reading, ranked against all history to date. Nothing here uses future data."
        right={<div className="seg">{["1y", "5y", "all"].map((r) => <button key={r} className={range === r ? "on-replay" : ""} onClick={() => setRange(r)}>{r}</button>)}</div>}
      />

      <div className="grid obs-top">
        <Panel title="Current state" sub={`as of ${cur.date}`}>
          <div className="col" style={{ alignItems: "center", gap: 10 }}>
            <Gauge value={cur.csi} size={210} color={REGIME[cur.state].color} label="CSI percentile" testId="csi-gauge" />
            <StateBadge state={cur.state} pulse />
            <p className="prose-sm" style={{ textAlign: "center" }}>{REGIME[cur.state].desc}.</p>
          </div>
        </Panel>
        <Panel title="Components" sub="percentile vs history, weighted into the composite">
          <div className="grid g4">
            {COMPONENTS.map((c) => (
              <div key={c.key} className="col" style={{ alignItems: "center", gap: 6 }}>
                <Gauge value={cur.components?.[c.key]} size={130} color="#38bdf8" label={`${c.label} · w ${csi.weights?.[c.key] ?? "?"}`} />
                <p className="prose-sm" style={{ fontSize: 11.5, textAlign: "center" }}>{c.desc}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Regime timeline" right={<RegimeLegend />}>
        <RegimeStrip dates={view.dates} states={view.states} height={46} />
      </Panel>

      <div className="grid g2">
        <Panel title={`${csi.benchmark?.ticker || "Benchmark"} with stress regimes`} sub="shaded: turbulent and critical">
          <LineChart dates={view.dates} series={[{ key: "b", name: csi.benchmark?.ticker || "benchmark", color: "#e2e8f0", values: view.bench, width: 1.4 }]} bands={view.runs} height={260} legend={false} yFormat={(v) => v.toFixed(0)} />
        </Panel>
        <Panel title="Composite CSI" sub="dashed lines are the state thresholds">
          <LineChart dates={view.dates} series={[{ key: "c", name: "CSI", color: "#38bdf8", values: view.csi, width: 1.1 }]} height={260} legend={false} yDomain={[0, 1]}
            thresholds={Object.entries(csi.thresholds || {}).filter(([, v]) => v <= 1).map(([s, v]) => ({ y: v, color: REGIME[s].color, label: `${s} < ${v}` }))} yFormat={(v) => v.toFixed(2)} />
        </Panel>
      </div>

      <div className="grid g2">
        <Panel title="Transition matrix" sub="probability of tomorrow's state given today's">
          <TransitionMatrix matrix={csi.transition_matrix} />
        </Panel>
        <Panel title="What each state has looked like" sub="equal-weight universe, next-day returns, annualised" flush>
          <table className="data">
            <thead><tr><th>State</th><th className="num">Days</th><th className="num">Share</th><th className="num">Next-day return</th><th className="num">Next-day vol</th></tr></thead>
            <tbody>
              {REGIMES.map((s) => {
                const r = csi.per_state?.[s] || {};
                const total = REGIMES.reduce((t, k) => t + (csi.per_state?.[k]?.days || 0), 0);
                return (
                  <tr key={s}>
                    <td><StateBadge state={s} /></td>
                    <td className="num">{int(r.days)}</td>
                    <td className="num">{total ? `${((r.days / total) * 100).toFixed(1)}%` : "—"}</td>
                    <td className="num">{pct(r.next_day_ann_ret)}</td>
                    <td className="num">{r.next_day_ann_vol != null ? `${(r.next_day_ann_vol * 100).toFixed(1)}%` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="prose-sm" style={{ padding: "10px 14px" }}>Descriptive only. These statistics use next-day returns to characterise states, they are never fed back into the index.</p>
        </Panel>
      </div>

      <Panel title="Component history" sub="percentiles">
        <LineChart dates={view.dates} yDomain={[0, 1]} height={240} yFormat={(v) => v.toFixed(1)}
          series={COMPONENTS.map((c, i) => ({ key: c.key, name: c.label, values: view.comps[c.key], width: 1, color: ["#a78bfa", "#38bdf8", "#f59e0b", "#ef4444"][i] }))} />
      </Panel>
    </div>
  );
}
