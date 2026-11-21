"use client";

import { useState } from "react";
import { NODES } from "@/lib/scenario/data";
import { lineage } from "@/lib/scenario/engine";
import { useScenario } from "@/lib/scenario/store";
import { SourceDrawer, StatusChip } from "./ui";

export default function WhySlide() {
  const s = useScenario();
  const [src, setSrc] = useState<string | null>(null);

  const decided = ["AZ-02", "AZ-01"].find((id) => s.nodes[id].status === "approved");

  return (
    <div>
      <div className="sl-eyebrow">Accountability</div>
      <div className="sl-whyhead">
        <h1>“Why did we buy 3,000 t from Alta Murgia Mill?”</h1>
      </div>

      {!decided ? (
        <div className="sl-empty">No purchase has been made yet. Approve the action on “It only proposes” first.</div>
      ) : (
        <WhyChain id={decided} onOpen={setSrc} />
      )}
      <SourceDrawer id={src} onClose={() => setSrc(null)} />
    </div>
  );
}

function WhyChain({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const s = useScenario();
  const ids = lineage(id).filter((x) => x !== id);
  const st = s.nodes[id];
  const related = new Set([id, ...ids]);
  const timeline = s.log.filter((e) => e.refs.some((r) => related.has(r)));

  const reasoning = ids.filter((x) => ["conclusion", "hypothesis", "action"].includes(NODES[x].kind));
  const current = reasoning.filter((x) => s.nodes[x].status === "approved");
  const earlier = reasoning.filter((x) => s.nodes[x].status !== "approved");
  const memory = ids.filter((x) => NODES[x].kind === "memory");
  const evidence = ids.filter((x) => NODES[x].kind === "evidence");

  return (
    <div className="sl-whygrid">
      <div className="sl-lane">
        <h3>The decision</h3>
        <div className="sl-mini sl-decision">
          <div className="row"><strong className="mono">{id}</strong><StatusChip status={st.status} /></div>
          <div className="t">{NODES[id].text}</div>
          <div className="muted small">Approved by <strong>{st.by}</strong> · {st.at}</div>
        </div>
        <h3 style={{ marginTop: ".8em" }}>What happened</h3>
        <div className="sl-tl">
          {timeline.map((e, i) => (
            <div key={i} className="e"><div className="at">{e.at.split(" · ")[1]} · {e.actor}</div>{e.text}</div>
          ))}
        </div>
      </div>

      <div className="sl-lane">
        <h3>Approved conclusions it rests on</h3>
        {current.map((x) => (
          <div key={x} className="sl-mini st-approved">
            <div className="row"><span className="mono">{x}</span><span className="muted small">approved by {s.nodes[x].by}</span></div>
            <div className="t">{NODES[x].text}</div>
          </div>
        ))}
        <div className="sl-mini">
          <div className="muted small">Plus {memory.length} approved memory items: {memory.map((m) => NODES[m].short).join(" · ")}</div>
        </div>
      </div>

      <div className="sl-lane">
        <h3>Evidence</h3>
        {evidence.map((x) => {
          const xs = s.nodes[x];
          const src = NODES[x].source!;
          return (
            <button key={x} className={`sl-row st-${xs.status}`} onClick={() => onOpen(x)} title="Open the source">
              <span className="mono">{x}</span>
              <span className="what">{src.name.split(",")[0]} · {src.date}</span>
              {xs.status === "superseded" && <span className="sl-chip st-superseded">superseded by {xs.replacedBy}</span>}
            </button>
          );
        })}
        <h3 style={{ marginTop: ".8em" }}>Earlier versions, kept</h3>
        {earlier.map((x) => (
          <div key={x} className="sl-row st-to_review" style={{ cursor: "default" }}>
            <span className="mono">{x}</span>
            <span className="what">{NODES[x].short}</span>
            <span className="sl-chip st-to_review">→ {s.nodes[x].replacedBy}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
