import { useSyncExternalStore } from "react";
import { initialState, reduce } from "./engine";
import type { Action, State } from "./types";

/**
 * One scenario state for the whole presentation. Lives at module scope so it
 * survives client-side navigation between slides, and in sessionStorage so it
 * survives a reload. Reset from the presenter page.
 */
const KEY = "brain-scenario-v1";

function load(): State {
  if (typeof window === "undefined") return initialState();
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as State;
  } catch {
    /* storage blocked: start fresh */
  }
  return initialState();
}

let state: State = load();
const SERVER_STATE = initialState();
const listeners = new Set<() => void>();

export function dispatch(a: Action): void {
  state = reduce(state, a);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function getState(): State {
  return state;
}

export function useScenario(): State {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => SERVER_STATE,
  );
}
