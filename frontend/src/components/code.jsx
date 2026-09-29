import React, { useEffect, useRef } from "react";

const KW = new Set(["def", "return", "if", "else", "elif", "for", "while", "import", "from", "as", "in", "not", "and",
  "or", "None", "True", "False", "class", "lambda", "with", "try", "except", "finally", "raise", "pass", "break",
  "continue", "yield", "global", "is", "del", "assert"]);

const TOKEN = /(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b\d+\.?\d*(?:e-?\d+)?\b)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g;

function highlight(line) {
  const out = [];
  let last = 0;
  let m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(line)) !== null) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok, com, str, numb, fn, word] = m;
    let cls = null;
    if (com) cls = "tk-com";
    else if (str) cls = "tk-str";
    else if (numb) cls = "tk-num";
    else if (fn) cls = KW.has(fn) ? "tk-kw" : "tk-fn";
    else if (word && KW.has(word)) cls = "tk-kw";
    out.push(cls ? <span key={m.index} className={cls}>{tok}</span> : tok);
    last = m.index + tok.length;
    if (tok.length === 0) TOKEN.lastIndex++;
  }
  if (last < line.length) out.push(line.slice(last));
  return out.length ? out : " ";
}

export function CodeBlock({ code = "", highlightLine, maxHeight = 460, from, to, testId }) {
  const ref = useRef(null);
  const all = String(code || "").replace(/\n$/, "").split("\n");
  const start = from ? Math.max(1, from) : 1;
  const end = to ? Math.min(all.length, to) : all.length;
  const lines = all.slice(start - 1, end);

  useEffect(() => {
    if (!highlightLine || !ref.current) return;
    const el = ref.current.querySelector(".ln.hot");
    if (el) ref.current.scrollTop = Math.max(0, el.offsetTop - 80);
  }, [highlightLine, code]);

  if (!code) return <pre className="code" style={{ padding: 12, color: "var(--muted)" }}>(no code recorded)</pre>;
  return (
    <pre ref={ref} className="code" style={{ maxHeight, padding: "8px 0" }} data-testid={testId}>
      {lines.map((ln, i) => {
        const n = start + i;
        return (
          <div key={n} className={`ln ${n === highlightLine ? "hot" : ""}`}>
            <span className="no">{n}</span>
            <span className="tx">{highlight(ln)}</span>
          </div>
        );
      })}
    </pre>
  );
}

export function parseDiff(diff = "") {
  const rows = [];
  let oldNo = 0, newNo = 0;
  for (const ln of String(diff || "").split("\n")) {
    if (ln.startsWith("+++") || ln.startsWith("---")) rows.push({ type: "meta", text: ln });
    else if (ln.startsWith("@@")) {
      const m = /-(\d+)(?:,\d+)? \+(\d+)/.exec(ln);
      if (m) { oldNo = +m[1]; newNo = +m[2]; }
      rows.push({ type: "hunk", text: ln });
    } else if (ln.startsWith("+")) rows.push({ type: "add", text: ln.slice(1), no: newNo++ });
    else if (ln.startsWith("-")) rows.push({ type: "del", text: ln.slice(1), no: oldNo++ });
    else if (ln.length) { rows.push({ type: "ctx", text: ln.slice(1), no: newNo }); newNo++; oldNo++; }
  }
  return rows;
}

export function diffCounts(diff) {
  const rows = parseDiff(diff);
  return { add: rows.filter((r) => r.type === "add").length, del: rows.filter((r) => r.type === "del").length };
}

export function DiffView({ diff, visible, animate = false, maxHeight = 460, testId = "rejection-diff-view" }) {
  const rows = parseDiff(diff);
  if (!rows.length) return <pre className="code" style={{ padding: 12, color: "var(--muted)" }}>(no diff: patch identical to previous version)</pre>;
  const shown = visible == null ? rows : rows.slice(0, visible);
  const sign = { add: "+", del: "−", ctx: " ", hunk: " ", meta: " " };
  return (
    <pre className="code" style={{ maxHeight, padding: "8px 0" }} data-testid={testId}>
      {shown.map((r, i) => (
        <div key={i} className={`ln ${r.type} ${animate ? "enter" : ""}`}>
          <span className="no" style={{ color: r.type === "add" ? "#22c55e" : r.type === "del" ? "#f43f5e" : undefined }}>
            {r.type === "hunk" || r.type === "meta" ? "" : sign[r.type]}
          </span>
          <span className="tx">{r.type === "hunk" || r.type === "meta" ? r.text : highlight(r.text)}</span>
        </div>
      ))}
    </pre>
  );
}
