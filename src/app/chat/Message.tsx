"use client";

import { useState } from "react";
import type { AnswerResult, Citation } from "@/lib/answer/answer";
import { Avatar, BrainMark, KindIcon, QuestionIcon, ShieldIcon } from "./ui";

export type Msg = { id: string; role: "user" | "assistant"; content: string; answer?: AnswerResult; error?: string };

export function UserMessage({ m, who }: { m: Msg; who: string }) {
  return (
    <div className="msg user">
      <div className="bubble">{m.content}</div>
      <Avatar id={who} size={32} />
    </div>
  );
}

function Source({ c, active, onHover }: { c: Citation; active: boolean; onHover: (n: number | null) => void }) {
  const [open, setOpen] = useState(false);
  const evidence = c.evidence.slice(0, 2);
  return (
    <div className={`src${active ? " on" : ""}`} id={`src-${c.n}`} onMouseEnter={() => onHover(c.n)} onMouseLeave={() => onHover(null)}>
      <span className="src-n">{c.n}</span>
      <div className="src-body">
        <div className="src-claim">{c.sentence}</div>
        {evidence.map((e) => (
          <div className="src-ev" key={e.quote_id}>
            <blockquote className={open ? "" : "clamp"}>“{e.text}”</blockquote>
            <div className="src-meta">
              <span className="kind"><KindIcon kind={e.source.kind} />{e.source.kind}</span>
              <span className="src-title">{e.source.title ?? e.source.external_id}</span>
              <span>{e.source.occurred_at.slice(0, 10)}</span>
              {e.source.reliability === "low" && <span className="pill warn">unverified</span>}
            </div>
          </div>
        ))}
        {c.evidence.length > 0 && (
          <button className="src-more" onClick={() => setOpen(!open)}>{open ? "Show less" : "Show full quote"}</button>
        )}
      </div>
    </div>
  );
}

export function AssistantMessage({ m, onAsk }: { m: Msg; onAsk: (q: string) => void }) {
  const [hover, setHover] = useState<number | null>(null);
  const a = m.answer;

  return (
    <div className="msg assistant">
      <span className="brain-avatar"><BrainMark size={16} /></span>
      <div className="assistant-body">
        {m.error && <div className="errorcard">{m.error}</div>}

        {a?.idk && (
          <div className="idk">
            <span className="idk-ico"><QuestionIcon /></span>
            <div>
              <div className="idk-title">I don&apos;t know.</div>
              <div className="idk-sub">Nothing in the approved knowledge available to you answers this.</div>
            </div>
          </div>
        )}

        {a && !a.idk && (
          <>
            <div className="answer">
              {a.segments.map((s, i) => (
                <p key={i} className="seg">
                  {s.text}
                  {s.cites.map((n) => (
                    <a key={n} href={`#src-${n}`} className={`cite${hover === n ? " on" : ""}`} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)} title={a.citations[n - 1]?.sentence}>
                      {n}
                    </a>
                  ))}
                </p>
              ))}
            </div>

            <div className="sources">
              <div className="sources-head">
                <ShieldIcon /> Sources <span className="muted">· every figure above was checked against them</span>
              </div>
              <div className="src-grid">
                {a.citations.map((c) => <Source key={c.n} c={c} active={hover === c.n} onHover={setHover} />)}
              </div>
            </div>

            {a.followups.length > 0 && (
              <div className="followups">
                {a.followups.map((f) => <button key={f} onClick={() => onAsk(f)}>{f}</button>)}
              </div>
            )}
          </>
        )}

        {a && (
          <div className="msg-meta">
            {a.idk
              ? `Looked at ${a.meta.knowledge} approved claim${a.meta.knowledge === 1 ? "" : "s"}`
              : `From ${a.meta.knowledge} approved claim${a.meta.knowledge === 1 ? "" : "s"} you can see`}
            {a.meta.dropped > 0 && ` · ${a.meta.dropped} statement${a.meta.dropped === 1 ? "" : "s"} removed: could not be verified`}
            {a.meta.llm_calls > 0 && ` · ${(a.meta.duration_ms / 1000).toFixed(1)}s`}
          </div>
        )}
      </div>
    </div>
  );
}

export function Typing({ phase }: { phase: string }) {
  return (
    <div className="msg assistant">
      <span className="brain-avatar pulse"><BrainMark size={16} /></span>
      <div className="assistant-body">
        <div className="typing"><i /><i /><i /><span>{phase}</span></div>
      </div>
    </div>
  );
}
