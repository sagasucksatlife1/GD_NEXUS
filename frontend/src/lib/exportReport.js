/**
 * Builds a self-contained HTML report of strategy lineages (thesis, every version's code, patch diff,
 * error + traceback, diagnosis, backtest + holdout stats with equity curves, cause of death) and downloads it.
 * Open the file in any browser; Cmd+P -> Save as PDF to print it.
 */
import { AGENT, prettyName } from "./format";

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const n = (x, d = 2) => (typeof x === "number" && Number.isFinite(x) ? x.toFixed(d) : "—");
const p = (x) => (typeof x === "number" && Number.isFinite(x) ? `${x > 0 ? "+" : ""}${(x * 100).toFixed(1)}%` : "—");

function svgCurve(series, w = 640, h = 140) {
  const all = series.flatMap((s) => s.values || []);
  if (all.length < 2) return "";
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const total = series.reduce((k, s) => k + (s.values?.length || 0), 0);
  let off = 0;
  const paths = series.map((s) => {
    const v = s.values || [];
    const d = v.map((y, i) => `${i ? "L" : "M"}${(((off + i) / Math.max(total - 1, 1)) * w).toFixed(1)},${(h - ((y - lo) / span) * (h - 10) - 5).toFixed(1)}`).join("");
    off += v.length;
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="1.5"/>`;
  }).join("");
  const labels = series.filter((s) => s.values?.length).map((s) =>
    `<span style="color:${s.color}">■ ${esc(s.name)} ${esc(s.dates?.[0] || "")} → ${esc(s.dates?.[s.dates.length - 1] || "")}</span>`).join(" &nbsp; ");
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="${h}" class="curve">${paths}</svg><div class="legend">${labels}</div>`;
}

function statsTable(st, title) {
  if (!st) return "";
  const rows = [
    ["Sharpe", n(st.sharpe)], ["Deflated Sharpe", n(st.dsr, 3)], ["Ann. return", p(st.ann_ret)], ["Ann. vol", p(st.ann_vol)],
    ["Max drawdown", p(st.maxdd)], ["Split-half Sharpe", (st.split_half || []).map((x) => n(x)).join(" / ") || "—"],
    ["Beta", n(st.beta)], ["Alpha (ann.)", p(st.alpha_ann)], ["Alpha t-stat", n(st.alpha_t)],
    ["Turnover (ann.)", n(st.turnover_ann, 1)], ["Avg gross", n(st.avg_gross)], ["Trials counted", st.n_trials ?? "—"],
    ["Window", `${st.start || "?"} → ${st.end || "?"}`],
  ];
  return `<table class="stats"><caption>${esc(title)}</caption>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${esc(v)}</td></tr>`).join("")}</table>`;
}

function diffHtml(diff) {
  return diff.split("\n").map((l) => {
    const c = l.startsWith("+") && !l.startsWith("+++") ? "add" : l.startsWith("-") && !l.startsWith("---") ? "del" : l.startsWith("@@") ? "hunk" : "";
    return `<span class="${c}">${esc(l)}</span>`;
  }).join("\n");
}

function versionHtml(V) {
  const e = V.error;
  return `
  <div class="version">
    <h4>Version ${V.version} <span class="vs vs-${esc(V.status)}">${esc(V.status)}</span></h4>
    ${e ? `<div class="err"><b>Error (${esc(e.type)}${e.line ? `, line ${e.line}` : ""}):</b> ${esc(e.message)}</div>` : ""}
    ${V.traceback ? `<details><summary>Full traceback</summary><pre>${esc(V.traceback)}</pre></details>` : ""}
    ${V.diagnosis ? `<div class="diag"><b>Diagnosis (repair agent):</b> ${esc(V.diagnosis)}</div>` : ""}
    ${V.diff ? `<h5>Patch diff (v${V.version - 1} → v${V.version})</h5><pre class="diff">${diffHtml(V.diff)}</pre>` : ""}
    ${V.stats || V.holdout?.stats ? `<div class="statrow">${statsTable(V.stats, "Research window backtest")}${statsTable(V.holdout?.stats, "Sealed holdout (2022+)")}</div>` : ""}
    ${V.equity?.values?.length || V.holdout?.equity?.values?.length ? svgCurve([
      { name: "research", color: "#2563eb", values: V.equity?.values, dates: V.equity?.dates },
      { name: "holdout", color: "#059669", values: V.holdout?.equity?.values, dates: V.holdout?.equity?.dates },
    ]) : ""}
    <h5>Code (v${V.version})</h5>
    <pre class="code">${esc(V.code || "(no code recorded)")}</pre>
  </div>`;
}

function lineageHtml(L, i) {
  const a = AGENT[L.agent];
  return `
  <section class="lineage" id="s${i}">
    <h2>${i + 1}. ${esc(prettyName(L))}</h2>
    <div class="meta">
      <span class="tag" style="border-color:${a?.color || "#64748b"};color:${a?.color || "#334155"}">${esc(L.agent)} · ${esc(a?.name || "")}</span>
      <span class="st st-${esc(L.status)}">${esc(L.status)}</span>
      ${L.source !== "agent" ? `<span class="tag">${esc(L.source)}</span>` : ""}
      <span>${L.attempts} version(s)</span><span>created ${esc(L.created_at)}</span><span>updated ${esc(L.updated_at)}</span>
      <span class="id">${esc(L.id)}</span>
    </div>
    <h3>Thesis</h3><p class="thesis">${esc(L.thesis || "(none recorded)")}</p>
    ${L.cause_of_death ? `<div class="death"><b>Cause of death:</b> ${esc(L.cause_of_death)}</div>` : ""}
    ${L.versions.map(versionHtml).join("")}
  </section>`;
}

const CSS = `
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a;background:#fff;max-width:1000px;margin:24px auto;padding:0 16px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:0 0 6px}h3{font-size:14px;margin:14px 0 4px;text-transform:uppercase;letter-spacing:.06em;color:#475569}
h4{font-size:15px;margin:0 0 8px}h5{font-size:12px;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
.lineage{border-top:3px solid #0f172a;padding:18px 0 8px;margin-top:28px;break-before:page}
.meta{display:flex;flex-wrap:wrap;gap:8px 14px;font-size:12px;color:#475569}.id{font-family:ui-monospace,Menlo,monospace;color:#94a3b8}
.tag{border:1px solid #cbd5e1;border-radius:4px;padding:0 6px;font-weight:600}
.st{font-weight:700;padding:0 6px;border-radius:4px}.st-VALIDATED{background:#d1fae5;color:#065f46}.st-DEAD{background:#e5e7eb;color:#374151}.st-IN_PROGRESS{background:#ede9fe;color:#5b21b6}
.thesis{margin:0;white-space:pre-wrap}
.death{background:#f1f5f9;border-left:3px solid #64748b;padding:8px 10px;margin:10px 0}
.version{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin:14px 0}
.vs{font-size:11px;padding:1px 6px;border-radius:4px;background:#f1f5f9}.vs-PASSED{background:#d1fae5}.vs-REJECTED,.vs-DEAD{background:#fee2e2}
.err{background:#fef2f2;border-left:3px solid #dc2626;padding:8px 10px;margin:6px 0;font-family:ui-monospace,Menlo,monospace;font-size:12.5px;white-space:pre-wrap}
.diag{background:#f5f3ff;border-left:3px solid #7c3aed;padding:8px 10px;margin:6px 0}
pre{background:#0f172a;color:#e2e8f0;padding:10px 12px;border-radius:6px;overflow-x:auto;font:12px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word}
.diff .add{color:#86efac}.diff .del{color:#fca5a5}.diff .hunk{color:#93c5fd}
.statrow{display:flex;flex-wrap:wrap;gap:16px}.stats{border-collapse:collapse;font-size:12.5px;min-width:280px}
.stats caption{text-align:left;font-weight:700;padding:4px 0}.stats td{border-bottom:1px solid #e2e8f0;padding:2px 10px 2px 0}.stats td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.curve{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;margin-top:8px}.legend{font-size:11px;color:#475569}
.toc{columns:2;font-size:13px}.toc a{color:#0f172a}.summary td{padding:2px 14px 2px 0}
details summary{cursor:pointer;color:#475569;font-size:12px}
@media print{body{max-width:none}pre{white-space:pre-wrap}details{display:block}}`;

export function buildReport(lineages, title = "NEXUS strategy export") {
  const count = (s) => lineages.filter((l) => l.status === s).length;
  const versions = lineages.reduce((k, l) => k + l.attempts, 0);
  const rejects = lineages.reduce((k, l) => k + l.versions.filter((v) => v.error).length, 0);
  const toc = lineages.map((L, i) => `<li><a href="#s${i}">${esc(prettyName(L))}</a> — ${esc(L.agent)}, ${esc(L.status)}, ${L.attempts}v</li>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><style>${CSS}</style></head><body>
<h1>${esc(title)}</h1>
<p style="color:#475569;margin:0">Exported ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC from the NEXUS event log.</p>
<table class="summary" style="margin:12px 0"><tr><td>Strategies</td><td><b>${lineages.length}</b></td><td>Versions</td><td><b>${versions}</b></td><td>Rejected versions</td><td><b>${rejects}</b></td></tr>
<tr><td>Validated</td><td><b>${count("VALIDATED")}</b></td><td>Dead</td><td><b>${count("DEAD")}</b></td><td>In progress</td><td><b>${count("IN_PROGRESS")}</b></td></tr></table>
<h3>Contents</h3><ol class="toc">${toc}</ol>
${lineages.map(lineageHtml).join("")}
</body></html>`;
}

export function downloadReport(lineages, filename, title) {
  const html = buildReport(lineages, title);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
