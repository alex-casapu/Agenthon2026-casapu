import { cpLength, cpSlice } from "./canon";
import { PREDICATES } from "./predicates";
import type { DB } from "./store/log";

/** Human-oriented read model of claims: a readable sentence, fields by tier, quotes in context, history. */

export interface FieldView {
  name: string;
  value: string | number;
  tier: string;
  slot: string;
  resolver?: string;
  /** The quote this field was verified against (literal and resolved fields). */
  quote_id?: string;
}

export interface EvidenceView {
  quote_id: string;
  text: string;
  start: number;
  end: number;
  before: string;
  after: string;
  source: {
    source_id: string;
    kind: string;
    external_id: string;
    author: string | null;
    occurred_at: string;
    ingested_at: string;
    title: string | null;
    domain: string | null;
    doc_type: string | null;
    reliability: string | null;
    labels: string[];
  };
}

export interface ClaimView {
  claim_id: string;
  kind: string;
  predicate_id: string;
  predicate_version: number;
  status: string;
  sentence: string;
  fields: FieldView[];
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  extractor: Record<string, unknown> | null;
  history: { seq: number; type: string; actor: string; reason: string | null; created_at: string }[];
  evidence: EvidenceView[];
  raw: { subject: unknown; value: unknown; conditions: unknown; grounding: unknown };
}

/** ent:molino_rossi → "Molino Rossi". */
export function prettyEntity(v: unknown): string {
  const s = String(v ?? "").replace(/^ent:/, "").replace(/_/g, " ").trim();
  return s ? s.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : "?";
}

