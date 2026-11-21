/**
 * Access policy. Pure and deterministic: no model is ever involved in deciding
 * who may see what. A claim's labels are the union of the labels of every source
 * it rests on; a principal sees it only if it is cleared for ALL of them.
 */

export interface Principal {
  id: string;
  name: string;
  role: string;
  /** Labels this principal may read. "*" = everything. */
  clearances: string[];
  /** May approve, reject and retract claims. */
  curator: boolean;
}

/** The scenario's cast. Seeded into the append-only `principals` table at startup. */
export const PRINCIPALS: Principal[] = [
  { id: "marta", name: "Marta Ricci", role: "Purchasing", clearances: ["*"], curator: true },
  { id: "luca", name: "Luca Bianchi", role: "Finance", clearances: ["public", "finance"], curator: false },
  { id: "sara", name: "Sara Conti", role: "Production", clearances: ["public"], curator: false },
];

export const getPrincipal = (id: string | null | undefined): Principal | null => PRINCIPALS.find((p) => p.id === id) ?? null;

/**
 * True iff every label is within the principal's clearances. A claim with no
 * labels at all (should not happen) is treated as restricted, never as public.
 */
export function canSee(p: Principal, labels: string[]): boolean {
  if (p.clearances.includes("*")) return true;
  return labels.length > 0 && labels.every((l) => p.clearances.includes(l));
}

export const PRINCIPAL_COOKIE = "brain_principal";

/** The principal named in a Cookie header; null means "god mode" (the debug tools, no filtering). */
export function principalFromCookieHeader(header: string | null | undefined): Principal | null {
  const m = new RegExp(`(?:^|;\\s*)${PRINCIPAL_COOKIE}=([^;]*)`).exec(header ?? "");
  return m ? getPrincipal(decodeURIComponent(m[1])) : null;
}
