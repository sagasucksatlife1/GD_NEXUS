import React, { useEffect, useMemo, useState } from "react";
import { useData } from "../lib/data";
import { Link } from "../lib/router";
import { useInView, useScrollProgress, useTypewriter, useCountUp, reducedMotion } from "../lib/hooks";
import { LivingPipeline } from "../components/LivingPipeline";
import { LineChart, RegimeStrip, RegimeLegend, Gauge } from "../components/charts";
import { CodeBlock, DiffView, parseDiff } from "../components/code";
import { Stamp, StateBadge, Icon, AgentBadge, ErrorTag } from "../components/ui";
import { abstentionBook, stateRuns } from "../lib/derive";
import { AGENT, REGIME, num, pct } from "../lib/format";
import { LINKS } from "../data/static";

function Reveal({ children, delay = 0, className = "" }) {
  const [ref, inView] = useInView({ threshold: 0.2 });
  return <div ref={ref} className={`reveal ${inView ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</div>;
}

function Counter({ value, label, go }) {
  const v = useCountUp(value || 0, go);
  return <div className="counter"><b>{Math.round(v).toLocaleString("en-US")}</b><span>{label}</span></div>;
}

/* ============================================================ 1 · hero */
function Hero() {
  const { full, meta, events, status } = useData();
  const s = full.summary;
  const [ref, inView] = useInView({ threshold: 0.1 });
  const backtests = events.filter((e) => e.event_type === "rebacktest").length;
  const counts = status.loading ? null : {
    generate: s.lineages, sandbox: s.versions, reject: s.rejections, diagnose: s.repairs,
    patch: s.repairs, backtest: backtests, validated: s.validated, dead: s.dead,
  };
  return (
    <section className="sec hero gridbg" ref={ref} style={{ paddingTop: 110 }} data-testid="home-hero">
      <div className="sec-inner">
        <div className="row-wrap" style={{ marginBottom: 20 }}>
          <span className="sec-kicker" style={{ margin: 0 }}>Complexity-adaptive quant research · PBL, Manipal University Jaipur</span>
          {meta?.synthetic && <span className="demo-flag">Demo run on synthetic data</span>}
        </div>
        <h1>A research machine that tries to break its own strategies.</h1>
        <p className="lede">
          Two AI agents write trading strategies. A sandbox rejects almost all of them. A repair agent reads each failure, fixes the code and sends it back. Every rejected line is kept and shown.
        </p>
        <div className="row-wrap" style={{ marginTop: 26, gap: 12 }}>
          <Link to="/terminal" className="btn primary" style={{ padding: "10px 16px", fontSize: 13 }} data-testid="hero-open-terminal">Open the terminal <Icon name="arrow" size={13} /></Link>
          <Link to="/terminal/rejections" className="btn" style={{ padding: "10px 16px", fontSize: 13 }}>See the rejected code</Link>
        </div>

        <div className="panel" style={{ marginTop: 40, padding: "18px 18px 8px", background: "rgba(15,20,29,0.8)" }}>
          <LivingPipeline counts={counts} />
        </div>
        <div className="grid g5" style={{ marginTop: 22 }}>
          <Counter value={s.lineages} label="strategy ideas" go={inView && !status.loading} />
          <Counter value={s.versions} label="versions tested" go={inView && !status.loading} />
          <Counter value={s.rejections} label="rejected by the sandbox" go={inView && !status.loading} />
          <Counter value={s.repairs} label="autonomous repairs" go={inView && !status.loading} />
          <Counter value={s.validated} label="survived everything" go={inView && !status.loading} />
        </div>
      </div>
    </section>
  );
}

/* ============================================================ 2 · the problem */
function Problem() {
  const { csi } = useData();
  const [ref, p] = useScrollProgress();
  const data = useMemo(() => {
    if (!csi?.dates) return null;
    const runs = stateRuns(csi.state).map((r) => ({ ...r, color: REGIME[r.state].color, opacity: r.state === "CRITICAL" ? 0.25 : 0.14 }));
    const stressed = csi.state.filter((s) => s === "TURBULENT" || s === "CRITICAL").length / csi.state.length;
    return { runs, stressed };
  }, [csi]);
  return (
    <section className="sec" ref={ref}>
      <div className="sec-inner two">
        <div>
          <div className="sec-kicker">The problem</div>
          <h2>Markets change state. Most models never notice.</h2>
          <p className="lede">
            A strategy fitted in calm markets keeps trading straight into a crash. Scroll and the stress regimes paint themselves over the price: {data ? `${Math.round(data.stressed * 100)}% of trading days` : "a large share of history"} sat in a turbulent or critical state.
          </p>
          <div style={{ marginTop: 18 }}><RegimeLegend /></div>
        </div>
        <div className="panel" style={{ padding: 14 }}>
          {data ? (
            <LineChart dates={csi.dates} height={340} legend={false} reveal={Math.min(1, p * 1.25)} yFormat={(v) => v.toFixed(0)}
              bands={data.runs} series={[{ key: "b", name: csi.benchmark?.ticker || "benchmark", color: "#e2e8f0", values: csi.benchmark?.values || [], width: 1.4 }]} />
          ) : <p className="prose-sm" style={{ padding: 40 }}>Regime data appears here once the CSI is exported.</p>}
          <div className="mono muted" style={{ fontSize: 11, marginTop: 6 }}>{csi?.benchmark?.ticker || "Benchmark"}, daily, with causal CSI regimes</div>
        </div>
      </div>
    </section>
  );
}

/* ============================================================ 3 · CSI */
function CSISection() {
  const { csi } = useData();
  const [ref, inView] = useInView({ threshold: 0.35 });
  const cur = csi?.current;
  const comps = [["entropy", "Entropy"], ["hurst", "Hurst distance"], ["rmt", "Absorption"], ["turbulence", "Turbulence"]];
  const color = cur ? REGIME[cur.state].color : "#38bdf8";
  return (
    <section className="sec gridbg" ref={ref}>
      <div className="sec-inner">
        <div className="sec-kicker">Measuring the state</div>
        <h2>Four measures of disorder, fused into one index.</h2>
        <p className="lede">The Complexity State Index ranks today against all of history to date, so it never uses tomorrow's data.</p>
        <div className="panel" style={{ marginTop: 34, padding: "26px 18px" }}>
          <div className="row-wrap" style={{ justifyContent: "space-around", gap: 20 }}>
            {comps.map(([k, l], i) => (
              <div key={k} style={{ transition: "transform 1s, opacity 1s", transitionDelay: `${i * 120}ms`, opacity: inView ? 1 : 0.2, transform: inView ? "none" : "translateY(10px)" }}>
                <Gauge value={cur?.components?.[k]} go={inView} size={132} label={l} color="#38bdf8" />
              </div>
            ))}
          </div>
          <svg viewBox="0 0 1000 70" style={{ width: "100%", height: 70, display: "block" }} aria-hidden="true">
            {[125, 375, 625, 875].map((x, i) => (
              <path key={x} d={`M${x} 0 C ${x} 40, 500 30, 500 70`} fill="none" stroke="#38bdf8" strokeWidth="1.5" pathLength="1" strokeDasharray="1"
                style={{ strokeDashoffset: inView ? 0 : 1, transition: `stroke-dashoffset 1s ease ${0.6 + i * 0.1}s`, opacity: 0.6 }} />
            ))}
          </svg>
          <div className="col" style={{ alignItems: "center", gap: 10 }}>
            <Gauge value={cur?.csi} go={inView} size={230} color={color} label="Composite CSI" testId="home-csi-gauge" />
            {cur && <div className="row"><StateBadge state={cur.state} pulse /><span className="mono muted" style={{ fontSize: 11 }}>{cur.date}</span></div>}
          </div>
          {csi?.state && <div style={{ marginTop: 22 }}><RegimeStrip dates={csi.dates} states={csi.state} height={30} reveal={inView ? 1 : 0} /></div>}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ 4 · two agents */
function SpreadSchematic() {
  const pts = useMemo(() => {
    const out = [];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const z = 1.35 * Math.sin(t * 13) * Math.exp(-((t - 0.55) ** 2) * 1.5) + 0.35 * Math.sin(t * 41) + 0.2 * Math.cos(t * 7);
      out.push([20 + t * 420, 110 - z * 55]);
    }
    return out;
  }, []);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
  return (
    <svg viewBox="0 0 460 220" style={{ width: "100%", height: "auto" }} aria-label="Schematic: spread oscillating around fair value">
      <rect x="20" y="0" width="420" height="55" fill="#ef4444" opacity="0.06" />
      <rect x="20" y="165" width="420" height="55" fill="#10b981" opacity="0.06" />
      <line x1="20" x2="440" y1="55" y2="55" stroke="#ef4444" strokeDasharray="4 4" opacity="0.6" />
      <line x1="20" x2="440" y1="165" y2="165" stroke="#10b981" strokeDasharray="4 4" opacity="0.6" />
      <line x1="20" x2="440" y1="110" y2="110" stroke="#334155" />
      <text x="436" y="50" textAnchor="end" fontSize="10" fontFamily="var(--mono)" fill="#fca5a5">+1σ short spread</text>
      <text x="436" y="180" textAnchor="end" fontSize="10" fontFamily="var(--mono)" fill="#86efac">−1σ long spread</text>
      <text x="24" y="104" fontSize="10" fontFamily="var(--mono)" fill="#64748b">synthetic fair value</text>
      <path d={d} fill="none" stroke="#38bdf8" strokeWidth="2" pathLength="1" className="loop-draw" />
    </svg>
  );
}

function OrthoSchematic() {
  const nodes = [["Momentum", 90, 40], ["Reversal", 370, 40], ["Low vol", 230, 190]];
  return (
    <svg viewBox="0 0 460 230" style={{ width: "100%", height: "auto" }} aria-label="Schematic: three orthogonal features feeding an ensemble">
      {[[0, 1], [1, 2], [2, 0]].map(([a, b]) => {
        const [, x1, y1] = nodes[a]; const [, x2, y2] = nodes[b];
        return (
          <g key={`${a}${b}`}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#334155" strokeDasharray="3 6" />
            <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 6} textAnchor="middle" fontSize="10.5" fontFamily="var(--mono)" fill="#64748b">ρ ≈ 0</text>
          </g>
        );
      })}
      {nodes.map(([, x, y], i) => (
        <line key={i} x1={x} y1={y} x2={230} y2={100} stroke="#c084fc" strokeWidth="1.5" strokeDasharray="5 7" className="flow" />
      ))}
      <circle cx="230" cy="100" r="26" fill="#0b0f17" stroke="#c084fc" strokeWidth="1.5" />
      <text x="230" y="104" textAnchor="middle" fontSize="10" fontFamily="var(--mono)" fill="#e9d5ff">ensemble</text>
      {nodes.map(([l, x, y]) => (
        <g key={l}>
          <circle cx={x} cy={y} r="20" fill="#0b0f17" stroke="#c084fc" strokeOpacity="0.7" />
          <text x={x} y={y + (y > 100 ? 36 : -28)} textAnchor="middle" fontSize="11" fontFamily="var(--mono)" fill="#cbd5e1">{l}</text>
        </g>
      ))}
    </svg>
  );
}

function Agents() {
  const { full } = useData();
  const A = full.summary.agents;
  const card = (k, schematic) => {
    const a = AGENT[k], s = A[k];
    return (
      <Reveal delay={k === "M6" ? 0 : 100}>
        <div className="panel" style={{ padding: 20, borderTop: `2px solid ${a.color}` }}>
          <div className="row"><AgentBadge agent={k} /><span className="mono" style={{ color: a.color, fontSize: 13 }}>{a.name}</span></div>
          <h3 style={{ fontSize: 22, fontWeight: 700, marginTop: 10 }}>{a.method}</h3>
          <p className="prose-sm" style={{ marginTop: 6 }}>{a.philosophy}</p>
          {schematic && <div style={{ margin: "16px 0 6px" }}>{schematic}</div>}
          {schematic && <div className="mono muted" style={{ fontSize: 10 }}>schematic</div>}
          <div className="grid g3" style={{ marginTop: 14 }}>
            <div className="counter"><b style={{ fontSize: 24 }}>{s?.versions ?? 0}</b><span>versions</span></div>
            <div className="counter"><b style={{ fontSize: 24 }}>{s?.rejectRate != null ? `${Math.round(s.rejectRate * 100)}%` : "—"}</b><span>rejected</span></div>
            <div className="counter"><b style={{ fontSize: 24 }}>{s?.validated ?? 0}</b><span>validated</span></div>
          </div>
        </div>
      </Reveal>
    );
  };
  return (
    <section className="sec">
      <div className="sec-inner">
        <div className="sec-kicker">Five agents, five ways of thinking</div>
        <h2>Mispricing, machine learning, regimes, information flow and behavioural bias.</h2>
        <p className="lede">All five run locally on an open model. None is trusted: everything they write goes through the same sandbox.</p>
        <div className="grid g2" style={{ marginTop: 34, gap: 18 }}>
          {card("M6", <SpreadSchematic />)}
          {card("M8", <OrthoSchematic />)}
        </div>
        <div className="grid g3" style={{ marginTop: 18, gap: 18 }}>
          {card("M9", null)}
          {card("M10", null)}
          {card("M11", null)}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ 5 · sandbox kills */
function SandboxKills() {
  const { full } = useData();
  const s = full.summary;
  const [ref, inView] = useInView({ threshold: 0.35 });
  const r = full.rejections.find((x) => x.event.payload.error?.line) || full.rejections[0];
  const excerpt = useMemo(() => {
    if (!r) return { text: "", start: 1, hot: null };
    const code = r.event.payload.code || r.version?.code || "";
    const lines = code.split("\n");
    const ln = r.event.payload.error?.line;
    const start = ln ? Math.max(1, ln - 5) : 1;
    const end = ln ? Math.min(lines.length, ln + 3) : Math.min(lines.length, 12);
    return { text: lines.slice(start - 1, end).join("\n"), start, hot: ln };
  }, [r]);
  const [typed, done] = useTypewriter(excerpt.text, inView, 220);
  const ratio = s.versions ? s.rejections / s.versions : 0;
  const shownLines = typed.split("\n");

  return (
    <section className="sec gridbg" ref={ref}>
      <div className="sec-inner two">
        <div>
          <div className="sec-kicker">The sandbox</div>
          <h2>Most code dies here. All of it is kept.</h2>
          <p className="lede">Syntax, runtime, output contract, a look-ahead audit that re-runs every strategy on truncated history, then the performance gates.</p>
          <div style={{ marginTop: 28 }}>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="mono" style={{ fontSize: 30, fontWeight: 700 }}>{s.rejections}</span>
              <span className="mono muted">of {s.versions} versions rejected</span>
            </div>
            <div className="fillbar"><div style={{ width: inView ? `${ratio * 100}%` : 0 }} /></div>
            <div className="row-wrap" style={{ marginTop: 14 }}>
              {Object.entries(s.taxonomy).map(([k, v]) => <span key={k} className="row" style={{ gap: 6 }}><ErrorTag type={k} /><span className="mono tnum dim">{v}</span></span>)}
            </div>
          </div>
        </div>
        <div className="term-window">
          <div className="bar"><i /><i /><i /><span style={{ marginLeft: 8 }}>sandbox · {r ? `${r.lineage.id} v${r.event.version}` : "waiting"}</span></div>
          <pre className="code" style={{ border: 0, borderRadius: 0, padding: "10px 0", minHeight: 260, maxHeight: 360 }}>
            {r ? shownLines.map((l, i) => {
              const n = excerpt.start + i;
              return (
                <div key={i} className={`ln ${done && n === excerpt.hot ? "hot" : ""}`}>
                  <span className="no">{n}</span>
                  <span className={`tx ${i === shownLines.length - 1 && !done ? "caret" : ""}`}>{l}</span>
                </div>
              );
            }) : <div className="ln"><span className="tx muted">  no rejections recorded yet</span></div>}
          </pre>
          {r && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid var(--line)", minHeight: 62, opacity: done ? 1 : 0, transition: "opacity .4s" }}>
              <div className="row"><ErrorTag type={r.event.payload.error?.type} /><span className="mono muted" style={{ fontSize: 10.5 }}>{r.event.timestamp}</span></div>
              <div className="mono" style={{ color: "#fca5a5", fontSize: 12, marginTop: 6 }}>{r.event.payload.error?.message}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ 6 · self repair */
function Repair() {
  const { full } = useData();
  const [ref, inView] = useInView({ threshold: 0.3 });
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState(0);
  const [rows, setRows] = useState(0);

  const pick = useMemo(() => {
    const cands = [];
    for (const L of full.lineages) {
      for (const v of L.versions) {
        const next = L.versions.find((x) => x.version === v.version + 1);
        if (v.error && v.diagnosis && next?.diff) cands.push({ L, v, next, score: (next.status === "PASSED" ? 2 : 0) + (v.error.type === "lookahead" ? 1 : 0) });
      }
    }
    return cands.sort((a, b) => b.score - a.score)[0] || null;
  }, [full.lineages]);

  const diffRows = pick ? parseDiff(pick.next.diff).length : 0;
  const [diag, diagDone] = useTypewriter(pick?.v.diagnosis || "", inView && phase >= 1, 90);

  useEffect(() => { setPhase(0); setRows(0); }, [run]);
  useEffect(() => {
    if (!inView || !pick) return;
    if (reducedMotion()) { setPhase(4); setRows(diffRows); return; }
    if (phase === 0) { const t = setTimeout(() => setPhase(1), 900); return () => clearTimeout(t); }
    if (phase === 1 && diagDone) { const t = setTimeout(() => setPhase(2), 400); return () => clearTimeout(t); }
    if (phase === 2) {
      if (rows < diffRows) { const t = setTimeout(() => setRows((r) => r + 1), 110); return () => clearTimeout(t); }
      const t = setTimeout(() => setPhase(3), 300); return () => clearTimeout(t);
    }
    if (phase === 3) { const t = setTimeout(() => setPhase(4), 2700); return () => clearTimeout(t); }
  }, [inView, pick, phase, diagDone, rows, diffRows, run]);

  const verdict = pick ? (pick.next.status === "PASSED" ? "VALIDATED" : pick.next.status === "PENDING" || pick.next.status === "TESTED" ? "RETRY" : "REJECTED") : null;
  const eq = pick?.next.equity;

  return (
    <section className="sec" ref={ref}>
      <div className="sec-inner">
        <div className="row-wrap" style={{ alignItems: "flex-end" }}>
          <div>
            <div className="sec-kicker">Autonomous repair</div>
            <h2>The machine reads its own failure and fixes it.</h2>
            <p className="lede">A real rejection from the log, replayed: the diagnosis, the patch, the re-test and the verdict. Nobody touched the code.</p>
          </div>
          <span className="spacer" />
          {pick && <button className="btn" onClick={() => setRun((x) => x + 1)} data-testid="repair-replay"><Icon name="refresh" size={12} /> Replay</button>}
        </div>

        {!pick ? <p className="prose-sm" style={{ marginTop: 30 }}>No repaired rejection in this run yet.</p> : (
          <div className="grid g2" style={{ marginTop: 30, alignItems: "start" }}>
            <div className="col" style={{ gap: 12 }}>
              <div className="panel">
                <div className="panel-head"><span className="panel-title">v{pick.v.version} rejected</span><span className="spacer" /><ErrorTag type={pick.v.error.type} /></div>
                <div className="panel-body col" style={{ gap: 10 }}>
                  <div className="mono" style={{ color: "#fca5a5", fontSize: 12 }}>{pick.v.error.message}</div>
                  <CodeBlock code={pick.v.code} highlightLine={pick.v.error.line} maxHeight={200} />
                </div>
              </div>
              <div className="panel" style={{ opacity: phase >= 1 ? 1 : 0.25, transition: "opacity .4s" }}>
                <div className="panel-head"><span className="panel-title" style={{ color: "var(--violet)" }}>Diagnosis</span></div>
                <div className="panel-body"><p className={`prose ${phase === 1 && !diagDone ? "caret" : ""}`} style={{ fontSize: 14, minHeight: 66 }}>{diag}</p></div>
              </div>
            </div>
            <div className="col" style={{ gap: 12 }}>
              <div className="panel" style={{ opacity: phase >= 2 ? 1 : 0.25, transition: "opacity .4s" }}>
                <div className="panel-head"><span className="panel-title" style={{ color: "var(--blue)" }}>Patch v{pick.v.version} → v{pick.next.version}</span></div>
                <div className="panel-body"><DiffView diff={pick.next.diff} visible={phase >= 2 ? rows : 0} animate maxHeight={240} /></div>
              </div>
              <div className="panel" style={{ opacity: phase >= 3 ? 1 : 0.25, transition: "opacity .4s" }}>
                <div className="panel-head"><span className="panel-title" style={{ color: "var(--yellow)" }}>Re-backtest</span><span className="spacer" />
                  {pick.next.stats && <span className="mono dim" style={{ fontSize: 11 }}>Sharpe {num(pick.next.stats.sharpe)} · DSR {num(pick.next.stats.dsr, 3)}</span>}
                </div>
                <div className="panel-body" style={{ position: "relative", minHeight: 190 }}>
                  {eq?.values?.length > 2 ? (
                    <LineChart key={run} dates={eq.dates} series={[{ key: "e", name: "equity", color: verdict === "VALIDATED" ? "#10b981" : "#f59e0b", values: eq.values }]} height={170} legend={false} animate go={phase >= 3} />
                  ) : <p className="prose-sm" style={{ paddingTop: 40 }}>{pick.next.error ? `Rejected before backtest: ${pick.next.error.message}` : "Waiting for the sandbox."}</p>}
                  {phase >= 4 && <div style={{ position: "absolute", right: 22, top: 18 }}><Stamp verdict={verdict} slam /></div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

/* ============================================================ 7 · abstention */
function Abstention() {
  const { full, csi } = useData();
  const [ref, inView] = useInView({ threshold: 0.35 });
  const book = useMemo(() => abstentionBook(full.lineages, csi), [full.lineages, csi]);
  const bands = book ? stateRuns(book.states.map((s) => s || "")).map((r) => ({ ...r, color: REGIME[r.state].color, opacity: 0.12 })) : [];
  return (
    <section className="sec gridbg" ref={ref}>
      <div className="sec-inner two">
        <div>
          <div className="sec-kicker">The abstention principle</div>
          <h2>Sometimes the correct trade is none.</h2>
          <p className="lede">
            The earlier research tried three ways to trade turbulent markets and every one failed. So the book goes to cash after a turbulent or critical week instead of guessing.
          </p>
          {book && (
            <table className="data" style={{ marginTop: 22, maxWidth: 440, opacity: inView ? 1 : 0, transition: "opacity 1s 2.2s" }}>
              <thead><tr><th /><th className="num">Always on</th><th className="num">Gated</th></tr></thead>
              <tbody>
                <tr><td className="dim">Ann. return</td><td className="num">{pct(book.statsU?.annRet)}</td><td className="num">{pct(book.statsG?.annRet)}</td></tr>
                <tr><td className="dim">Sharpe</td><td className="num">{num(book.statsU?.sharpe)}</td><td className="num">{num(book.statsG?.sharpe)}</td></tr>
                <tr><td className="dim">Max drawdown</td><td className="num">{pct(book.statsU?.maxdd)}</td><td className="num">{pct(book.statsG?.maxdd)}</td></tr>
                <tr><td className="dim">Weeks in cash</td><td className="num">0%</td><td className="num">{Math.round(book.abstainShare * 100)}%</td></tr>
              </tbody>
            </table>
          )}
        </div>
        <div className="panel" style={{ padding: 14 }}>
          {book ? (
            <>
              <LineChart dates={book.dates} bands={bands} height={320} animate go={inView} yFormat={(v) => v.toFixed(2)}
                series={[
                  { key: "u", name: "Always on", color: "#94a3b8", values: book.ungated, width: 1.5 },
                  { key: "g", name: "CSI-gated", color: "#38bdf8", values: book.gated, width: 2.2, delay: 0.15 },
                ]} />
              <p className="mono muted" style={{ fontSize: 10.5, marginTop: 6 }}>Equal-weight book of {book.n} validated strategies, research window. Computed from the event log in your browser.</p>
            </>
          ) : <p className="prose-sm" style={{ padding: 40 }}>This test runs once at least one strategy is validated.</p>}
        </div>
      </div>
    </section>
  );
}

/* ============================================================ 8 · CTA */
function Enter() {
  const steps = [
    ["Rejection console", "Denied code, the repair agent's diagnosis and the patch, side by side.", "/terminal/rejections"],
    ["Graveyard", "Every strategy that died, and the exact statistic that killed it.", "/terminal/graveyard"],
    ["Portfolio", "What survived, with and without regime abstention.", "/terminal/portfolio"],
  ];
  return (
    <section className="sec" style={{ minHeight: "80vh" }}>
      <div className="sec-inner two">
        <div>
          <div className="sec-kicker">Enter the terminal</div>
          <h2>Everything above is live data from the event log.</h2>
          <p className="lede">Switch the terminal to live mode on a machine running the backend and watch the loop work in real time. Otherwise replay the recorded run at up to 100x.</p>
          <div className="row-wrap" style={{ marginTop: 24, gap: 12 }}>
            <Link to="/terminal" className="btn primary" style={{ padding: "11px 18px", fontSize: 13 }} data-testid="cta-open-terminal">Open the terminal <Icon name="arrow" size={13} /></Link>
            <a href={LINKS.github} target="_blank" rel="noreferrer" className="btn" style={{ padding: "11px 18px", fontSize: 13 }}><Icon name="github" size={13} /> Source</a>
          </div>
        </div>
        <div>
          <div className="label" style={{ marginBottom: 6 }}>Grading this? Three stops, about a minute</div>
          {steps.map(([t, d, to], i) => (
            <Link key={t} to={to} className="path-step" data-testid={`examiner-step-${i + 1}`}>
              <span className="n">{i + 1}</span>
              <div><div style={{ fontWeight: 600, fontSize: 16 }}>{t}</div><p className="prose-sm">{d}</p></div>
              <span className="spacer" /><Icon name="arrow" size={14} style={{ color: "var(--muted)", marginTop: 4 }} />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const { status, reload } = useData();
  return (
    <div className="home">
      <nav className="home-nav">
        <Link to="/" className="brand"><span className="brand-dot" />NEXUS</Link>
        <span className="spacer" />
        <Link to="/terminal/observatory" className="lnk hide-sm">Observatory</Link>
        <Link to="/terminal/rejections" className="lnk hide-sm">Rejections</Link>
        <Link to="/terminal/research" className="lnk hide-sm">Research</Link>
        <Link to="/terminal" className="btn primary">Terminal</Link>
      </nav>
      {status.error && (
        <div className="mono" style={{ position: "fixed", top: 64, left: 16, right: 16, zIndex: 40, background: "#1a0d10", border: "1px solid rgba(239,68,68,.4)", color: "#fca5a5", padding: "10px 14px", fontSize: 12 }}>
          {status.error} <button className="btn sm" style={{ marginLeft: 10 }} onClick={reload}>Retry</button>
        </div>
      )}
      <Hero />
      <Problem />
      <CSISection />
      <Agents />
      <SandboxKills />
      <Repair />
      <Abstention />
      <Enter />
      <footer className="footer">
        <span>NEXUS · Kartikeya Singh · Manipal University Jaipur</span>
        <span className="spacer" />
        <a href={LINKS.site} target="_blank" rel="noreferrer">kartikeyasingh.in</a>
        <a href={LINKS.github} target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
