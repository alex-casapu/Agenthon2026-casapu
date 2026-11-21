"use client";

import { useEffect, useRef } from "react";
import { setPrincipalId } from "../../../components/principal";
import { useStep } from "../step";

/**
 * The real app, inside the deck. Same origin: the identity cookie is shared, and the arrow keys pressed
 * inside the app are handed back to the deck, so the presenter never has to click outside the page.
 * Five beats, five actions on the real pages: add a piece of information by hand (New source), reject it, then three questions.
 */
const BEATS = [
  { path: "/sources", as: "marta", label: "Add a piece of information", hint: "New source: describe it, review the draft, let it arrive in the simulated world." },
  { path: "/claims", as: "marta", label: "It was fake news", hint: "As Marta: Reject the claim it produced." },
  { path: "/chat", as: "sara", label: "Same question, no access", hint: "Sara: “What is our framework contract price?”" },
  { path: "/chat", as: "luca", label: "Same question, with access", hint: "Luca asks it: the answer, with its citations." },
  { path: "/chat", as: "marta", label: "A question it can't answer", hint: "Marta: “What did we hear about the Canadian harvest?”" },
] as const;

const FORWARD = new Set(["ArrowRight", "ArrowLeft", " ", "PageDown", "PageUp"]);

export function AppDemoStory() {
  const step = useStep();
  const beat = BEATS[Math.min(step, BEATS.length - 1)];
  const frame = useRef<HTMLIFrameElement>(null);
  // The identity is a cookie: set it before the frame loads that page.
  const src = `${beat.path}${beat.path.includes("?") ? "&" : "?"}as=${beat.as}`;
  useEffect(() => { setPrincipalId(beat.as); }, [beat.as]);

  const onLoad = () => {
    const win = frame.current?.contentWindow;
    if (!win) return;
    win.addEventListener("keydown", (e) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (!FORWARD.has(e.key)) return;
      e.preventDefault();
      window.dispatchEvent(new KeyboardEvent("keydown", { key: e.key }));
    });
  };

  return (
    <div className="ad-wrap">
      <iframe ref={frame} key={`${beat.path}|${beat.as}`} className="ad-frame" src={src} title="Company Brain" onLoad={onLoad} />
      <div className="ad-bar">
        <ol>{BEATS.map((b, i) => <li key={b.label} className={i === step ? "on" : i < step ? "done" : ""}><span>{i + 1}</span>{b.label}</li>)}</ol>
        <div className="ad-hint">{beat.hint}</div>
      </div>
    </div>
  );
}
