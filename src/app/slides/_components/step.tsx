"use client";

import { createContext, useContext, type ReactNode } from "react";

/** The step inside the current slide. Arrow keys move through steps before they move to the next slide. */
export const StepContext = createContext(0);
export const useStep = () => useContext(StepContext);

/** Shown while `from <= step <= to`. Fades and rises in. */
export function At({ from = 0, to = 99, children, className = "", style, delay = 0 }: { from?: number; to?: number; children: ReactNode; className?: string; style?: React.CSSProperties; delay?: number }) {
  const step = useStep();
  const on = step >= from && step <= to;
  return (
    <div className={`st-at${on ? " on" : ""} ${className}`} style={{ ...style, transitionDelay: on ? `${delay}s` : "0s" }} aria-hidden={!on}>
      {children}
    </div>
  );
}
