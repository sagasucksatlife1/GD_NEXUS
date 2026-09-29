import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { derive } from "./derive";
import { useLocalStorage } from "./hooks";

export const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
const DATA_URL = `${import.meta.env.BASE_URL || "/"}data`;

const DataCtx = createContext(null);

async function getJSON(url, { optional = false } = {}) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) {
    if (optional) return null;
    throw new Error(`${r.status} ${r.statusText} — ${url}`);
  }
  return r.json();
}

export function DataProvider({ children }) {
  const [mode, setModeRaw] = useLocalStorage("nexus_mode", "REPLAY"); // REPLAY | LIVE
  const [events, setEvents] = useState([]);
  const [csi, setCsi] = useState(null);
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: null });

  // replay transport
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(10);
  const acc = useRef(0);

  // live
  const [health, setHealth] = useState(null);
  const [control, setControl] = useState(null);
  const lastId = useRef(null);

  const [cmdOpen, setCmdOpen] = useState(false);

  const setMode = useCallback((m) => {
    setPlaying(false);
    setModeRaw(m);
  }, [setModeRaw]);

  /* ------------------------------------------------ load per mode */
  const load = useCallback(async () => {
    setStatus({ loading: true, error: null });
    setEvents([]);
    lastId.current = null;
    try {
      if (mode === "REPLAY") {
        const [log, c, m] = await Promise.all([
          getJSON(`${DATA_URL}/repair_log.json`),
          getJSON(`${DATA_URL}/csi_history.json`, { optional: true }),
          getJSON(`${DATA_URL}/meta.json`, { optional: true }),
        ]);
        const evts = Array.isArray(log) ? log : log.events || [];
        setEvents(evts);
        setCursor(evts.length);
        setCsi(c);
        setMeta(m);
      } else {
        const [ev, c] = await Promise.all([
          getJSON(`${API_URL}/api/events?limit=5000`),
          getJSON(`${API_URL}/api/csi`, { optional: true }),
        ]);
        setEvents(ev.events || []);
        lastId.current = ev.last_event_id || null;
        setCsi(c);
        setMeta({ synthetic: false, live: true });
      }
      setStatus({ loading: false, error: null });
    } catch (err) {
      setStatus({
        loading: false,
        error: mode === "LIVE"
          ? `Can't reach the NEXUS backend at ${API_URL}. Start it with: uvicorn nexus.server:app --port 8000`
          : `Archive data missing (${err.message}). Put the export from scripts/export.py in public/data/.`,
      });
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);

  /* ------------------------------------------------ replay ticker */
  useEffect(() => {
    if (mode !== "REPLAY" || !playing) return;
    const id = setInterval(() => {
      acc.current += speed / 10;
      const step = Math.floor(acc.current);
      if (step < 1) return;
      acc.current -= step;
      setCursor((c) => {
        const n = Math.min(events.length, c + step);
        if (n >= events.length) setPlaying(false);
        return n;
      });
    }, 100);
    return () => clearInterval(id);
  }, [mode, playing, speed, events.length]);

  const play = useCallback(() => {
    setCursor((c) => (c >= events.length ? 0 : c));
    acc.current = 0;
    setPlaying(true);
  }, [events.length]);

  /* ------------------------------------------------ live polling */
  useEffect(() => {
    if (mode !== "LIVE" || status.loading || status.error) return;
    let alive = true;
    const pollEvents = async () => {
      try {
        const q = lastId.current ? `?after=${lastId.current}&limit=2000` : "?limit=5000";
        const res = await getJSON(`${API_URL}/api/events${q}`);
        if (!alive || !res.events?.length) return;
        lastId.current = res.last_event_id;
        setEvents((prev) => {
          const seen = new Set(prev.slice(-200).map((e) => e.event_id));
          return prev.concat(res.events.filter((e) => !seen.has(e.event_id)));
        });
      } catch { /* transient: keep polling */ }
    };
    const pollControl = async () => {
      try { const c = await getJSON(`${API_URL}/api/control`); if (alive) setControl(c); } catch { if (alive) setControl(null); }
    };
    const pollHealth = async () => {
      try { const h = await getJSON(`${API_URL}/api/health`); if (alive) setHealth(h); } catch { if (alive) setHealth({ ok: false, unreachable: true }); }
    };
    pollHealth(); pollControl();
    const a = setInterval(pollEvents, 2000);
    const b = setInterval(pollControl, 2000);
    const c = setInterval(pollHealth, 10000);
    return () => { alive = false; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [mode, status.loading, status.error]);

  const sendControl = useCallback(async (action, body) => {
    const opts = body
      ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : { method: "POST" };
    const url = body ? `${API_URL}/api/control` : `${API_URL}/api/control/${action}`;
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const state = await r.json();
    setControl((c) => ({ ...(c || {}), ...state }));
    return state;
  }, []);

  const rebuildCsi = useCallback(async () => {
    const r = await fetch(`${API_URL}/api/csi/rebuild`, { method: "POST" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    setCsi(await getJSON(`${API_URL}/api/csi`));
  }, []);

  /* ------------------------------------------------ derived view */
  const visible = useMemo(
    () => (mode === "REPLAY" ? events.slice(0, cursor) : events),
    [mode, events, cursor]
  );
  const derived = useMemo(() => derive(visible), [visible]);
  const full = useMemo(() => (mode === "REPLAY" && cursor < events.length ? derive(events) : derived), [mode, cursor, events, derived]);

  // keyboard: Cmd/Ctrl+K palette, space toggles replay when not typing
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = {
    mode, setMode, status, reload: load,
    events, visible, csi, meta,
    ...derived, full,
    replay: { cursor, setCursor, playing, setPlaying, play, speed, setSpeed, total: events.length },
    live: { health, control, sendControl, rebuildCsi },
    cmdOpen, setCmdOpen,
  };
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error("useData must be used inside DataProvider");
  return ctx;
}
