"use client";

import { NODES, NODE_IDS } from "@/lib/scenario/data";
import { isArrived } from "@/lib/scenario/engine";
import { dispatch, useScenario } from "@/lib/scenario/store";
import { KindTag, StatusChip } from "./ui";
import WorldPanel from "./WorldPanel";

export default function ApprovalsSlide() {
  const s = useScenario();
  const actions = NODE_IDS.filter((id) => NODES[id].kind === "action" && isArrived(s, id)).sort((a, b) => {
    const w = (id: string) => (s.nodes[id].status === "proposed" ? 0 : s.nodes[id].status === "approved" ? 1 : 2);
    return w(a) - w(b);
  });
  const done = s.orders.length > 0;

  return (
    <div>
      <div className="sl-eyebrow">Check 6 · It only proposes</div>
      <h1>{done ? "Approved by a person. Only now does the order exist." : "It proposes. Nothing happens until a person approves."}</h1>
      <div className="sl-appgrid">
        <div style={{ display: "grid", gap: "1em" }}>
          {actions.length === 0 && <div className="sl-empty">No action proposed yet. The market report hasn’t arrived (slide 3, press E).</div>}
          {actions.map((id) => {
            const n = NODES[id];
            const st = s.nodes[id];
            const deps = n.basedOn.filter((b) => NODES[b].kind !== "evidence" && NODES[b].kind !== "memory");
            const open = st.status === "proposed";
            return (
              <div key={id} className={`sl-card sl-prop st-${st.status}${st.status === "to_review" ? " dim" : ""}`}>
                <div className="head">
                  <KindTag kind="action" /><span className="mono">{id}</span><StatusChip status={st.status} />
                  {st.by && <span className="muted small">Approved by {st.by} · {st.at}</span>}
                </div>
                <div className="text">{n.text}</div>
                {open && (
                  <div className="sl-prereq">
                    {deps.map((d) => {
                      const ok = s.nodes[d].status === "approved";
                      const pending = s.nodes[d].status === "proposed";
                      return (
                        <div key={d} className={ok ? "ok" : "wait"}>
                          {ok ? "✓" : "○"} {d} · {NODES[d].short} {ok ? "approved" : "not approved yet"}
                          {pending && (
                            <button className="sl-btn ok" style={{ marginLeft: ".7em", padding: ".05em .8em" }} onClick={() => dispatch({ type: "review", id: d, decision: "approve", by: s.role })}>
                              Approve
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {st.status === "to_review" && <div className="sl-why">{st.reason} {st.replacedBy && <>Replaced by <strong>{st.replacedBy}</strong>.</>}</div>}
                {open && (
                  <div className="sl-actions">
                    <button className="sl-btn primary" onClick={() => dispatch({ type: "review", id, decision: "approve", by: s.role })}>Approve and create the order</button>
                    <button className="sl-btn bad" onClick={() => dispatch({ type: "review", id, decision: "reject", by: s.role })}>Reject</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div>
          <p className="sl-bigstate">{done ? "In the world: purchase order created." : "In the world: no order exists."}</p>
          <WorldPanel />
        </div>
      </div>
    </div>
  );
}
