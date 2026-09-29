import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSize } from "../lib/hooks";
import { downsample } from "../lib/derive";
import { REGIME, REGIMES } from "../lib/format";

/* ------------------------------------------------------------------ helpers */
function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];
  const span = max - min;
  const step0 = span / Math.max(1, count - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const err = step0 / mag;
  const step = (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

/* ------------------------------------------------------------------ line chart */
export function LineChart({
  dates = [], series = [], bands = [], height = 260, yFormat = (v) => v.toFixed(2),
  reveal = 1, animate = false, go = true, thresholds = [], yDomain, legend = true, xFormat,
  area = false, testId,
}) {
  const [ref, { width }] = useSize();
  const [hover, setHover] = useState(null);
  const pad = { l: 50, r: 12, t: 10, b: 24 };
  const W = Math.max(0, width);
  const pw = Math.max(1, W - pad.l - pad.r);
  const ph = Math.max(1, height - pad.t - pad.b);
  const n = Math.max(0, ...series.map((s) => s.values?.length || 0));

  const geo = useMemo(() => {
    if (!n || !W) return null;
    const idx = downsample(n, Math.max(120, Math.min(1000, Math.round(pw * 1.2))));
    let lo = Infinity, hi = -Infinity;
    for (const s of series) for (const i of idx) {
      const v = s.values[i];
      if (typeof v === "number" && Number.isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    }
    for (const t of thresholds) { lo = Math.min(lo, t.y); hi = Math.max(hi, t.y); }
    if (yDomain) { lo = yDomain[0]; hi = yDomain[1]; }
    if (!Number.isFinite(lo)) { lo = 0; hi = 1; }
    if (lo === hi) { lo -= 1; hi += 1; }
    const padY = (hi - lo) * 0.06;
    if (!yDomain) { lo -= padY; hi += padY; }
    const x = (i) => pad.l + (n <= 1 ? 0 : (i / (n - 1)) * pw);
    const y = (v) => pad.t + ph - ((v - lo) / (hi - lo)) * ph;
    const paths = series.map((s) => {
      let d = "", pen = false;
      for (const i of idx) {
        const v = s.values[i];
        if (typeof v !== "number" || !Number.isFinite(v)) { pen = false; continue; }
        d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
        pen = true;
      }
      return d;
    });
    const yt = niceTicks(lo, hi, 5).filter((v) => v >= lo && v <= hi);
    const xt = [];
    const count = Math.max(2, Math.min(8, Math.floor(pw / 110)));
    for (let k = 0; k < count; k++) xt.push(Math.round((k / (count - 1)) * (n - 1)));
    return { x, y, lo, hi, paths, yt, xt };
  }, [n, W, pw, ph, series, thresholds, yDomain, pad.l, pad.t]);

  const onMove = (e) => {
    if (!geo) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - pad.l) / pw) * (n - 1));
    if (i < 0 || i >= n || i > (n - 1) * reveal) { setHover(null); return; }
    setHover({ i, px: geo.x(i) });
  };

  const fmtX = xFormat || ((d) => (d ? d.slice(0, 7) : ""));
  const clipId = useMemo(() => `clip-${Math.random().toString(36).slice(2, 9)}`, []);

  return (
    <div className="chart" ref={ref} style={{ height: legend && series.length > 1 ? height + 26 : height }} data-testid={testId}>
      {geo && (
        <svg width={W} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img">
          <defs>
            <clipPath id={clipId}><rect x={pad.l} y={0} width={pw * reveal} height={height} /></clipPath>
          </defs>
          {geo.yt.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={pad.l + pw} y1={geo.y(v)} y2={geo.y(v)} stroke="#192231" strokeDasharray="2 4" />
              <text x={pad.l - 8} y={geo.y(v) + 3} textAnchor="end" fontSize="10" fill="#475569" fontFamily="var(--mono)">{yFormat(v)}</text>
            </g>
          ))}
          {geo.xt.map((i) => (
            <text key={i} x={geo.x(i)} y={height - 6} textAnchor={i === 0 ? "start" : i === n - 1 ? "end" : "middle"} fontSize="10" fill="#475569" fontFamily="var(--mono)">
              {fmtX(dates[i])}
            </text>
          ))}
          <g clipPath={`url(#${clipId})`}>
            {bands.map((b, k) => (
              <rect key={k} x={geo.x(b.from)} width={Math.max(1, geo.x(b.to) - geo.x(b.from) + pw / Math.max(1, n))} y={pad.t} height={ph}
                fill={b.color} opacity={b.opacity ?? 0.14} />
            ))}
            {thresholds.map((t) => (
              <g key={t.label}>
                <line x1={pad.l} x2={pad.l + pw} y1={geo.y(t.y)} y2={geo.y(t.y)} stroke={t.color} strokeOpacity="0.55" strokeDasharray="5 5" />
                <text x={pad.l + pw - 4} y={geo.y(t.y) - 4} textAnchor="end" fontSize="9.5" fill={t.color} fontFamily="var(--mono)">{t.label}</text>
              </g>
            ))}
            {area && series[0] && geo.paths[0] && (
              <path d={`${geo.paths[0]}L${geo.x(n - 1)},${pad.t + ph}L${pad.l},${pad.t + ph}Z`} fill={series[0].color} opacity="0.08" />
            )}
            {series.map((s, k) => (
              <path key={s.key} d={geo.paths[k]} fill="none" stroke={s.color} strokeWidth={s.width || 1.7}
                strokeDasharray={animate ? "1" : s.dash} pathLength={animate ? 1 : undefined}
                strokeLinejoin="round"
                style={animate ? { strokeDashoffset: go ? 0 : 1, transition: `stroke-dashoffset ${s.duration || 2.6}s cubic-bezier(.45,0,.2,1) ${s.delay || 0}s` } : undefined} />
            ))}
          </g>
          {hover && (
            <line x1={hover.px} x2={hover.px} y1={pad.t} y2={pad.t + ph} stroke="#334155" />
          )}
        </svg>
      )}
      {hover && geo && (
        <div className="chart-tip" style={{ left: Math.min(hover.px + 10, W - 170), top: 8 }}>
          <div className="muted">{dates[hover.i] || `#${hover.i}`}</div>
          {series.map((s) => (
            <div key={s.key} style={{ color: s.color }}>
              {s.name}: {typeof s.values[hover.i] === "number" ? yFormat(s.values[hover.i]) : "—"}
            </div>
          ))}
        </div>
      )}
      {legend && series.length > 1 && (
        <div className="chart-legend">
          {series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.name}</span>)}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ regime strip (canvas) */
