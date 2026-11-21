"use client";

import { useSyncExternalStore } from "react";
import { PRINCIPALS, PRINCIPAL_COOKIE } from "@/lib/policy";

/**
 * The acting role, kept in a cookie so the server sees it on every request
 * ("god" = no cookie = the debug tools, no filtering). Demo identity: there is
 * no login; the server's job is to apply policy deterministically to whoever is named.
 */
const EVENT = "brain-principal";

function read(): string {
  const m = new RegExp(`(?:^|;\\s*)${PRINCIPAL_COOKIE}=([^;]*)`).exec(document.cookie);
  const id = m ? decodeURIComponent(m[1]) : "";
  return PRINCIPALS.some((p) => p.id === id) ? id : "god";
}

export function usePrincipalId(): string {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      return () => window.removeEventListener(EVENT, cb);
    },
    read,
    () => "god",
  );
}

export function setPrincipalId(id: string): void {
  document.cookie = id === "god" ? `${PRINCIPAL_COOKIE}=; path=/; max-age=0` : `${PRINCIPAL_COOKIE}=${encodeURIComponent(id)}; path=/; SameSite=Lax; max-age=31536000`;
  window.dispatchEvent(new Event(EVENT));
}

export function PrincipalSwitcher() {
  const id = usePrincipalId();
  return (
    <label className="who" title="Who is asking. Policy is applied to this role on the server.">
      <span className="muted small">viewing as</span>
      <select value={id} onChange={(e) => setPrincipalId(e.target.value)}>
        <option value="god">God mode (everything)</option>
        {PRINCIPALS.map((p) => (
          <option key={p.id} value={p.id}>{p.name} · {p.role}{p.curator ? " · curator" : ""}</option>
        ))}
      </select>
    </label>
  );
}
