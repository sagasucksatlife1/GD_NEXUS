import React from "react";
import { PageHead, Panel, Badge } from "../../components/ui";
import { RESEARCH } from "../../data/static";

const COLOR = { "Published": "#10b981", "In progress": "#38bdf8", "Under journal review": "#f59e0b" };

export default function Research() {
  return (
    <div className="col" style={{ gap: 12 }}>
      <PageHead title="Research" desc="Papers and post-mortems behind the system." />
      <div className="col" style={{ gap: 12 }}>
        {RESEARCH.map((p) => (
          <Panel key={p.title}>
            <div className="row-wrap" style={{ marginBottom: 8 }}>
              <span className="mono muted" style={{ fontSize: 11 }}>{p.venue}</span>
              <span className="spacer" />
              <Badge color={COLOR[p.status] || "#64748b"}>{p.status}</Badge>
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, maxWidth: "60ch" }}>{p.title}</h2>
            <p className="prose" style={{ marginTop: 8 }}>{p.abstract}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}
