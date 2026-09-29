/**
 * Everything on the site is derived from ONE append-only event stream (repair_log.json / GET /api/events).
 * That is what makes replay work: slice the stream at the scrubber, re-derive, the whole UI rewinds.
 */

function newVersion(v) {
  return { version: v, code: null, diff: null, error: null, traceback: null, diagnosis: null,
           stats: null, equity: null, holdout: null, status: "PENDING", events: [] };
}

function columnFor(L) {
  const e = L.lastEvent;
  if (!e) return "GENERATED";
  switch (e.event_type) {
    case "generated": return "GENERATED";
    case "rebacktest": return "SANDBOX";
    case "sandbox_reject": return "REJECTED";
    case "diagnosis": return "REPAIR";
    case "patch": return "RETEST";
    case "verdict": {
      const v = e.payload?.verdict;
      if (v === "VALIDATED") return "VALIDATED";
      if (v === "DEAD") return "DEAD";
      return "REPAIR";
    }
    default: return "GENERATED";
  }
}

export function derive(events = []) {
  const map = new Map();
  const rejects = [];

  for (const e of events) {
    const id = e.lineage_root;
    const p = e.payload || {};
    let L = map.get(id);
    if (!L) {
      L = { id, agent: e.agent, name: null, thesis: null, source: "agent", status: "IN_PROGRESS",
            versions: new Map(), events: [], created_at: e.timestamp, updated_at: e.timestamp,
            cause_of_death: null, lastEvent: null };
      map.set(id, L);
    }
    L.events.push(e);
    L.updated_at = e.timestamp;
    L.lastEvent = e;
    let V = L.versions.get(e.version);
    if (!V) { V = newVersion(e.version); L.versions.set(e.version, V); }
    V.events.push(e);

    switch (e.event_type) {
      case "generated":
        V.code = p.code ?? V.code;
        L.name = p.name || L.name;
        L.thesis = p.thesis || L.thesis;
        L.source = p.source || L.source;
        break;
      case "patch":
        V.code = p.code ?? V.code;
        V.diff = p.diff ?? null;
        break;
      case "sandbox_reject":
        V.error = p.error || null;
        V.traceback = p.traceback || null;
        V.status = "REJECTED";
        if (p.stats) { V.stats = p.stats; V.equity = p.equity || V.equity; }
        if (p.code && !V.code) V.code = p.code;
        rejects.push(e);
        break;
      case "diagnosis":
        V.diagnosis = p.diagnosis || null;
        break;
      case "rebacktest":
        V.stats = p.stats || null;
        V.equity = p.equity || null;
        if (V.status === "PENDING") V.status = "TESTED";
        break;
      case "verdict":
        if (p.verdict === "VALIDATED") {
          L.status = "VALIDATED";
          V.status = "PASSED";
          V.holdout = p.holdout || null;
          L.cause_of_death = null;
        } else if (p.verdict === "DEAD") {
          L.status = "DEAD";
          V.status = "DEAD";
          if (p.holdout) V.holdout = p.holdout;
          if (p.error && !V.error) V.error = p.error;
          L.cause_of_death = p.cause_of_death || p.error?.message || "Exhausted repair attempts";
        }
        break;
      default:
        break;
    }
  }

  const lineages = [];
  for (const L of map.values()) {
    L.versions = [...L.versions.values()].sort((a, b) => a.version - b.version);
    L.attempts = L.versions.length;
    L.column = columnFor(L);
    L.latest = L.versions[L.versions.length - 1];
    L.best = L.versions.find((v) => v.status === "PASSED") || L.latest;
    lineages.push(L);
  }
  lineages.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));

  // rejection console records: rejected version, its diagnosis, the patch that followed, and what happened next
  const rejections = rejects.map((e) => {
    const L = map.get(e.lineage_root);
    const V = L.versions.find((v) => v.version === e.version);
    const next = L.versions.find((v) => v.version === e.version + 1) || null;
    let outcome;
    if (next) {
      if (next.status === "PASSED") outcome = "repaired";
      else if (next.status === "REJECTED" || next.status === "DEAD") outcome = "failed_again";
      else outcome = "retesting";
    } else if (L.status === "DEAD") outcome = "died";
    else outcome = "repairing";
    return { event: e, lineage: L, version: V, next, outcome };
  }).reverse();

  return { lineages, byId: map, rejections, summary: summarize(events, lineages, rejects) };
}

function taxonomy(rejects) {
  const t = {};
  for (const e of rejects) {
    const k = e.payload?.error?.type || "runtime";
    t[k] = (t[k] || 0) + 1;
  }
  return t;
}

