"use client";

import { useEffect, useState } from "react";
import type { Citation } from "@/lib/answer/answer";
import { Source } from "./Message";
import { BellIcon, ShieldIcon } from "./ui";

export type Notice = {
  notice_id: string;
  topic: string | null;
  urgency: "high" | "normal" | null;
  created_at: string;
  seen: boolean;
  state: "ok" | "updated" | "cancelled";
  withdrawn: { claim_id: string; sentence: string; status: string; by: string; reason: string | null; at: string }[];
  segments: { text: string; cites: number[]; withdrawn?: boolean }[];
  citations: Citation[];
};

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** What the memory has told this person on its own. Dismissing hides it for them only. */
export function NoticeFeed({ notices, onDismiss, onAsk }: { notices: Notice[]; onDismiss: (id: string) => void; onAsk: (q: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [, setNow] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setNow((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const live = notices.filter((n) => !n.seen);
  if (live.length === 0) return null;

  return (
    <section className="notices" aria-label="Heads-up">
      <div className="notices-head"><BellIcon /> Heads-up <span className="count">{live.length}</span><span className="muted"> · sent to you without being asked</span></div>
      {live.map((n) => (
        <article key={n.notice_id} className={`notice${n.urgency === "high" && n.state === "ok" ? " high" : ""}${n.state !== "ok" ? ` ${n.state}` : ""}`}>
          <header>
            <span className="notice-topic">{n.topic ?? "Something new"}</span>
            {n.state === "cancelled" && <span className="pill gone">Cancelled</span>}
            {n.state === "updated" && <span className="pill gone">Updated</span>}
            {n.state === "ok" && n.urgency === "high" && <span className="pill urgent">worth acting on soon</span>}
            <span className="grow" />
            <span className="muted small">{ago(n.created_at)}</span>
            <button className="x" onClick={() => onDismiss(n.notice_id)} aria-label="Dismiss">×</button>
          </header>
          <div className="answer">
            {n.segments.map((s, i) => (
              <p key={i} className={`seg${s.withdrawn ? " struck" : ""}`}>
                {s.text}
                {s.cites.map((c) => (
                  <a key={c} href={`#nsrc-${n.notice_id}-${c}`} className={`cite${hover === c ? " on" : ""}`} onMouseEnter={() => setHover(c)} onMouseLeave={() => setHover(null)} title={n.citations[c - 1]?.sentence}>{c}</a>
                ))}
              </p>
            ))}
          </div>
          {n.state !== "ok" && (
            <div className="withdrawn">
              <b>{n.state === "cancelled" ? "No longer holds." : "Partly withdrawn."}</b>{" "}
              {n.withdrawn.map((w) => (
                <span key={w.claim_id}>
                  {w.by} {w.status === "retracted" ? "retracted" : "rejected"} “{w.sentence}”{w.reason ? ` (${w.reason})` : ""}.{" "}
                </span>
              ))}
              {n.state === "cancelled" ? "Disregard it." : "Struck statements no longer have a basis."}
            </div>
          )}
          <footer>
            <button className="ghost" onClick={() => setOpen(open === n.notice_id ? null : n.notice_id)}><ShieldIcon /> {open === n.notice_id ? "Hide sources" : "Show sources"}</button>
            {n.state !== "cancelled" && <button className="ghost" onClick={() => onAsk(`Tell me more about: ${n.topic ?? "this"}`)}>Ask about this</button>}
          </footer>
          {open === n.notice_id && (
            <div className="src-grid">
              {n.citations.map((c) => (
                <div key={c.n} id={`nsrc-${n.notice_id}-${c.n}`}><Source c={c} active={hover === c.n} onHover={setHover} /></div>
              ))}
            </div>
          )}
        </article>
      ))}
    </section>
  );
}
