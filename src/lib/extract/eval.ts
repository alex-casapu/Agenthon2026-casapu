import { PREDICATES } from "../predicates";
import type { listClaims } from "../store";

/** Scoring of extracted claims against hand-written ground truth. Pure; used by the eval harness. */

export interface Expectation {
  predicate?: string;
  fields?: Record<string, unknown>;
  quoteIncludes?: string;
  /** Any one of these alternatives satisfies the expectation. */
  anyOf?: Expectation[];
}
export interface SourceTruth {
  expect: Expectation[];
  /** Claims that are acceptable but not required: never counted as extras. */
  allow?: Expectation[];
  forbid?: { predicate: string }[];
}

type Claim = ReturnType<typeof listClaims>[number];

/** A claim's field values by name, read back out of its slots. */
export function flattenClaim(c: Claim): Record<string, unknown> {
  const def = PREDICATES.find((p) => p.id === c.predicate_id && p.version === c.predicate_version);
  const out: Record<string, unknown> = {};
  for (const f of def?.fields ?? []) {
    const v = f.slot === "valid_from" ? c.valid_from : f.slot === "valid_to" ? c.valid_to : (c[f.slot] as Record<string, unknown>)[f.name];
    if (v !== undefined && v !== null) out[f.name] = v;
  }
  return out;
}

export function matches(c: Claim, e: Expectation): boolean {
  if (e.anyOf) return e.anyOf.some((a) => matches(c, a));
  if (c.predicate_id !== e.predicate) return false;
  const flat = flattenClaim(c);
  for (const [k, v] of Object.entries(e.fields ?? {})) if (flat[k] !== v) return false;
  if (e.quoteIncludes && !c.evidence.some((q) => q.text.includes(e.quoteIncludes!))) return false;
  return true;
}

export interface SourceScore {
  expected: number;
  found: number;
  missing: Expectation[];
  extras: Claim[];
  forbiddenHits: Claim[];
}

export function scoreSource(claims: Claim[], truth: SourceTruth): SourceScore {
  const missing = truth.expect.filter((e) => !claims.some((c) => matches(c, e)));
  const extras = claims.filter((c) => ![...truth.expect, ...(truth.allow ?? [])].some((e) => matches(c, e)));
  const forbiddenHits = claims.filter((c) => (truth.forbid ?? []).some((f) => f.predicate === c.predicate_id));
  return { expected: truth.expect.length, found: truth.expect.length - missing.length, missing, extras, forbiddenHits };
}
