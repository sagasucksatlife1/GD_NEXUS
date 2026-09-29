import { useEffect, useRef, useState, useCallback } from "react";

export const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** True once the element has entered the viewport (fires once unless `once` is false). */
export function useInView({ threshold = 0.25, once = true } = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (once) io.disconnect();
      } else if (!once) setInView(false);
    }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, once]);
  return [ref, inView];
}

/** 0..1 progress of an element scrolling through the viewport. */
export function useScrollProgress() {
  const ref = useRef(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const v = (vh - r.top) / (vh * 0.9 + r.height * 0.35);
      setP(Math.max(0, Math.min(1, v)));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(raf); };
  }, []);
  return [ref, p];
}

export function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((s) => (Math.abs(s.width - width) < 1 && Math.abs(s.height - height) < 1 ? s : { width, height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

export function useInterval(fn, ms) {
  const saved = useRef(fn);
  useEffect(() => { saved.current = fn; }, [fn]);
  useEffect(() => {
    if (ms == null) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/** Types `text` out once `start` is true. */
export function useTypewriter(text = "", start = true, cps = 60) {
  const [n, setN] = useState(0);
  useEffect(() => { setN(0); }, [text]);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) { setN(text.length); return; }
    if (n >= text.length) return;
    const id = setTimeout(() => setN((x) => Math.min(text.length, x + Math.max(1, Math.round(cps / 30)))), 33);
    return () => clearTimeout(id);
  }, [n, start, text, cps]);
  return [text.slice(0, n), n >= text.length];
}

/** Counts up to `target` when `start` flips true. */
export function useCountUp(target = 0, start = true, ms = 1400) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!start) return;
    if (reducedMotion()) { setV(target); return; }
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(target * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, start, ms]);
  return v;
}

export function useLocalStorage(key, initial) {
  const [v, setV] = useState(() => {
    try { const s = localStorage.getItem(key); return s == null ? initial : JSON.parse(s); } catch { return initial; }
  });
  const set = useCallback((x) => {
    setV((prev) => {
      const next = typeof x === "function" ? x(prev) : x;
      try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }, [key]);
  return [v, set];
}
