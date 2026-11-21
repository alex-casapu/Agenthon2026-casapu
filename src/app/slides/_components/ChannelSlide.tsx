"use client";

import Link from "next/link";
import { useState } from "react";
import { useScenario } from "@/lib/scenario/store";
import type { Message } from "@/lib/scenario/types";
import { Avatar } from "./ui";

function Bullets({ m }: { m: Message }) {
  return (
    <>
      <ul>
        {m.bullets.map((b) => (
          <li key={b.ref}>{b.text}{b.ref && <Link href="/slides/memory" className="sl-ref">{b.ref}</Link>}</li>
        ))}
      </ul>
      {m.action && (
        <div className="sl-proposal">
          <div className="lab">Proposed action<Link href="/slides/memory" className="sl-ref">{m.action.ref}</Link></div>
          {m.action.text}
        </div>
      )}
      <div className="sl-footer">
        {m.footer.map((f, i) => <div key={i} className={i === m.footer.length - 1 ? "strong" : ""}>{f}</div>)}
      </div>
    </>
  );
}

function SlackMessage({ m }: { m: Message }) {
  return (
    <div className="sl-msg sl-app-msg">
      <span className="sl-brain-avatar">B</span>
      <div className="body">
        <div className="meta"><strong>Company Brain</strong><span className="sl-app-badge">APP</span> {m.at}</div>
        <div className="title">{m.title}</div>
        <div>{m.lead}</div>
        <Bullets m={m} />
        <div className="row" style={{ marginTop: ".6em" }}>
          <Link className="sl-btn primary" href="/slides/memory" style={{ textDecoration: "none" }}>Review in memory</Link>
        </div>
      </div>
    </div>
  );
}

function Email({ m }: { m: Message }) {
  return (
    <div className="sl-email">
      <div className="sl-email-head">
        <div className="subject">{m.title}</div>
        <div><strong>Company Brain</strong> &lt;brain@pastaco.example&gt; → Marta Ricci · {m.at} · morning digest</div>
      </div>
      <div className="sl-email-body">
        <p style={{ marginTop: 0 }}>Hi Marta,</p>
        <p>{m.lead}</p>
        <Bullets m={m} />
      </div>
    </div>
  );
}

export default function ChannelSlide() {
  const s = useScenario();
  const [view, setView] = useState<"slack" | "email">("slack");
  return (
    <div>
      <div className="sl-eyebrow">09:02 · #procurement</div>
      <h1>Nobody asked. It wrote first.</h1>
      <div className="sl-viewtoggle">
        <button className={view === "slack" ? "on" : ""} onClick={() => setView("slack")}>Team chat</button>
        <button className={view === "email" ? "on" : ""} onClick={() => setView("email")}>Morning email</button>
      </div>

      {view === "slack" ? (
        <div className="sl-slack">
          <aside className="sl-side">
            <h4>Pastaco</h4>
            <div className="sec">Channels</div>
            <div className="ch"># general</div>
            <div className="ch on"># procurement</div>
            <div className="ch"># finance</div>
            <div className="ch"># production</div>
            <div className="sec">Apps</div>
            <div className="ch">Company Brain {s.messages.length > 0 && <span className="dot">{s.messages.length}</span>}</div>
          </aside>
          <div className="sl-slack-main">
            <div className="sl-slack-head"># procurement</div>
            <div className="sl-slack-body">
              <div className="sl-msg">
                <Avatar role="procurement" size={36} />
                <div className="body"><div className="meta"><strong>Marta Ricci</strong> 08:41</div>Morning all. Reminder: the Alta Murgia offer expires on the 28th.</div>
              </div>
              {s.messages.length === 0 ? (
                <div className="sl-quiet">A quiet morning. Nothing needs attention yet.</div>
              ) : (
                s.messages.map((m) => <SlackMessage key={m.id} m={m} />)
              )}
            </div>
          </div>
        </div>
      ) : s.messages.length === 0 ? (
        <div className="sl-empty">Inbox empty. Nothing needs attention yet.</div>
      ) : (
        <div style={{ display: "grid", gap: "1em" }}>{s.messages.map((m) => <Email key={m.id} m={m} />)}</div>
      )}
    </div>
  );
}
