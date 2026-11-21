/**
 * Access policy. Pure and deterministic: no model is ever involved in deciding
 * who may see what. A claim's labels are the union of the labels of every source
 * it rests on; a principal sees it only if cleared for ALL of them.
 *
 * Who the principals are (people, roles, clearances) is configuration, not code: a
 * world supplies it (see policy-config.ts). There are at most three.
 */

export interface Principal {
  id: string;
  name: string;
  /** Job title, shown to people. */
  role: string;
  /** Labels this principal may read. "*" = everything. */
  clearances: string[];
  /** May approve, reject and retract claims. */
  curator: boolean;
  /** Starter questions for this person's chat. */
  suggestions?: string[];
}

export const MAX_PRINCIPALS = 3;

/** Used when no configuration is supplied: the original demo cast. */
export const DEFAULT_PRINCIPALS: Principal[] = [
  {
    id: "marta",
    name: "Marta Ricci",
    role: "Purchasing",
    clearances: ["*"],
    curator: true,
    suggestions: [
      "How much has the spot price of semolina gone up?",
      "What offers do we have from suppliers right now?",
      "How many days of semolina do we have in Parma?",
      "What did we hear about the Canadian harvest?",
    ],
  },
  {
    id: "luca",
    name: "Luca Bianchi",
    role: "Finance",
    clearances: ["public", "finance"],
    curator: false,
    suggestions: [
      "What is our framework contract price, and how much of our needs does it cover?",
      "When does the Molino Tavoliere invoice fall due?",
      "What is the market price of durum semolina?",
      "What is the price in Turkey?",
    ],
  },
  {
    id: "sara",
    name: "Sara Conti",
    role: "Production",
    clearances: ["public"],
    curator: false,
    suggestions: [
      "How many days of semolina do we have in Parma?",
      "How much semolina does Parma need each month?",
      "What is the market price of durum semolina now?",
      "What is our framework contract price?",
    ],
  },
];

const ID = /^[a-z0-9][a-z0-9_-]*$/;
const LABEL = /^(\*|[a-z0-9_-]+)$/;

export type PrincipalsResult = { ok: true; principals: Principal[] } | { ok: false; errors: string[] };

/** Checks a principals configuration: one to three people, unique ids, well-formed clearances, a curator. */
export function validatePrincipals(value: unknown): PrincipalsResult {
  const errors: string[] = [];
  if (!Array.isArray(value)) return { ok: false, errors: ["principals must be a list"] };
  if (value.length === 0) errors.push("at least one principal is required");
  if (value.length > MAX_PRINCIPALS) errors.push(`at most ${MAX_PRINCIPALS} principals are supported, found ${value.length}`);

  const out: Principal[] = [];
  const seen = new Set<string>();
  value.forEach((raw, i) => {
    const at = `principal ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    const p = raw as Record<string, unknown>;
    const str = (k: string) => typeof p[k] === "string" && (p[k] as string).trim() !== "";
    if (typeof p.id !== "string" || !ID.test(p.id)) errors.push(`${at}: id must be lowercase letters, digits, - or _`);
    else if (seen.has(p.id)) errors.push(`${at}: duplicate id "${p.id}"`);
    else seen.add(p.id);
    if (!str("name")) errors.push(`${at}: name is required`);
    if (!str("role")) errors.push(`${at}: role is required`);
    if (!Array.isArray(p.clearances) || p.clearances.some((c) => typeof c !== "string" || !LABEL.test(c))) errors.push(`${at}: clearances must be a list of labels (a-z, 0-9, _, - or *)`);
    if (p.curator !== undefined && typeof p.curator !== "boolean") errors.push(`${at}: curator must be true or false`);
    if (p.suggestions !== undefined && (!Array.isArray(p.suggestions) || p.suggestions.length > 8 || p.suggestions.some((s) => typeof s !== "string" || !s.trim() || s.length > 200)))
      errors.push(`${at}: suggestions must be up to 8 short questions`);
    out.push({
      id: String(p.id),
      name: String(p.name ?? "").trim(),
      role: String(p.role ?? "").trim(),
      clearances: Array.isArray(p.clearances) ? (p.clearances as string[]) : [],
      curator: p.curator === true,
      ...(Array.isArray(p.suggestions) ? { suggestions: (p.suggestions as string[]).map((s) => s.trim()) } : {}),
    });
  });
  if (value.length > 0 && !out.some((p) => p.curator)) errors.push("one principal must be a curator (curator: true), or nothing can ever be approved");
  return errors.length ? { ok: false, errors } : { ok: true, principals: out };
}

/**
 * True iff every label is within the principal's clearances. A claim with no
 * labels at all (should not happen) is treated as restricted, never as public.
 */
export function canSee(p: Principal, labels: string[]): boolean {
  if (p.clearances.includes("*")) return true;
  return labels.length > 0 && labels.every((l) => p.clearances.includes(l));
}

export const PRINCIPAL_COOKIE = "brain_principal";

/** The principal id named in a Cookie header, or null (god mode: the debug tools, no filtering). */
export function principalIdFromCookieHeader(header: string | null | undefined): string | null {
  const m = new RegExp(`(?:^|;\\s*)${PRINCIPAL_COOKIE}=([^;]*)`).exec(header ?? "");
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]) || null;
  } catch {
    return null;
  }
}
