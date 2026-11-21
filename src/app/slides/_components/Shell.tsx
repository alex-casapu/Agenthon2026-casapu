"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ROLES, ROLE_ORDER } from "@/lib/scenario/data";
import { CHECKS, checks } from "@/lib/scenario/engine";
import { SLIDES, slideIndex } from "@/lib/scenario/slides";
import { dispatch, useScenario } from "@/lib/scenario/store";

const EVENT_LABEL = { report: "Market report arrives", correction: "Correction arrives" } as const;

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

export function RoleSwitch() {
  const s = useScenario();
  return (
    <div className="sl-roles" role="group" aria-label="Viewing as">
      <span className="sl-roles-label">Viewing as</span>
      {ROLE_ORDER.map((r) => (
        <button key={r} className={s.role === r ? "on" : ""} onClick={() => dispatch({ type: "setRole", role: r })} title={`${ROLES[r].name} · ${ROLES[r].title}`}>
          {ROLES[r].title}
        </button>
      ))}
    </div>
  );
}

function Checklist() {
  const s = useScenario();
  const c = checks(s);
  const lit = Object.values(c).filter(Boolean).length;
  return (
    <div className="sl-strip" aria-label="The seven checks">
      {CHECKS.map((k) => (
        <div key={k.n} className={`sl-check${c[k.n] ? " on" : ""}`}>
          <span className="sl-check-n">{c[k.n] ? "✓" : k.n}</span>
          <span>{k.label}</span>
        </div>
      ))}
      <span className="sl-strip-total">{lit} / 7</span>
    </div>
  );
}

export default function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const s = useScenario();
  const [notes, setNotes] = useState(false);

  const slug = path.split("/").pop() ?? "";
  const idx = slideIndex(slug);
  const slide = SLIDES[idx];
  const eventFired = slide?.event ? s.events.includes(slide.event) : true;

  useEffect(() => {
    if (slug) dispatch({ type: "visit", slug });
  }, [slug]);

  useEffect(() => {
    if (!s.notice) return;
    const t = setTimeout(() => dispatch({ type: "dismissNotice" }), 4500);
    return () => clearTimeout(t);
  }, [s.notice]);

  useEffect(() => {
    const go = (i: number) => {
      const n = SLIDES[Math.max(0, Math.min(SLIDES.length - 1, i))];
      router.push(`/slides/${n.slug}`);
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); go(idx + 1); }
      else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); go(idx - 1); }
      else if (e.key === "Home") go(0);
      else if (e.key === "End") go(SLIDES.length - 1);
      else if (e.key === "e" || e.key === "E") { if (slide?.event) dispatch({ type: "event", name: slide.event }); }
      else if (e.key === "n" || e.key === "N") setNotes((v) => !v);
      else if (e.key === "f" || e.key === "F") {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, slide, router]);

  return (
    <div className="sl-root">
      <div className="sl-top">
        <span className="sl-counter">{idx >= 0 ? `${idx + 1} / ${SLIDES.length}` : ""}</span>
        <RoleSwitch />
      </div>

      <div className="sl-stage">{children}</div>

      {slide?.event && !eventFired && (
        <button className="sl-event" onClick={() => dispatch({ type: "event", name: slide.event! })} title="Press E">
          ▶ {EVENT_LABEL[slide.event]} <kbd>E</kbd>
        </button>
      )}

      {s.notice && (
        <div className="sl-toast" role="status" onClick={() => dispatch({ type: "dismissNotice" })}>
          {s.notice}
        </div>
      )}

      {notes && slide && (
        <aside className="sl-notes" aria-label="Speaker notes">
          <strong>{slide.title}</strong>
          <ul>{slide.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          <span className="muted small">N to hide · ← → slides · E fires the event · F fullscreen</span>
        </aside>
      )}

      <Checklist />
    </div>
  );
}
