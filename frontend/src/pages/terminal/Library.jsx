import React, { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { PageHead, Panel, Icon } from "../../components/ui";
import { LIBRARY, LINKS } from "../../data/static";

function TeX({ tex }) {
  const html = useMemo(() => {
    try { return katex.renderToString(tex, { displayMode: true, throwOnError: false }); } catch { return tex; }
  }, [tex]);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Library() {
  return (
    <div className="col" style={{ gap: 14 }}>
      <PageHead title="Library" desc="The methods NEXUS runs on, and the notebooks they grew out of."
        right={<a className="btn" href={LINKS.github} target="_blank" rel="noreferrer"><Icon name="github" size={13} /> QuantProjects on GitHub</a>} />
      {LIBRARY.map((g) => (
        <Panel key={g.group} title={g.group}>
          <div className="grid g3">
            {g.items.map((m) => (
              <div key={m.name} className="lib-card">
                <div className="row">
                  <h4 className="mono" style={{ fontSize: 13.5 }}>{m.name}</h4>
                  <span className="spacer" />
                  {m.href && <a href={m.href} target="_blank" rel="noreferrer" className="sky mono" style={{ fontSize: 11 }}>notebook</a>}
                </div>
                <TeX tex={m.tex} />
                {m.where && <p className="prose-sm">{m.where}</p>}
                {m.ref && <p className="mono muted" style={{ fontSize: 10.5 }}>{m.ref}</p>}
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