function summarize(events, lineages, rejects) {
  const agents = {};
  for (const a of ["M6", "M8"]) {
    const al = lineages.filter((l) => l.agent === a);
    const ar = rejects.filter((e) => e.agent === a);
    const val = al.filter((l) => l.status === "VALIDATED");
    const best = [...val].sort((x, y) => (y.best?.stats?.sharpe ?? -9) - (x.best?.stats?.sharpe ?? -9))[0] || null;
    agents[a] = {
      lineages: al.length,
      versions: al.reduce((s, l) => s + l.attempts, 0),
      rejections: ar.length,
      validated: val.length,
      dead: al.filter((l) => l.status === "DEAD").length,
      inProgress: al.filter((l) => l.status === "IN_PROGRESS").length,
      avgAttemptsToPass: val.length ? val.reduce((s, l) => s + l.attempts, 0) / val.length : null,
      rejectRate: al.reduce((s, l) => s + l.attempts, 0) ? ar.length / al.reduce((s, l) => s + l.attempts, 0) : null,
      taxonomy: taxonomy(ar),
      best,
    };
  }
  return {
    events: events.length,
    lineages: lineages.length,
    versions: lineages.reduce((s, l) => s + l.attempts, 0),
    rejections: rejects.length,
    repairs: events.filter((e) => e.event_type === "patch").length,
    validated: lineages.filter((l) => l.status === "VALIDATED").length,
    dead: lineages.filter((l) => l.status === "DEAD").length,
    inProgress: lineages.filter((l) => l.status === "IN_PROGRESS").length,
    taxonomy: taxonomy(rejects),
    agents,
    lastEvent: events[events.length - 1] || null,
  };
}

/* ------------------------------------------------------------ portfolio math */

function stateLookup(csi) {
  if (!csi?.dates?.length) return () => null;
  const { dates, state } = csi;
  return (d) => {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? state[ans] : null;
  };
}

export function curveStats(values, periods = 52) {
  if (!values || values.length < 3) return null;
  const r = [];
  for (let i = 1; i < values.length; i++) r.push(values[i] / values[i - 1] - 1);
  const m = r.reduce((s, x) => s + x, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, r.length - 1));
  let peak = values[0], dd = 0;
  for (const v of values) { peak = Math.max(peak, v); dd = Math.min(dd, v / peak - 1); }
  const years = r.length / periods;
  return {
    annRet: Math.pow(values[values.length - 1] / values[0], 1 / Math.max(years, 1e-9)) - 1,
    annVol: sd * Math.sqrt(periods),
    sharpe: sd > 0 ? (m / sd) * Math.sqrt(periods) : 0,
    maxdd: dd,
  };
}

export function drawdown(values) {
  let peak = values[0] ?? 1;
  return values.map((v) => { peak = Math.max(peak, v); return v / peak - 1; });
}

/**
 * Equal-weight book of validated lineages (research-window weekly curves), with and without CSI gating.
 * Gating uses the regime state of the PREVIOUS week, so the rule never peeks at the week it trades.
 */
export function abstentionBook(lineages, csi) {
  const val = lineages.filter((l) => l.status === "VALIDATED" && l.best?.equity?.dates?.length > 3);
  if (!val.length) return null;
  const rets = new Map();
  for (const L of val) {
    const { dates, values } = L.best.equity;
    for (let i = 1; i < dates.length; i++) {
      const d = dates[i];
      const r = values[i] / values[i - 1] - 1;
      const cur = rets.get(d) || [];
      cur.push(r);
      rets.set(d, cur);
    }
  }
  const dates = [...rets.keys()].sort();
  const lookup = stateLookup(csi);
  let eqU = 1, eqG = 1, gatedWeeks = 0, known = 0;
  const outDates = [], u = [], g = [], states = [];
  let prevState = null;
  for (const d of dates) {
    const arr = rets.get(d);
    const r = arr.reduce((s, x) => s + x, 0) / arr.length;
    const off = prevState === "TURBULENT" || prevState === "CRITICAL";
    if (prevState) known++;
    if (off) gatedWeeks++;
    eqU *= 1 + r;
    eqG *= 1 + (off ? 0 : r);
    outDates.push(d); u.push(eqU); g.push(eqG); states.push(prevState);
    prevState = lookup(d);
  }
  return {
    n: val.length, strategies: val, dates: outDates, ungated: u, gated: g, states,
    statsU: curveStats(u), statsG: curveStats(g),
    abstainShare: known ? gatedWeeks / known : 0, csiCoverage: known / Math.max(1, dates.length),
  };
}

/** Runs of a state array → [{from, to, state}] (index space) for band shading. */
export function stateRuns(states, keep = ["TURBULENT", "CRITICAL"]) {
  const runs = [];
  let start = 0;
  for (let i = 1; i <= states.length; i++) {
    if (i === states.length || states[i] !== states[start]) {
      if (keep.includes(states[start])) runs.push({ from: start, to: i - 1, state: states[start] });
      start = i;
    }
  }
  return runs;
}

/** Downsample parallel arrays to about `n` points, keeping the last point. */
export function downsample(length, n = 700) {
  if (length <= n) return Array.from({ length }, (_, i) => i);
  const step = length / n;
  const idx = [];
  for (let i = 0; i < n; i++) idx.push(Math.floor(i * step));
  if (idx[idx.length - 1] !== length - 1) idx.push(length - 1);
  return idx;
}
