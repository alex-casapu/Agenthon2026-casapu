import { sha256 } from "../hash";
import type { Llm, LlmResponse } from "../llm";
import { findEntity } from "../entities";
import { latestPredicates } from "../predicates";
import { admitEntity, listEntities, submitClaim, type DB } from "../store";
import type { EntityDeclaration } from "../store";
import { EXTRACTOR_VERSION, SYSTEM_PROMPT, buildPrompt, buildRepairPrompt, buildSchema, vocabHash, type Feedback } from "./prompt";
import { hasDoneRun, recordExtractionRun } from "./runs";

export interface ExtractOptions {
  llm: Llm;
  model: string;
  /** Repair rounds after the first call. */
  maxRepairs?: number;
  /** Extract even if an up-to-date run exists. */
  force?: boolean;
  /** Approve claims on admission (trust by default). Off: they wait for a curator. */
  trust?: boolean;
  /** Restrict to these predicate ids (e.g. a targeted pass for a newly approved predicate). */
  predicates?: string[];
}

export interface ExtractSummary {
  source_id: string;
  status: "done" | "failed" | "skipped";
  rounds: number;
  proposed: number;
  duplicates: number;
  rejected: number;
  claim_ids: string[];
  /** Entities newly admitted from this source (discovered automatically). */
  entities_created: number;
  error?: string;
  cost_usd?: number;
  duration_ms?: number;
}

interface RawClaim {
  predicate?: unknown;
  fields?: unknown;
  quotes?: unknown;
}

