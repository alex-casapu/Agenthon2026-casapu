"use client";

import Link from "next/link";
import { NODES, ROLES } from "@/lib/scenario/data";
import { STATUS_LABEL } from "@/lib/scenario/engine";
import type { AskResult, Kind, RoleId, Status } from "@/lib/scenario/types";

export function StatusChip({ status }: { status: Status }) {
  return <span className={`sl-chip st-${status}`}>{STATUS_LABEL[status]}</span>;
}

const KIND_LABEL: Record<Kind, string> = { evidence: "Evidence", memory: "Memory", conclusion: "Conclusion", hypothesis: "Weak hypothesis", action: "Action" };
export function KindTag({ kind }: { kind: Kind }) {
  return <span className={`sl-kind k-${kind}`}>{KIND_LABEL[kind]}</span>;
}

export function Avatar({ role, size = 28 }: { role: RoleId; size?: number }) {
  const r = ROLES[role];
  return (
    <span className={`sl-avatar r-${role}`} style={{ width: size, height: size, fontSize: size * 0.4 }} title={`${r.name} · ${r.title}`}>
      {r.name.split(" ").map((p) => p[0]).join("")}
    </span>
  );
}

/** Text with the verbatim quotes marked. */
export function Highlight({ text, quotes }: { text: string; quotes: string[] }) {
  const ranges = quotes
    .map((q) => ({ i: text.indexOf(q), len: q.length }))
    .filter((r) => r.i >= 0)
    .sort((a, b) => a.i - b.i);
  const out: React.ReactNode[] = [];
  let pos = 0;
  ranges.forEach((r, k) => {
    if (r.i < pos) return;
    out.push(text.slice(pos, r.i));
    out.push(<mark key={k}>{text.slice(r.i, r.i + r.len)}</mark>);
    pos = r.i + r.len;
  });
  out.push(text.slice(pos));
  return <>{out}</>;
}

export function CitationChips({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  return (
    <div className="sl-cites">
      {ids.map((id) => {
        const src = NODES[id].source;
        return (
          <button key={id} className="sl-cite" onClick={() => onOpen(id)} title="Open the source">
            <span className="mono">{id}</span> {src ? `${src.name.split(",")[0]} · ${src.date}` : ""}
          </button>
        );
      })}
    </div>
  );
}

/** A source document with the cited passages highlighted. */
export function SourceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  if (!id) return null;
  const n = NODES[id];
  const src = n.source;
  return (
    <div className="sl-drawer-wrap" onClick={onClose}>
      <aside className="sl-drawer" onClick={(e) => e.stopPropagation()} aria-label="Source document">
        <div className="row">
          <strong className="mono">{id}</strong>
          <span className="sl-chip">{n.label === "finance" ? "🔒 Finance only" : "Visible to everyone"}</span>
          <span className={`sl-chip ${n.reliability === "low" ? "st-to_review" : "st-approved"}`}>reliability {n.reliability}</span>
          <button style={{ marginLeft: "auto" }} onClick={onClose}>✕</button>
        </div>
        {src && (
          <>
            <h3>{src.name}</h3>
            <p className="muted small">{src.date} · {src.kind}</p>
            <pre className="sl-source"><Highlight text={src.text} quotes={src.quotes} /></pre>
            <p className="muted small">Highlighted: the exact passages the claim cites. Each is checked verbatim against this text before anything is saved.</p>
          </>
        )}
      </aside>
    </div>
  );
}

const RESULT_BADGE: Record<AskResult["kind"], string> = { answer: "Answer", unknown: "I don't know", refusal: "Can't do that" };

export function AnswerBubble({ r, onCite, delayed }: { r: AskResult; onCite: (id: string) => void; delayed?: boolean }) {
  return (
    <div className={`sl-bubble agent res-${r.kind}${delayed ? " second" : ""}`}>
      <div className="row">
        <span className={`sl-badge res-${r.kind}`}>{RESULT_BADGE[r.kind]}</span>
        {r.approvedBy && <span className="muted small">Approved by {r.approvedBy}{r.approvedAt ? ` · ${r.approvedAt}` : ""}</span>}
      </div>
      <p className="sl-answer">{r.text}</p>
      {r.note && <p className="sl-note">{r.note}</p>}
      {r.citations.length > 0 && <CitationChips ids={r.citations} onOpen={onCite} />}
      {r.chainFor && <Link className="sl-link" href="/slides/why">See the full decision chain →</Link>}
    </div>
  );
}
