"use client";

import { NODES } from "@/lib/scenario/data";
import { STATUS_LABEL, isArrived } from "@/lib/scenario/engine";
import { useScenario } from "@/lib/scenario/store";
import type { State } from "@/lib/scenario/types";

const W = 1040;
const H = 500;

/** Fixed layout, in a 1040 x 500 space. */
const POS: Record<string, { x: number; y: number; w: number; h: number }> = {
  "EV-07": { x: 0, y: 40, w: 220, h: 82 },
  "EV-08": { x: 0, y: 300, w: 220, h: 82 },
  GROUP: { x: 275, y: 130, w: 190, h: 220 },
  "PR-01": { x: 535, y: 10, w: 225, h: 76 },
  "PR-02": { x: 535, y: 125, w: 225, h: 88 },
  "PR-04": { x: 535, y: 270, w: 225, h: 76 },
  "PR-05": { x: 535, y: 385, w: 225, h: 88 },
  "AZ-01": { x: 815, y: 60, w: 225, h: 100 },
  "AZ-02": { x: 815, y: 320, w: 225, h: 100 },
};
const GRAPH_IDS = ["EV-07", "EV-08", "PR-01", "PR-02", "PR-04", "PR-05", "AZ-01", "AZ-02"];
const MEM_SHORT = ["Oct spot 425 €/t", "Contract 412 €/t · 60%", "Needs 4,000 t/month", "Stock 9 days", "Offer 470 €/t · 28/11"];

const right = (id: string) => ({ x: POS[id].x + POS[id].w, y: POS[id].y + POS[id].h / 2 });
const left = (id: string) => ({ x: POS[id].x, y: POS[id].y + POS[id].h / 2 });
const curve = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  const dx = (b.x - a.x) * 0.5;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
};

function edges(s: State) {
  const out: { d: string; cls: string; key: string }[] = [];
  for (const id of GRAPH_IDS) {
    if (!isArrived(s, id)) continue;
    let groupDone = false;
    for (const b of NODES[id].basedOn) {
      if (NODES[b].kind === "memory") {
        if (!groupDone) {
          out.push({ key: `g-${id}`, d: curve(right("GROUP"), left(id)), cls: "light" });
          groupDone = true;
        }
      } else if (GRAPH_IDS.includes(b) && isArrived(s, b)) {
        out.push({ key: `${b}-${id}`, d: curve(right(b), left(id)), cls: "" });
      }
    }
  }
  return out;
}

function replacements(s: State) {
  const out: { d: string; lx: number; ly: number; key: string }[] = [];
  for (const id of GRAPH_IDS) {
    const to = s.nodes[id].replacedBy;
    if (!to || !isArrived(s, to) || !POS[to]) continue;
    const a = right(id);
    const b = right(to);
    const bulge = 46;
    out.push({ key: `${id}>${to}`, d: `M ${a.x} ${a.y} C ${a.x + bulge} ${a.y}, ${b.x + bulge} ${b.y}, ${b.x} ${b.y}`, lx: a.x + bulge - 6, ly: (a.y + b.y) / 2 });
  }
  return out;
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

function Node({ id, s }: { id: string; s: State }) {
  const n = NODES[id];
  const st = s.nodes[id];
  const p = POS[id];
  return (
    <div className={`sl-node st-${st.status}`} style={{ left: pct(p.x, W), top: pct(p.y, H), width: pct(p.w, W), height: pct(p.h, H) }}>
      <div className="id"><span>{id}</span><span className="state">{STATUS_LABEL[st.status]}</span></div>
      <div className="t">{n.short}</div>
    </div>
  );
}

export default function CorrectionSlide() {
  const s = useScenario();
  const started = s.events.includes("report");
  const corrected = s.events.includes("correction");
  const g = POS.GROUP;

  return (
    <div>
      <div className="sl-eyebrow">Derived state is a function of the evidence</div>
      <h1>{corrected ? "Nothing was rewritten. Everything that depended on it was flagged." : "Then the world changes."}</h1>
      <p className="sl-lead">
        {corrected
          ? "The old evidence stays, linked to its correction. Every conclusion and action that rested on it is marked “to review”, and updated versions are proposed with the new numbers."
          : "Every conclusion and action knows exactly which evidence it rests on. Watch what happens when the evidence is corrected."}
      </p>

      {!started ? (
        <div className="sl-empty">Nothing to show yet. The market report hasn’t arrived (press E on “It speaks first”).</div>
      ) : (
        <div className="sl-graphgrid">
          <div style={{ padding: "2em 3em 0 0" }}>
            <div className="sl-graph">
              <span className="sl-colhead" style={{ left: 0 }}>Evidence</span>
              <span className="sl-colhead" style={{ left: pct(g.x, W) }}>Approved memory</span>
              <span className="sl-colhead" style={{ left: pct(535, W) }}>Conclusions</span>
              <span className="sl-colhead" style={{ left: pct(815, W) }}>Action</span>

              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
                {edges(s).map((e) => <path key={e.key} className={`sl-edge ${e.cls}`} d={e.d} />)}
                {replacements(s).map((r) => (
                  <g key={r.key}>
                    <path className="sl-edge repl" d={r.d} />
                    <text className="sl-edge-label" x={r.lx} y={r.ly} textAnchor="end">replaced by</text>
                  </g>
                ))}
              </svg>

              <div className="sl-node group" style={{ left: pct(g.x, W), top: pct(g.y, H), width: pct(g.w, W), height: pct(g.h, H) }}>
                <div className="id"><span>MEM-01 … 05</span><span className="state" style={{ color: "var(--ok)" }}>approved</span></div>
                {MEM_SHORT.map((m) => <div key={m} className="t" style={{ fontWeight: 500, margin: ".25em 0" }}>✓ {m}</div>)}
              </div>

              {GRAPH_IDS.filter((id) => isArrived(s, id)).map((id) => <Node key={id} id={id} s={s} />)}
            </div>
          </div>

          <aside>
            <div className="sl-card sl-legend">
              <h2>Legend</h2>
              <div className="row"><span className="sl-chip st-proposed">proposed</span> waiting for a person</div>
              <div className="row"><span className="sl-chip st-approved">approved</span> a person said yes</div>
              <div className="row"><span className="sl-chip st-to_review">to review</span> its evidence was superseded</div>
              <div className="row"><span className="sl-chip st-superseded">superseded</span> kept, linked to its correction</div>
            </div>
            <div className="sl-card" style={{ marginTop: "1em" }}>
              <h2>What happened</h2>
              <div className="sl-tl">
                {[...s.log].reverse().slice(0, 4).map((e, i) => (
                  <div key={i} className="e"><div className="at">{e.at.split(" · ")[1]} · {e.actor}</div>{e.text}</div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
