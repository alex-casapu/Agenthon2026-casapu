"use client";

import { useEffect, useRef, useState } from "react";
import { ROLES, SUGGESTED, TRICKY } from "@/lib/scenario/data";
import { dispatch, useScenario } from "@/lib/scenario/store";
import { AnswerBubble, Avatar, SourceDrawer } from "./ui";

export default function AskSlide() {
  const s = useScenario();
  const [q, setQ] = useState("");
  const [src, setSrc] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const me = ROLES[s.role];

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [s.chat.length]);

  const ask = (text: string) => {
    if (!text.trim()) return;
    dispatch({ type: "ask", q: text.trim(), role: s.role });
    setQ("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="sl-eyebrow">Ask the memory</div>
      <h1 style={{ fontSize: "1.8em" }}>Ask it anything. It answers from approved memory, or says it doesn’t know.</h1>
      <div className="sl-askgrid" style={{ flex: 1 }}>
        <div className="sl-chat">
          <div className="sl-chat-log" ref={log}>
            {s.chat.length === 0 && <div className="sl-quiet">Ask a question, or pick one on the right.</div>}
            {s.chat.map((c) => (
              <div key={c.id} style={{ display: "contents" }}>
                <div className="sl-asker"><Avatar role={c.role} size={22} /> {ROLES[c.role].name} · {ROLES[c.role].title} · {c.at}</div>
                <div className="sl-bubble user">{c.q}</div>
                <AnswerBubble r={c.result} onCite={setSrc} />
              </div>
            ))}
          </div>
          <form className="sl-chat-form" onSubmit={(e) => { e.preventDefault(); ask(q); }}>
            <Avatar role={s.role} size={36} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Ask as ${me.name} (${me.title})…`} />
            <button className="sl-btn primary" type="submit">Ask</button>
          </form>
        </div>
        <aside className="sl-sugg">
          <h4 style={{ marginTop: 0 }}>Suggested</h4>
          {SUGGESTED.map((t) => <button key={t} onClick={() => ask(t)}>{t}</button>)}
          <h4>Try to break it</h4>
          {TRICKY.map((t) => <button key={t} onClick={() => ask(t)}>{t}</button>)}
        </aside>
      </div>
      <SourceDrawer id={src} onClose={() => setSrc(null)} />
    </div>
  );
}
