"use client";

import { useState } from "react";
import { releaseEvent } from "./stage-actions";

const EVENTS = [
  { id: "alert", label: "Alert", hint: "a message from the fair" },
  { id: "report", label: "Market report", hint: "502 €/t, +18%" },
  { id: "correction", label: "Correction", hint: "the +18% was one market" },
];

/** The presenter's controls, on the page itself (shown with ?demo=1). Each button drops a file into the source folders. */
export default function StagePanel() {
  const [sent, setSent] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const go = async (id: string) => {
    setBusy(id);
    const r = await releaseEvent(id);
    setBusy(null);
    setSent((s) => ({ ...s, [id]: r.ok ? (r.already ? "already sent" : "sent") : r.error ?? "error" }));
  };
  return (
    <div className="stagepanel" role="group" aria-label="Demo controls">
      <span className="label">Demo</span>
      {EVENTS.map((e) => (
        <button key={e.id} className={sent[e.id] === "sent" ? "done" : ""} disabled={busy === e.id} onClick={() => go(e.id)} title={e.hint}>
          ▶ {e.label}{sent[e.id] ? <em> · {sent[e.id]}</em> : null}
        </button>
      ))}
    </div>
  );
}
