"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SCRIPT, WPM, wordCount } from "@/lib/scenario/script";
import { SLIDES } from "@/lib/scenario/slides";

/** Render a script block: [stage directions] in colour, the rest is what you say. */
function Script({ text }: { text: string }) {
  const parts = text.split(/(\[[^\]]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[") ? <span key={i} className="pt-cue">{p}</span> : <span key={i}>{p}</span>,
      )}
    </>
  );
}

/**
 * Teleprompter. Open it in a second window (or on your laptop while the deck is on the projector).
 * It follows the deck live; its own arrow keys, space and E drive the deck.
 */
export default function PromptView() {
  const [pos, setPos] = useState<{ slug: string; step: number } | null>(null);
  const [size, setSize] = useState(46);
  const ch = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const c = new BroadcastChannel("brain-deck");
    c.onmessage = (e) => { if (e.data?.type === "state") setPos({ slug: e.data.slug, step: e.data.step }); };
    c.postMessage({ type: "hello" });
    ch.current = c;
    return () => { c.close(); ch.current = null; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === " " || e.key === "PageDown") { e.preventDefault(); ch.current?.postMessage({ cmd: "next" }); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); ch.current?.postMessage({ cmd: "prev" }); }
      else if (e.key === "e" || e.key === "E") ch.current?.postMessage({ cmd: "event" });
      else if (e.key === "+" || e.key === "=") setSize((s) => Math.min(96, s + 4));
      else if (e.key === "-") setSize((s) => Math.max(24, s - 4));
      else if (e.key === "f" || e.key === "F") { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else document.documentElement.requestFullscreen().catch(() => {}); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const slide = SLIDES.find((s) => s.slug === pos?.slug);
  const lines = useMemo(() => (pos ? SCRIPT[pos.slug] ?? [] : []), [pos]);
  const idx = slide ? SLIDES.indexOf(slide) : -1;
  const step = pos?.step ?? 0;
  const cur = lines[Math.min(step, lines.length - 1)] ?? "";
  // what comes next: the next step of this slide, or the opening line of the next slide
  const nextText = step + 1 < lines.length ? lines[step + 1] : idx >= 0 && SLIDES[idx + 1] ? (SCRIPT[SLIDES[idx + 1].slug] ?? [])[0] ?? "" : "";
  const nextIsSlide = step + 1 >= lines.length && idx >= 0 && !!SLIDES[idx + 1];

  const main = SLIDES.filter((x) => !x.backup);
  const totalWords = main.reduce((n, x) => n + (SCRIPT[x.slug] ?? []).reduce((m, t) => m + wordCount(t), 0), 0);
  const doneWords = SLIDES.slice(0, Math.max(0, idx)).reduce((n, s) => n + (SCRIPT[s.slug] ?? []).reduce((m, t) => m + wordCount(t), 0), 0)
    + lines.slice(0, step).reduce((n, t) => n + wordCount(t), 0);

  return (
    <div className="pt-root">
      <header className="pt-top">
        <span>{idx >= 0 ? `${String(idx + 1).padStart(2, "0")} / ${SLIDES.length} · ${slide!.title}` : "Waiting for the deck…"}</span>
        <span className="pt-dots">{lines.map((_, i) => <i key={i} className={i === step ? "on" : i < step ? "done" : ""} />)}</span>
        <span>~{Math.max(0, Math.ceil((totalWords - doneWords) / WPM))} min left</span>
      </header>
      {!pos ? (
        <div className="pt-wait">Open the deck in another window (<span className="pt-mono">/slides/title</span>). This view follows it live.</div>
      ) : (
        <>
          <main className="pt-main" style={{ fontSize: size }}><Script text={cur} /></main>
          <aside className="pt-next">
            <div className="pt-label">{nextIsSlide ? `Next slide · ${SLIDES[idx + 1].title}` : nextText ? "Next beat" : "End"}</div>
            <div className="pt-nexttext"><Script text={nextText} /></div>
          </aside>
        </>
      )}
      <footer className="pt-foot">← → / space: drive the deck · E: fire the scenario event · + −: text size · F: full screen</footer>
      <style>{`
        .pt-root { position: fixed; inset: 0; z-index: 100; background: #0a0f1f; color: #fff; display: grid; grid-template-rows: auto 1fr auto auto; font-family: var(--font-geist-sans), system-ui, sans-serif; }
        .pt-top { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 18px 40px; font: 500 13px var(--font-geist-mono), monospace; letter-spacing: .1em; text-transform: uppercase; color: #9aa4bf; border-bottom: 1px solid #232c47; }
        .pt-dots { display: flex; gap: 6px; } .pt-dots i { width: 22px; height: 4px; background: #232c47; } .pt-dots i.done { background: #3a4668; } .pt-dots i.on { background: #5b82ff; width: 36px; }
        .pt-main { padding: 5vh 6vw; overflow: auto; line-height: 1.32; font-weight: 600; letter-spacing: -.01em; white-space: pre-wrap; align-self: center; max-height: 100%; }
        .pt-cue { color: #ff8a4c; font: 500 .55em var(--font-geist-mono), monospace; letter-spacing: .04em; }
        .pt-next { padding: 18px 6vw; border-top: 1px solid #232c47; background: #0e1530; color: #9aa4bf; max-height: 24vh; overflow: hidden; }
        .pt-label { font: 500 11px var(--font-geist-mono), monospace; letter-spacing: .12em; text-transform: uppercase; color: #5b82ff; margin-bottom: 6px; }
        .pt-nexttext { font-size: 20px; line-height: 1.4; white-space: pre-wrap; } .pt-nexttext .pt-cue { font-size: 14px; }
        .pt-foot { padding: 10px 40px; font: 500 11px var(--font-geist-mono), monospace; letter-spacing: .08em; color: #66708a; text-transform: uppercase; }
        .pt-wait { display: grid; place-items: center; color: #9aa4bf; font-size: 22px; padding: 40px; text-align: center; }
        .pt-mono { font-family: var(--font-geist-mono), monospace; color: #fff; }
      `}</style>
    </div>
  );
}
