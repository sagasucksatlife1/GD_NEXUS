import React, { useState } from "react";
import { useData } from "../../lib/data";
import { Link } from "../../lib/router";
import { PageHead, Panel, Empty, ErrorTag } from "../../components/ui";
import { ERROR_TYPE, prettyName, time } from "../../lib/format";
import { FOUNDING_GRAVES } from "../../data/static";

export default function Graveyard() {
  const { lineages } = useData();
  const [type, setType] = useState("");
  const dead = lineages.filter((l) => l.status === "DEAD");
  const killing = (L) => [...L.versions].reverse().find((v) => v.error)?.error;
  const shown = dead.filter((L) => !type || killing(L)?.type === type);

  return (
    <div className="col" style={{ gap: 14 }}>
      <PageHead title="Graveyard"
        desc="Strategies that used every repair attempt and still failed, or passed research and died on the sealed holdout. Negative results are kept on purpose: each one is evidence." />

      <div className="row-wrap">
        <button className={`chip ${!type ? "on" : ""}`} onClick={() => setType("")}>All causes</button>
        {Object.entries(ERROR_TYPE).map(([k, m]) => (
          <button key={k} className={`chip ${type === k ? "on" : ""}`} style={{ "--c": m.color }} onClick={() => setType(k)}>{m.label}</button>
        ))}
      </div>

      <Panel title="Killed by NEXUS" sub={`${dead.length} lineages`}>
        {!shown.length ? <Empty title={dead.length ? "No graves for this cause" : "No graves yet"}>{dead.length ? "Try another cause of death." : "When a lineage exhausts its repairs, its tombstone appears here."}</Empty> : (
          <div className="graves" data-testid="graveyard-wall">
            {shown.map((L) => {
              const err = killing(L);
              const last = L.latest;
              return (
                <Link key={L.id} to={`/terminal/dossiers/${L.id}`} className="grave" data-testid={`graveyard-card-${L.id}`}>
                  <div className="rip">R · I · P</div>
                  <h4>{prettyName(L)}</h4>
                  <div className="row" style={{ justifyContent: "center" }}>{err && <ErrorTag type={err.type} />}</div>
                  <div className="k">Cause of death</div>
                  <div className="v" style={{ color: "#fca5a5" }}>{L.cause_of_death}</div>
                  {last?.stats && <><div className="k">Last Sharpe</div><div className="v">{last.stats.sharpe?.toFixed(2)} (DSR {last.stats.dsr?.toFixed(3)})</div></>}
                  <div className="k">Repair attempts</div>
                  <div className="v amber">{Math.max(0, L.attempts - 1)}. Still dead.</div>
                  <div className="k">Agent · died</div>
                  <div className="v muted">{L.agent} · {time(L.updated_at).slice(0, 16)}</div>
                </Link>
              );
            })}
          </div>
        )}
      </Panel>

      <Panel title="Founding graves" sub="killed during the ai-hedge-fund research that led to NEXUS">
        <div className="graves">
          {FOUNDING_GRAVES.map((g) => (
            <div key={g.name} className="grave" style={{ opacity: 0.92 }}>
              <div className="rip">R · I · P</div>
              <h4>{g.name}</h4>
              <div className="k">Cause of death</div>
              <div className="v" style={{ color: "#fca5a5" }}>{g.cause}</div>
              {g.stat && <><div className="k">Killing stat</div><div className="v">{g.stat}</div></>}
              {g.lesson && <><div className="k">What it taught</div><div className="v dim">{g.lesson}</div></>}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