export function RegimeStrip({ dates = [], states = [], height = 44, reveal = 1, cursorIndex, testId = "regime-strip" }) {
  const [wrap, { width }] = useSize();
  const canvas = useRef(null);
  useEffect(() => {
    const c = canvas.current;
    if (!c || !width || !states.length) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = (height + 16) * dpr;
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height + 16);
    const n = states.length;
    const cw = width / n;
    const lim = Math.floor(n * reveal);
    for (let i = 0; i < lim; i++) {
      ctx.fillStyle = REGIME[states[i]]?.color || "#334155";
      ctx.globalAlpha = 0.9;
      ctx.fillRect(i * cw, 0, Math.ceil(cw) + 0.6, height);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#64748b";
    ctx.font = "10px 'JetBrains Mono', monospace";
    let lastYear = "";
    let lastX = -60;
    for (let i = 0; i < n; i++) {
      const yr = dates[i]?.slice(0, 4);
      if (yr && yr !== lastYear) {
        lastYear = yr;
        const x = i * cw;
        if (x - lastX > 44) {
          ctx.fillRect(x, height, 1, 4);
          ctx.fillText(yr, x + 2, height + 13);
          lastX = x;
        }
      }
    }
    if (cursorIndex != null) {
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(cursorIndex * cw, 0, 2, height);
    }
  }, [width, states, dates, height, reveal, cursorIndex]);
  return (
    <div ref={wrap} style={{ width: "100%" }} data-testid={testId}>
      <canvas ref={canvas} style={{ width: "100%", height: height + 16, display: "block" }} />
    </div>
  );
}

