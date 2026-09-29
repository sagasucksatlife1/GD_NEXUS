import React, { useEffect, useState } from "react";
import { useData, API_URL } from "../../lib/data";
import { PageHead, Panel, Empty, Icon, Badge, Stat } from "../../components/ui";
import { AGENT, time } from "../../lib/format";

export default function Control() {
  const { mode, setMode, live } = useData();
  const { control: c, health: h, sendControl, rebuildCsi } = live;
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState(null);
  const [attempts, setAttempts] = useState(4);

  useEffect(() => { if (c?.max_attempts) setAttempts(c.max_attempts); }, [c?.max_attempts]);

  if (mode !== "LIVE") {
    return (
      <div className="col" style={{ gap: 12 }}>
        <PageHead title="Control panel" desc="Start, pause and tune the autonomous loop running on your machine." />
        <Panel>
          <Empty title="Available in live mode">
            Replay shows a recorded run, so there is nothing to control. Start the backend with
            <span className="mono" style={{ display: "block", margin: "10px 0", color: "var(--text-2)" }}>uvicorn nexus.server:app --port 8000</span>
            then switch to live.
          </Empty>
          <div className="row" style={{ justifyContent: "center", paddingBottom: 20 }}>
            <button className="btn primary" onClick={() => setMode("LIVE")} data-testid="switch-to-live">Switch to live</button>
          </div>
        </Panel>
      </div>
    );
  }

  const act = async (label, fn) => {
    setBusy(label); setMsg(null);
    try { await fn(); setMsg({ ok: true, text: `${label} sent` }); }
    catch (e) { setMsg({ ok: false, text: `${label} failed: ${e.message}` }); }
    setBusy("");
  };
  const enabled = c?.agents_enabled || [];
  const status = c?.status || "unreachable";
  const statusColor = { running: "#10b981", paused: "#f59e0b", stopped: "#6b7280", stopping: "#f59e0b" }[status] || "#ef4444";

  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead title="Control panel" desc={`Connected to ${API_URL}. Changes apply between steps of the loop, never mid-backtest.`} />

      {msg && <div className="mono" style={{ fontSize: 12, color: msg.ok ? "var(--green)" : "#fca5a5" }} role="status">{msg.text}</div>}

      <div className="grid g4">
        <Stat label="Daemon" value={<span style={{ color: statusColor, fontSize: 22 }}>{status}</span>} sub={c?.started_at ? `since ${time(c.started_at)}` : ""} accent={statusColor} />
        <Stat label="Cycles completed" value={c?.cycles ?? "—"} accent="#38bdf8" />
        <Stat label="Now" value={<span style={{ fontSize: 16 }}>{c?.current ? `${c.current.agent} · ${c.current.stage}` : "idle"}</span>} sub={c?.current?.lineage || ""} accent="#c084fc" />
        <Stat label="Max versions per idea" value={c?.max_attempts ?? "—"} sub="v1 plus repairs" accent="#f59e0b" />
      </div>

      <div className="grid g2">
        <Panel title="Loop">
          <div className="col" style={{ gap: 16 }}>
            <div className="row-wrap">
              <button className="btn primary" disabled={!!busy || status === "running"} onClick={() => act("Start", () => sendControl("start"))} data-testid="control-start"><Icon name="play" size={12} /> Start</button>
              <button className="btn" disabled={!!busy || status !== "running"} onClick={() => act("Pause", () => sendControl("pause"))} data-testid="control-pause"><Icon name="pause" size={12} /> Pause</button>
              <button className="btn danger" disabled={!!busy || status === "stopped"} onClick={() => act("Stop", () => sendControl("stop"))} data-testid="control-stop"><Icon name="stop" size={12} /> Stop</button>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Agents</div>
              <div className="row-wrap">
                {["M6", "M8"].map((a) => {
                  const on = enabled.includes(a);
                  return (
                    <button key={a} className={`chip ${on ? "on" : ""}`} style={{ "--c": AGENT[a].color, padding: "6px 12px" }} disabled={!!busy}
                      onClick={() => act(`${on ? "Disable" : "Enable"} ${a}`, () => sendControl(null, { agents_enabled: on ? enabled.filter((x) => x !== a) : [...enabled, a] }))}
                      data-testid={`control-agent-${a.toLowerCase()}`}>
                      {a} {AGENT[a].name} · {on ? "on" : "off"}
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="label" style={{ marginBottom: 8 }}>Max versions per idea: {attempts}</div>
              <div className="row">
                <input type="range" min={1} max={10} value={attempts} onChange={(e) => setAttempts(+e.target.value)} style={{ flex: 1, accentColor: "var(--sky)" }} aria-label="Max versions per idea" />
                <button className="btn sm" disabled={!!busy || attempts === c?.max_attempts} onClick={() => act("Save limit", () => sendControl(null, { max_attempts: attempts }))}>Save</button>
              </div>
              <p className="prose-sm" style={{ marginTop: 6 }}>Every extra attempt is counted as a trial, which raises the bar the deflated Sharpe ratio sets.</p>
            </div>
          </div>
        </Panel>

        <Panel title="Health">
          <div className="col" style={{ gap: 10 }}>
            <HealthRow label="API" ok={h ? !h.unreachable : null} detail={h?.unreachable ? "unreachable" : "reachable"} />
            <HealthRow label="LLM" ok={h?.llm?.ok} detail={h?.llm ? `${h.llm.backend} · ${h.llm.model}${h.llm.error ? ` · ${h.llm.error}` : ""}` : "—"} />
            <HealthRow label="Sandbox" ok={h?.sandbox?.ok} detail={h?.sandbox?.error?.message || (h?.sandbox?.ok ? "self-test passed" : "—")} />
            <HealthRow label="Prices" ok={h ? true : null} detail={h?.synthetic_data ? "synthetic (NEXUS_SYNTHETIC=1)" : "yfinance"} warn={h?.synthetic_data} />
            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" disabled={!!busy} onClick={() => act("Rebuild CSI", rebuildCsi)}><Icon name="refresh" size={12} /> Rebuild CSI</button>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Last loop error">
        {c?.last_error ? (
          <div className="col" style={{ gap: 8 }}>
            <div className="mono" style={{ color: "#fca5a5", fontSize: 12.5 }}>{c.last_error.message} <span className="muted">at {time(c.last_error.at)}</span></div>
            <pre className="traceback">{c.last_error.traceback}</pre>
          </div>
        ) : <Empty title="No infrastructure errors">Sandbox rejections are not errors, they are in the rejection console.</Empty>}
      </Panel>
    </div>
  );
}

function HealthRow({ label, ok, detail, warn }) {
  const color = ok == null ? "#475569" : warn ? "#f59e0b" : ok ? "#10b981" : "#ef4444";
  return (
    <div className="row" style={{ gap: 12 }}>
      <span className="light" style={{ "--c": color, width: 90 }}><i />{label}</span>
      <span className="mono dim" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis" }}>{detail}</span>
      <span className="spacer" />
      {ok != null && <Badge color={color}>{ok ? (warn ? "check" : "ok") : "down"}</Badge>}
    </div>
  );
}