const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 6 }) : String(v));
const price = (f: Record<string, unknown>) => `${num(f.amount)} ${f.currency ?? ""}/${f.per ?? ""}`.replace(/\s+\//, "/");

/** One plain-language line for a claim, from its field values. Generic fallback for unknown predicates. */
export function sentenceFor(predicate: string, f: Record<string, unknown>): string {
  const has = (k: string) => f[k] !== undefined && f[k] !== null;
  switch (predicate) {
    case "supplier_price": {
      const extra = [
        has("price_type") ? `${f.price_type}` : null,
        has("volume") ? `for ${num(f.volume)} ${f.per}` : null,
        has("min_volume") ? `minimum order ${num(f.min_volume)} ${f.per}` : null,
        has("coverage_pct") ? `covers ${num(f.coverage_pct)}% of needs` : null,
        has("valid_to") ? `valid until ${f.valid_to}` : null,
      ].filter(Boolean);
      return `${prettyEntity(f.supplier)} prices ${prettyEntity(f.item)} at ${price(f)}${extra.length ? ` (${extra.join(", ")})` : ""}`;
    }
    case "spot_price":
      return `Market price of ${prettyEntity(f.item)}${has("market") ? ` (${f.market})` : ""} is ${price(f)}${
        has("change_pct") ? `, ${Number(f.change_pct) > 0 ? "+" : ""}${num(f.change_pct)}%` : ""
      }${has("period") ? ` — ${f.period}` : ""}`;
    case "demand":
      return `${has("site") ? prettyEntity(f.site) : "Requirement"} needs ${num(f.amount)} ${f.unit} of ${prettyEntity(f.item)} per ${f.period}`;
    case "stock_coverage":
      return `${prettyEntity(f.site)} holds ${num(f.days)} days of ${prettyEntity(f.item)}${has("as_of") ? ` as of ${f.as_of}` : ""}`;
    case "commitment":
      return `${prettyEntity(f.owner)} commits to ${f.action}${has("counterparty") ? ` for ${prettyEntity(f.counterparty)}` : ""}${has("due") ? `, by ${f.due}` : ""}`;
    case "statement":
      return String(f.text ?? "");
    default:
      return `${predicate}: ` + Object.entries(f).map(([k, v]) => `${k}=${v}`).join(", ");
  }
}

type Row = Record<string, string | number | null>;
const CONTEXT = 140;

export function listClaimViews(db: DB): ClaimView[] {
  const claims = db
    .prepare("SELECT c.*, s.status FROM claims c JOIN claim_status s USING (claim_id) ORDER BY c.rowid DESC")
    .all() as Row[];

  const events = new Map<string, ClaimView["history"]>();
  for (const e of db.prepare("SELECT seq, claim_id, type, actor, reason, created_at FROM claim_events ORDER BY seq").all() as Row[]) {
    const list = events.get(e.claim_id as string) ?? [];
    list.push({ seq: e.seq as number, type: e.type as string, actor: e.actor as string, reason: e.reason as string | null, created_at: e.created_at as string });
    events.set(e.claim_id as string, list);
  }

  const evidence = new Map<string, EvidenceView[]>();
  for (const r of db
    .prepare(
      `SELECT e.claim_id, q.quote_id, q.text, q.start, q."end", s.source_id, s.kind, s.external_id, s.author, s.occurred_at, s.ingested_at,
              s.acl_labels, s.meta, s.canonical_text
       FROM claim_evidence e JOIN quotes q USING (quote_id) JOIN sources s ON s.source_id = q.source_id
       ORDER BY q.start`,
    )
    .all() as Row[]) {
    const meta = JSON.parse(r.meta as string) as Record<string, unknown>;
    const text = r.canonical_text as string;
    const total = cpLength(text);
    const start = r.start as number;
    const end = r.end as number;
    const list = evidence.get(r.claim_id as string) ?? [];
    list.push({
      quote_id: r.quote_id as string,
      text: r.text as string,
      start,
      end,
      before: cpSlice(text, Math.max(0, start - CONTEXT), start),
      after: cpSlice(text, end, Math.min(total, end + CONTEXT)),
      source: {
        source_id: r.source_id as string,
        kind: r.kind as string,
        external_id: r.external_id as string,
        author: r.author as string | null,
        occurred_at: r.occurred_at as string,
        ingested_at: r.ingested_at as string,
        title: ((meta.title ?? meta.subject) as string | undefined) ?? null,
        domain: (meta.domain as string | undefined) ?? null,
        doc_type: (meta.doc_type as string | undefined) ?? null,
        reliability: (meta.reliability as string | undefined) ?? null,
        labels: JSON.parse(r.acl_labels as string) as string[],
      },
    });
    evidence.set(r.claim_id as string, list);
  }

  return claims.map((c) => {
    const subject = JSON.parse(c.subject as string) as Record<string, unknown>;
    const value = JSON.parse(c.value as string) as Record<string, unknown>;
    const conditions = JSON.parse(c.conditions as string) as Record<string, unknown>;
    const grounding = JSON.parse(c.grounding as string) as Record<string, { tier: string; resolver?: string; quote_id?: string }>;
    const def = PREDICATES.find((p) => p.id === c.predicate_id && p.version === c.predicate_version);

    const flat: Record<string, unknown> = {};
    const fields: FieldView[] = [];
    for (const f of def?.fields ?? []) {
      const v = f.slot === "valid_from" ? c.valid_from : f.slot === "valid_to" ? c.valid_to : ({ subject, value, conditions } as Record<string, Record<string, unknown>>)[f.slot][f.name];
      if (v === undefined || v === null) continue;
      flat[f.name] = v;
      const g = grounding[f.name];
      fields.push({ name: f.name, value: v as string | number, tier: g?.tier ?? f.tier, slot: f.slot, resolver: g?.resolver, quote_id: g?.quote_id });
    }
    if (!def) for (const [k, v] of Object.entries({ ...subject, ...value, ...conditions })) flat[k] = v;

    let extractor: Record<string, unknown> | null = null;
    try {
      extractor = JSON.parse(c.extractor as string);
    } catch {
      /* leave null */
    }
    return {
      claim_id: c.claim_id as string,
      kind: c.kind as string,
      predicate_id: c.predicate_id as string,
      predicate_version: c.predicate_version as number,
      status: c.status as string,
      sentence: sentenceFor(c.predicate_id as string, flat),
      fields,
      valid_from: c.valid_from as string | null,
      valid_to: c.valid_to as string | null,
      created_at: c.created_at as string,
      extractor,
      history: events.get(c.claim_id as string) ?? [],
      evidence: evidence.get(c.claim_id as string) ?? [],
      raw: { subject, value, conditions, grounding },
    };
  });
}