export function RegimeLegend() {
  return (
    <div className="row-wrap" style={{ gap: 14 }}>
      {REGIMES.map((s) => (
        <span key={s} className="light" style={{ "--c": REGIME[s].color }}><i />{s}</span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ gauge */
export function Gauge({ value, label, color = "#38bdf8", size = 150, go = true, display, testId }) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  const r = size / 2 - 12;
  const cx = size / 2, cy = size / 2;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <div className="col" style={{ alignItems: "center", gap: 2 }} data-testid={testId}>
      <svg width={size} height={size / 2 + 14} viewBox={`0 0 ${size} ${size / 2 + 14}`}>
        <path d={arc} fill="none" stroke="#1e293b" strokeWidth="9" strokeLinecap="round" />
        <path d={arc} fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" pathLength="1"
          strokeDasharray="1" style={{ strokeDashoffset: go ? 1 - v : 1, transition: "stroke-dashoffset 1.4s cubic-bezier(.22,1,.36,1)", filter: `drop-shadow(0 0 6px ${color}88)` }} />
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#f8fafc" fontFamily="var(--mono)" fontWeight="700" fontSize={size / 6.2}>
          {display ?? (value == null ? "—" : Math.round(v * 100))}
        </text>
      </svg>
      {label && <div className="label" style={{ fontSize: 10 }}>{label}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ transition matrix */
export function TransitionMatrix({ matrix }) {
  if (!matrix) return null;
  return (
    <div className="scroll-x" data-testid="transition-matrix">
      <table className="data" style={{ minWidth: 380 }}>
        <thead>
          <tr>
            <th>From ↓ to →</th>
            {REGIMES.map((c) => <th key={c} className="num" style={{ color: REGIME[c].color }}>{c.slice(0, 5)}</th>)}
          </tr>
        </thead>
        <tbody>
          {REGIMES.map((r) => (
            <tr key={r}>
              <td style={{ color: REGIME[r].color, fontWeight: 600 }}>{r}</td>
              {REGIMES.map((c) => {
                const v = matrix?.[r]?.[c] ?? 0;
                const hex = Math.round(Math.min(1, v) * 190 + 12).toString(16).padStart(2, "0");
                return (
                  <td key={c} style={{ padding: 2 }}>
                    <div className="tnum" style={{ textAlign: "center", padding: "8px 4px", background: `${REGIME[c].color}${hex}`, color: v > 0.45 ? "#0a0e14" : "#cbd5e1", fontWeight: v > 0.45 ? 700 : 400 }}>
                      {(v * 100).toFixed(1)}%
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ donut */
export function Donut({ data = [], size = 180, center, testId }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const r = size / 2 - 10, ir = r * 0.62, cx = size / 2, cy = size / 2;
  let a0 = -Math.PI / 2;
  const arcs = data.filter((d) => d.value > 0).map((d) => {
    const a1 = a0 + (d.value / total) * Math.PI * 2 - (data.length > 1 ? 0.02 : 0);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${cx + rad * Math.cos(ang)},${cy + rad * Math.sin(ang)}`;
    const path = total && d.value === total
      ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} L ${cx - 0.01} ${cy - ir} A ${ir} ${ir} 0 1 0 ${cx} ${cy - ir} Z`
      : `M ${p(r, a0)} A ${r} ${r} 0 ${large} 1 ${p(r, a1)} L ${p(ir, a1)} A ${ir} ${ir} 0 ${large} 0 ${p(ir, a0)} Z`;
    a0 = a1 + (data.length > 1 ? 0.02 : 0);
    return { ...d, path };
  });
  return (
    <div className="row" style={{ gap: 18, flexWrap: "wrap" }} data-testid={testId}>
      <svg width={size} height={size}>
        {total === 0 && <circle cx={cx} cy={cy} r={(r + ir) / 2} fill="none" stroke="#1e293b" strokeWidth={r - ir} />}
        {arcs.map((a) => <path key={a.label} d={a.path} fill={a.color}><title>{`${a.label}: ${a.value}`}</title></path>)}
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#f8fafc" fontFamily="var(--mono)" fontWeight="700" fontSize="22">{center ?? total}</text>
        <text x={cx} y={cy + 15} textAnchor="middle" fill="#64748b" fontFamily="var(--mono)" fontSize="9.5">REJECTIONS</text>
      </svg>
      <div className="col" style={{ gap: 6 }}>
        {data.map((d) => (
          <div key={d.label} className="row mono" style={{ fontSize: 12 }}>
            <span style={{ width: 9, height: 9, background: d.color, display: "inline-block" }} />
            <span className="dim" style={{ minWidth: 80 }}>{d.label}</span>
            <span className="tnum">{d.value}</span>
            <span className="muted tnum">{total ? `${Math.round((d.value / total) * 100)}%` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sparkline */
export function Sparkline({ values = [], color = "#38bdf8", width = 120, height = 32 }) {
  if (!values || values.length < 2) return <span className="muted mono" style={{ fontSize: 11 }}>—</span>;
  const lo = Math.min(...values), hi = Math.max(...values);
  const d = values.map((v, i) => `${i ? "L" : "M"}${((i / (values.length - 1)) * width).toFixed(1)},${(height - ((v - lo) / (hi - lo || 1)) * (height - 2) - 1).toFixed(1)}`).join("");
  return <svg width={width} height={height}><path d={d} fill="none" stroke={color} strokeWidth="1.4" /></svg>;
}
