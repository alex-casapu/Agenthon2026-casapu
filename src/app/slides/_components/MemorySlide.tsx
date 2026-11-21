"use client";

import Link from "next/link";
import { useState } from "react";
import { NODES, NODE_IDS } from "@/lib/scenario/data";
import { isArrived } from "@/lib/scenario/engine";
import { dispatch, useScenario } from "@/lib/scenario/store";
import type { State } from "@/lib/scenario/types";
import { KindTag, SourceDrawer, StatusChip } from "./ui";

const WEIGHT = { proposed: 0, approved: 1, rejected: 1, to_review: 2, superseded: 3, registered: 3 } as const;

function Proposal({ id, s, onOpen }: { id: string; s: State; onOpen: (id: string) => void }) {
  const n = NODES[id];
  const st = s.nodes[id];
  const dim = st.status === "to_review";
  const direct = n.basedOn.filter((b) => NODES[b].kind === "evidence");
  const rests = n.basedOn.filter((b) => NODES[b].kind !== "evidence");
  const blockers = n.basedOn.filter((b) => (NODES[b].kind === "evidence" ? s.nodes[b].status === "superseded" : s.nodes[b].status !== "approved"));
  const open = st.status === "proposed";
  return (
    <div className={`sl-card sl-prop st-${st.status}${dim ? " dim" : ""}`}>
      <div className="head">
        <KindTag kind={n.kind} />
        <span className="mono">{id}</span>
        <StatusChip status={st.status} />
        {st.by && <span className="muted small">{st.status === "rejected" ? "Rejected" : "Approved"} by {st.by} · {st.at}</span>}
      </div>
      <div className="text">{n.text}</div>

      {direct.map((b) => {
        const src = NODES[b].source!;
        return (
          <blockquote key={b} className="sl-quote">
            “{src.quotes[0]}”
            <footer>
              {src.name} · {src.date} ·{" "}
              <button className="link" style={{ border: "none", background: "none", padding: 0, color: "var(--accent)", cursor: "pointer", font: "inherit" }} onClick={() => onOpen(b)}>open source</button>
            </footer>
          </blockquote>
        );
      })}
      {rests.length > 0 && <div className="sl-rests">Rests on: {rests.map((r) => `${r} · ${NODES[r].short}`).join("  ·  ")}</div>}

      {n.verify && open && (
        <div className="sl-verify">
          {n.verify.map((v, i) => <span key={i} className={`sl-v ${v.ok ? "ok" : "human"}`}>{v.ok ? "✓" : "◐"} {v.text}</span>)}
        </div>
      )}

      {dim && <div className="sl-why">{st.reason} {st.replacedBy && <>Replaced by <strong>{st.replacedBy}</strong>.</>}</div>}

      {open && n.kind !== "action" && (
        <div className="sl-actions">
          <button className="sl-btn ok" onClick={() => dispatch({ type: "review", id, decision: "approve", by: s.role })}>Approve</button>
          <button className="sl-btn bad" onClick={() => dispatch({ type: "review", id, decision: "reject", by: s.role })}>Reject</button>
        </div>
      )}
      {open && n.kind === "action" && (
        <div className="sl-actions">
          <Link className="sl-link" href="/slides/approvals" style={{ margin: 0 }}>
            Actions are approved next to the world they would change →
          </Link>
          {blockers.length > 0 && <span className="sl-why">Waits for {blockers.join(", ")}</span>}
        </div>
      )}
    </div>
  );
}

export default function MemorySlide() {
  const s = useScenario();
  const [src, setSrc] = useState<string | null>(null);

  const items = NODE_IDS.filter((id) => ["conclusion", "hypothesis", "action"].includes(NODES[id].kind) && isArrived(s, id)).sort(
    (a, b) => WEIGHT[s.nodes[a].status] - WEIGHT[s.nodes[b].status] || NODE_IDS.indexOf(a) - NODE_IDS.indexOf(b),
  );
  const memory = NODE_IDS.filter((id) => NODES[id].kind === "memory" || (["conclusion", "hypothesis"].includes(NODES[id].kind) && s.nodes[id].status === "approved"));

  return (
    <div>
      <div className="sl-eyebrow">Procurement · curating the memory</div>
      <h1>Nothing becomes memory until a person says so.</h1>
      <p className="sl-lead">Every proposal carries its quote and what the machine already verified. The only thing left for you is the judgement call.</p>
      <div className="sl-grid2">
        <div className="sl-props">
          {items.length === 0 ? (
            <div className="sl-empty">Nothing to review yet. The market report hasn’t arrived (press E on “It speaks first”).</div>
          ) : (
            items.map((id) => <Proposal key={id} id={id} s={s} onOpen={setSrc} />)
          )}
        </div>
        <aside className="sl-card sl-memlist">
          <h2>Approved memory · {memory.filter((id) => s.nodes[id].status === "approved").length}</h2>
          {memory.filter((id) => s.nodes[id].status === "approved").map((id) => (
            <div key={id} className="item">
              <span className="mono muted">{id}</span>
              <span>{NODES[id].text}</span>
            </div>
          ))}
        </aside>
      </div>
      <SourceDrawer id={src} onClose={() => setSrc(null)} />
    </div>
  );
}
