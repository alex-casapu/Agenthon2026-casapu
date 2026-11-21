import { getEntity, suggestEntities } from "../entities";
import { sha256, canonicalJson } from "../hash";
import { getPredicate } from "../predicates";
import { dateCandidates } from "./dates";
import { locateQuote } from "./locate";
import { numberCandidates } from "./numbers";
import { CURRENCIES, QUANTITY_UNITS, unitInText } from "./units";
import type {
  ClaimDraft,
  FieldDef,
  FieldGrounding,
  GateError,
  GateInput,
  GateResult,
  SourceView,
  VerifiedQuote,
} from "./types";

export * from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const normText = (s: string) => s.normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

interface Located extends VerifiedQuote {
  occurred_at: string;
}

/** Returns an error message if the value has the wrong shape for the field. */
function typeError(f: FieldDef, v: unknown): string | null {
  switch (f.type) {
    case "number":
      return typeof v === "number" && Number.isFinite(v) ? null : "must be a finite number";
    case "date":
      return typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))
        ? null
        : "must be an ISO date (YYYY-MM-DD)";
    default:
      return typeof v === "string" && v.trim() !== "" ? null : "must be a non-empty string";
  }
}

/**
 * Tier checks. literal: the value must be readable straight out of a quote.
 * resolved: a deterministic resolver re-derives it from quote + source metadata.
 * interpretive: shape only; a human curator reviews the interpretation.
 */
function groundField(f: FieldDef, v: unknown, quotes: Located[], strictEntities: boolean): { grounding: FieldGrounding } | { error: GateError } {
  if (f.tier === "interpretive") {
    if (strictEntities && f.type === "entity" && !getEntity(v as string)) {
      const near = suggestEntities(v as string).map((x) => x.id);
      return {
        error: {
          code: "unknown_entity",
          field: f.name,
          message: `${JSON.stringify(v)} is not in the entity registry${near.length ? ` (closest: ${near.join(", ")})` : ""}; use a listed id, or leave the claim out if the entity is not listed`,
        },
      };
    }
    return { grounding: { tier: "interpretive" } };
  }

  const find = (test: (q: Located) => boolean) => quotes.find(test);

  if (f.tier === "literal") {
    const hit =
      f.type === "number"
        ? find((q) => numberCandidates(q.text).has(v as number))
        : find((q) => normText(q.text).includes(normText(v as string)));
    return hit
      ? { grounding: { tier: "literal", quote_id: hit.quote_id } }
      : {
          error: {
            code: "literal_not_in_quote",
            field: f.name,
            message: `${JSON.stringify(v)} does not appear in any quote`,
          },
        };
  }

  // resolved
  let hit: Located | undefined;
  let resolver: string;
  if (f.type === "date") {
    resolver = "date@1";
    hit = find((q) => dateCandidates(q.text, q.occurred_at).has(v as string));
  } else if (f.type === "currency") {
    resolver = "currency@1";
    hit = find((q) => unitInText(CURRENCIES, v as string, q.text));
  } else {
    resolver = "quantity_unit@1";
    hit = find((q) => unitInText(QUANTITY_UNITS, v as string, q.text));
  }
  return hit
    ? { grounding: { tier: "resolved", quote_id: hit.quote_id, resolver } }
    : {
        error: {
          code: "resolved_mismatch",
          field: f.name,
          message: `${resolver} cannot derive ${JSON.stringify(v)} from the quotes`,
        },
      };
}

/** The gate: pure, no LLM, no DB. Everything a claim asserts is checked against its quotes. */
export interface GateOptions {
  /**
   * Require entity fields to be ids in the registry. A rule for what may be
   * admitted, not evidence grounding, so a later audit (verify) does not apply it
   * to claims admitted before the registry existed.
   */
  entities?: boolean;
}

export function checkClaim(input: GateInput, getSource: (id: string) => SourceView | undefined, opts: GateOptions = {}): GateResult {
  const errors: GateError[] = [];

  const pred = getPredicate(input.predicate_id, input.predicate_version);
  if (!pred) {
    return {
      ok: false,
      errors: [{ code: "unknown_predicate", message: `unknown predicate ${input.predicate_id}` }],
    };
  }

  if (!input.evidence?.length)
    return { ok: false, errors: [{ code: "no_evidence", message: "at least one quote is required" }] };

  // 1. Quotes: each must be found exactly once in its source.
  const quotes: Located[] = [];
  for (const ev of input.evidence) {
    const src = getSource(ev.source_id);
    if (!src) {
      errors.push({ code: "unknown_source", message: `unknown source ${ev.source_id}` });
      continue;
    }
    const loc = locateQuote(src.canonical_text, ev.quote);
    if (!loc.ok) {
      errors.push({ code: loc.code, message: `${loc.message} (source ${ev.source_id.slice(0, 8)})` });
      continue;
    }
    const quote_id = sha256(`${ev.source_id}|${loc.start}|${loc.end}`);
    if (!quotes.some((q) => q.quote_id === quote_id))
      quotes.push({ quote_id, source_id: ev.source_id, start: loc.start, end: loc.end, text: loc.text, occurred_at: src.occurred_at });
  }
  if (errors.length) return { ok: false, errors };

  // 2. Fields.
  const known = new Set(pred.fields.map((f) => f.name));
  for (const k of Object.keys(input.fields))
    if (!known.has(k)) errors.push({ code: "unexpected_field", field: k, message: `${k} is not a field of ${pred.id}` });

  const slots = { subject: {}, value: {}, conditions: {} } as Record<"subject" | "value" | "conditions", Record<string, unknown>>;
  const dates: { valid_from: string | null; valid_to: string | null } = { valid_from: null, valid_to: null };
  const grounding: Record<string, FieldGrounding> = {};

  for (const f of pred.fields) {
    const v = input.fields[f.name];
    if (v === undefined || v === null) {
      if (f.required) errors.push({ code: "missing_field", field: f.name, message: `${f.name} is required` });
      continue;
    }
    const te = typeError(f, v);
    if (te) {
      errors.push({ code: "bad_type", field: f.name, message: `${f.name} ${te}` });
      continue;
    }
    const g = groundField(f, v, quotes, !!opts.entities);
    if ("error" in g) {
      errors.push(g.error);
      continue;
    }
    grounding[f.name] = g.grounding;
    if (f.slot === "valid_from" || f.slot === "valid_to") dates[f.slot] = v as string;
    else slots[f.slot][f.name] = v;
  }
  if (errors.length) return { ok: false, errors };

  // 3. Content-addressed identity: the same claim from the same evidence always has the same id.
  const claim_id = sha256(
    canonicalJson({
      kind: pred.kind,
      predicate_id: pred.id,
      predicate_version: pred.version,
      ...slots,
      ...dates,
      quotes: quotes.map((q) => q.quote_id).sort(),
    }),
  );

  const draft: ClaimDraft = {
    claim_id,
    kind: pred.kind,
    predicate_id: pred.id,
    predicate_version: pred.version,
    ...slots,
    ...dates,
    grounding,
    quotes: quotes.map((q) => ({ quote_id: q.quote_id, source_id: q.source_id, start: q.start, end: q.end, text: q.text })),
  };
  return { ok: true, draft };
}
