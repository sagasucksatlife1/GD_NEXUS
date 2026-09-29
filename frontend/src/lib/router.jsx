import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const RouterCtx = createContext({ path: "/", search: "", navigate: () => {} });

export function Router({ children }) {
  const [loc, setLoc] = useState({ path: window.location.pathname, search: window.location.search });

  useEffect(() => {
    const onPop = () => setLoc({ path: window.location.pathname, search: window.location.search });
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const url = new URL(to, window.location.origin);
    if (url.pathname + url.search === window.location.pathname + window.location.search) return;
    window.history[replace ? "replaceState" : "pushState"]({}, "", url.pathname + url.search + url.hash);
    setLoc({ path: url.pathname, search: url.search });
    if (!replace && !url.hash) {
      const main = document.querySelector(".term-main");
      if (main) main.scrollTop = 0;
      else window.scrollTo(0, 0);
    }
  }, []);

  return <RouterCtx.Provider value={{ ...loc, navigate }}>{children}</RouterCtx.Provider>;
}

export const useRouter = () => useContext(RouterCtx);

export function useQuery() {
  const { search } = useRouter();
  return new URLSearchParams(search);
}

/** Match "/terminal/dossiers/:id" against a path. Returns params or null. */
export function match(pattern, path) {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function Link({ to, children, className = "", activeClass = "", exact = false, onClick, ...rest }) {
  const { path, navigate } = useRouter();
  const target = to.split("?")[0];
  const active = exact ? path === target : path === target || path.startsWith(`${target}/`);
  return (
    <a
      href={to}
      className={`${className} ${active && activeClass ? activeClass : ""}`.trim()}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || to.startsWith("http")) return;
        e.preventDefault();
        onClick?.(e);
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
