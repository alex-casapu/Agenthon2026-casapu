"use client";

import Link from "next/link";
import "../slides/slides.css";
import { ROLES, ROLE_ORDER } from "@/lib/scenario/data";
import { CHECKS, checks } from "@/lib/scenario/engine";
import { SLIDES } from "@/lib/scenario/slides";
import { dispatch, useScenario } from "@/lib/scenario/store";

/** Controls for us, not the audience: fire events, switch role, reset the demo. */
export default function PresenterView() {
  const s = useScenario();
  const c = checks(s);
  return (
    <div className="sl-presenter">
      <h1 style={{ fontSize: "1.6rem", margin: 0 }}>Presenter controls</h1>
      <p className="muted">Everything on the slides is driven by one scenario state. Reset it before going on stage.</p>

      <div className="sl-card">
        <h2>Events</h2>
        <div className="row">
          <button className="sl-btn" disabled={s.events.includes("report")} onClick={() => dispatch({ type: "event", name: "report" })}>▶ Market report arrives</button>
          <button className="sl-btn" disabled={s.events.includes("correction")} onClick={() => dispatch({ type: "event", name: "correction" })}>▶ Correction arrives</button>
          <button className="sl-btn bad" onClick={() => dispatch({ type: "reset" })}>Reset the demo</button>
        </div>
        <p className="muted small">Fired: {s.events.length ? s.events.join(", ") : "none yet"} · simulated clock {String(Math.floor(s.clock / 60)).padStart(2, "0")}:{String(s.clock % 60).padStart(2, "0")}</p>
      </div>

      <div className="sl-card">
        <h2>Viewing as</h2>
        <div className="row">
          {ROLE_ORDER.map((r) => (
            <button key={r} className={`sl-btn${s.role === r ? " primary" : ""}`} onClick={() => dispatch({ type: "setRole", role: r })}>{ROLES[r].name} · {ROLES[r].title}</button>
          ))}
        </div>
      </div>

      <div className="sl-card">
        <h2>Checks · {Object.values(c).filter(Boolean).length} / 7</h2>
        <div className="row">{CHECKS.map((k) => <span key={k.n} className={`sl-chip ${c[k.n] ? "st-approved" : ""}`}>{c[k.n] ? "✓" : k.n} {k.label}</span>)}</div>
      </div>

      <div className="sl-card">
        <h2>Slides</h2>
        <div className="row">{SLIDES.map((sl, i) => <Link key={sl.slug} className="sl-btn" href={`/slides/${sl.slug}`}>{i + 1}. {sl.title}</Link>)}</div>
        <p className="muted small">Keys on a slide: ← → move · E fires that slide’s event · N speaker notes · F fullscreen.</p>
      </div>

      <details>
        <summary>State</summary>
        <pre>{JSON.stringify({ events: s.events, role: s.role, orders: s.orders, nodes: s.nodes, chat: s.chat.length, split: s.split.length, visited: s.visited }, null, 2)}</pre>
      </details>
    </div>
  );
}