/** Pull the claims array out of a model response: structured output first, then JSON in the text. */
export function parseClaims(res: LlmResponse): { ok: true; claims: unknown[]; entities: unknown[] } | { ok: false; error: string } {
  const fromObj = (o: unknown) =>
    o && typeof o === "object" && Array.isArray((o as { claims?: unknown }).claims)
      ? { claims: (o as { claims: unknown[] }).claims, entities: Array.isArray((o as { entities?: unknown }).entities) ? ((o as { entities: unknown[] }).entities) : [] }
      : null;
  const s = fromObj(res.structured);
  if (s) return { ok: true, ...s };
  const text = res.text.replace(/```(?:json)?/gi, "").trim();
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      const c = fromObj(JSON.parse(text.slice(a, b + 1)));
      if (c) return { ok: true, ...c };
    } catch {
      /* fall through */
    }
  }
  return { ok: false, error: 'your previous reply was not valid JSON of the form {"claims": [...]}' };
}

/** One call per source over the whole vocabulary; every claim goes through the gate; rejects are repaired. */
export async function extractSource(db: DB, sourceId: string, opts: ExtractOptions): Promise<ExtractSummary> {
  const row = db
    .prepare("SELECT source_id, kind, external_id, occurred_at, author, meta, canonical_text FROM sources WHERE source_id = ?")
    .get(sourceId) as
    | { source_id: string; kind: string; external_id: string; occurred_at: string; author: string | null; meta: string; canonical_text: string }
    | undefined;
  if (!row) throw new Error(`unknown source ${sourceId}`);

  const preds = latestPredicates().filter((p) => !opts.predicates || opts.predicates.includes(p.id));
  if (preds.length === 0) throw new Error("no predicates selected");
  const vocab = vocabHash(preds);
  if (!opts.force && hasDoneRun(db, sourceId, EXTRACTOR_VERSION, vocab))
    return { source_id: sourceId, status: "skipped", rounds: 0, proposed: 0, duplicates: 0, rejected: 0, claim_ids: [], entities_created: 0 };

  const basePrompt = buildPrompt(
    { kind: row.kind, external_id: row.external_id, occurred_at: row.occurred_at, author: row.author, meta: JSON.parse(row.meta), text: row.canonical_text },
    preds,
    listEntities(db),
  );
  const schema = buildSchema(preds);
  const promptHash = sha256(opts.model + "\n" + SYSTEM_PROMPT + "\n" + basePrompt);
  const known = new Set(preds.map((p) => p.id));
  const stamp = { type: "llm", name: EXTRACTOR_VERSION, model: opts.model, vocab_hash: vocab, prompt_hash: promptHash };

  const maxRounds = 1 + (opts.maxRepairs ?? 2);
  const t0 = Date.now();
  let cost = 0;
  let proposed = 0;
  let duplicates = 0;
  let rounds = 0;
  let parsedOnce = false;
  let dropped = 0; // rejected claims the model withdrew instead of fixing
  const entityLog: { id: string; name: string; created: boolean }[] = [];
  let fatal: string | undefined;
  let feedback: Feedback[] = [];
  const claimIds: string[] = [];
  const log: { round: number; returned: number; accepted: number; rejected: number; error?: string }[] = [];

  for (let round = 0; round < maxRounds; round++) {
    if (round > 0 && feedback.length === 0) break;
    const prompt = round === 0 ? basePrompt : buildRepairPrompt(basePrompt, feedback);
    let res: LlmResponse;
    rounds++;
    try {
      res = await opts.llm({ model: opts.model, system: SYSTEM_PROMPT, prompt, schema });
    } catch (e) {
      fatal = (e as Error).message;
      log.push({ round, returned: 0, accepted: 0, rejected: 0, error: fatal });
      break;
    }
    cost += res.cost_usd ?? 0;

    const parsed = parseClaims(res);
    if (!parsed.ok) {
      if (!parsedOnce) feedback = [{ errors: [parsed.error] }]; // after a good round, keep its rejects to retry
      log.push({ round, returned: 0, accepted: 0, rejected: 0, error: parsed.error });
      continue;
    }
    parsedOnce = true;
    if (round > 0) dropped += Math.max(0, feedback.filter((f) => f.claim !== undefined).length - parsed.claims.length);

    const next: Feedback[] = [];
    let accepted = 0;

    // 1. entities the model found: admitted automatically if grounded in a verbatim quote
    for (const d of parsed.entities as EntityDeclaration[]) {
      const r = admitEntity(db, d, sourceId);
      if (r.ok) entityLog.push({ id: r.entity.id, name: r.entity.name, created: r.created });
      else next.push({ claim: { entity: d }, errors: [r.error] });
    }
    const registry = listEntities(db);

    // 2. claims, with entity names resolved to ids by code
    for (const c of parsed.claims as RawClaim[]) {
      const errs: string[] = [];
      if (typeof c?.predicate !== "string" || !known.has(c.predicate)) errs.push(`unknown predicate ${JSON.stringify(c?.predicate)}`);
      if (!c?.fields || typeof c.fields !== "object" || Array.isArray(c.fields)) errs.push("fields must be an object");
      const quotes = Array.isArray(c?.quotes) ? c.quotes.filter((q): q is string => typeof q === "string" && q.trim() !== "") : [];
      if (quotes.length === 0) errs.push("at least one quote is required");
      if (errs.length) {
        next.push({ claim: c, errors: errs });
        continue;
      }
      const def = preds.find((p) => p.id === c.predicate)!;
      const fields: Record<string, unknown> = { ...(c.fields as Record<string, unknown>) };
      for (const f of def.fields) {
        const v = fields[f.name];
        if (f.type === "entity" && typeof v === "string") fields[f.name] = findEntity(registry, v)?.id ?? v;
      }
      const r = submitClaim(
        db,
        {
          predicate_id: c.predicate as string,
          fields,
          evidence: quotes.map((quote) => ({ source_id: sourceId, quote })),
          extractor: stamp,
        },
        "agent:extractor",
        { trust: opts.trust },
      );
      if (r.ok) {
        accepted++;
        claimIds.push(r.claim_id);
        if (r.duplicate) duplicates++;
        else proposed++;
      } else next.push({ claim: c, errors: r.errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)) });
    }
    log.push({ round, returned: parsed.claims.length, accepted, rejected: next.length });
    feedback = next;
  }

  const stillRejected = parsedOnce ? feedback.filter((f) => f.claim !== undefined) : [];
  const rejectedCount = stillRejected.length + dropped;
  const status: "done" | "failed" = parsedOnce ? "done" : "failed";
  const error = parsedOnce ? fatal : (fatal ?? feedback[0]?.errors[0] ?? "no usable reply");
  const duration_ms = Date.now() - t0;

  recordExtractionRun(db, {
    source_id: sourceId,
    extractor: EXTRACTOR_VERSION,
    vocab_hash: vocab,
    model: opts.model,
    prompt_hash: promptHash,
    status,
    rounds,
    proposed,
    duplicates,
    rejected: rejectedCount,
    detail: { rounds: log, withdrawn: dropped, entities: entityLog, rejected: stillRejected.map((f) => ({ claim: f.claim, errors: f.errors })), predicates: preds.map((p) => `${p.id}@${p.version}`) },
    error: error ?? null,
    cost_usd: cost || null,
    duration_ms,
  });

  return { source_id: sourceId, status, rounds, proposed, duplicates, rejected: rejectedCount, claim_ids: claimIds, entities_created: entityLog.filter((e) => e.created).length, error, cost_usd: cost || undefined, duration_ms };
}
