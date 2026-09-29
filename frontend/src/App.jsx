import React, { useEffect } from "react";
import { Router, useRouter, match, Link } from "./lib/router";
import { DataProvider } from "./lib/data";
import { TerminalLayout } from "./components/shell";
import { Empty, ErrorBoundary, Panel } from "./components/ui";
import Home from "./pages/Home";
import Pipeline from "./pages/terminal/Pipeline";
import Rejections from "./pages/terminal/Rejections";
import { DossierList, DossierDetail } from "./pages/terminal/Dossiers";
import Agents from "./pages/terminal/Agents";
import Observatory from "./pages/terminal/Observatory";
import Graveyard from "./pages/terminal/Graveyard";
import Portfolio from "./pages/terminal/Portfolio";
import Library from "./pages/terminal/Library";
import Research from "./pages/terminal/Research";
import Control from "./pages/terminal/Control";

const ROUTES = [
  ["/terminal", () => <Pipeline />, "Pipeline"],
  ["/terminal/rejections", () => <Rejections />, "Rejections"],
  ["/terminal/dossiers", () => <DossierList />, "Dossiers"],
  ["/terminal/dossiers/:id", (p) => <DossierDetail id={p.id} />, "Dossier"],
  ["/terminal/agents/:agent", (p) => <Agents agent={p.agent} />, "Agent"],
  ["/terminal/observatory", () => <Observatory />, "Observatory"],
  ["/terminal/graveyard", () => <Graveyard />, "Graveyard"],
  ["/terminal/portfolio", () => <Portfolio />, "Portfolio"],
  ["/terminal/library", () => <Library />, "Library"],
  ["/terminal/research", () => <Research />, "Research"],
  ["/terminal/control", () => <Control />, "Control"],
];

function Routes() {
  const { path } = useRouter();
  const clean = path.length > 1 ? path.replace(/\/$/, "") : path;

  let page = null, title = "NEXUS";
  for (const [pattern, render, t] of ROUTES) {
    const params = match(pattern, clean);
    if (params) { page = render(params); title = `${t} · NEXUS`; break; }
  }
  useEffect(() => { document.title = clean === "/" ? "NEXUS · Complexity-Adaptive Quant Research" : title; }, [clean, title]);

  if (clean === "/") return <ErrorBoundary resetKey={clean}><Home /></ErrorBoundary>;
  if (clean.startsWith("/terminal")) {
    return (
      <TerminalLayout>
        {page || <Panel><Empty title="No such page"><Link to="/terminal" className="sky">Back to the pipeline</Link></Empty></Panel>}
      </TerminalLayout>
    );
  }
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <Empty title="404">That page doesn't exist. <Link to="/" className="sky">Go home</Link></Empty>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <DataProvider>
        <Routes />
      </DataProvider>
    </Router>
  );
}
