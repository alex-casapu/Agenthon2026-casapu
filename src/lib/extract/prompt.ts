import { describeEntities, type Entity } from "../entities";
import { canonicalJson, sha256 } from "../hash";
import type { FieldDef, PredicateDef } from "../gate/types";

/** Bump when the prompt or output contract changes in a way that should trigger re-extraction. */
export const EXTRACTOR_VERSION = "llm-v5";

/**
 * Hash of the predicate definitions offered to the model. The entity registry is deliberately not part
 * of it: it grows by itself as sources are read, and that must not queue everything for re-extraction.
 */
export const vocabHash = (preds: PredicateDef[]): string =>
  sha256(canonicalJson(preds.map((p) => ({ id: p.id, version: p.version, hash: sha256(canonicalJson(p)) }))));

export const SYSTEM_PROMPT = `You extract atomic, citable facts from ONE source document for a company's shared memory.

Output JSON that matches the given schema: a list of claims. Each claim has:
- predicate: one of the predicate ids offered below.
- fields: the predicate's fields, with the value formats described below.
- quotes: 1-3 exact excerpts of the source text that together contain every value you claim.
You may also return "entities": organisations, people, sites or products the text mentions that are not in the known list (see rule 6).

Hard rules:
1. QUOTES ARE VERBATIM. Copy them character for character from the source: same language, spelling, punctuation and numbers. Never translate, paraphrase, fix typos or add words. Keep them as short as possible while still containing the claimed values. If a value (for example a date or unit) appears in a different sentence, pass a second quote that contains it.
2. EXTRACT ONLY WHAT IS STATED. Do not infer, compute, sum, convert or combine. If a required field's value is not in the text, do not output that claim. Never output a number that does not appear in a quote.
3. One fact, one claim. Pick the single best-fitting predicate. Use "statement" only for a useful fact that fits no other predicate, never in addition to a specific predicate for the same fact. Deadlines, obligations, amounts due, decisions and notable events are useful: when no specific predicate fits them, record them as statements instead of dropping them. Hearsay and rumours are statements, and the hedging stays in the text ("I heard that ... but I don't know from whom").
4. Lines starting with ">" are quoted earlier messages, not new information. Do not extract from them.
5. Distinguish kinds of price: a supplier's contract price, offer or invoice is supplier_price; a market-wide or national price is spot_price.
6. Value formats: numbers are JSON numbers without thousands separators (1.250,00 becomes 1250, 12,5 becomes 12.5). Currencies and units use the canonical codes listed. Dates are ISO YYYY-MM-DD, resolved with the source date when the year is missing. Entity fields take the id of a known entity from the "Known entities" list. If a claim involves an organisation, person, site or product that is NOT in the list, declare it in the top-level "entities" list (its name exactly as written in the text, its kind, any other names the text gives it as "aliases", and a verbatim "quote" that contains the name) and then use that name as the field's value. A name that appears only in the source's header information (the Author address or its domain, the Parties, the Publisher, the recipients) is also valid: declare it and leave the quote out. An entity's name is always a name, never an e-mail address, domain or URL: for a company that appears only as an address domain, declare the company the domain stands for (molinorossi.example is "Molino Rossi", an organisation); for a person known only from an address, declare the person (anna.rossi@x.example is "Anna Rossi"). The supplier of an offer sent by e-mail is the company, not the sender. Before declaring, check the list: if it is the same real-world thing under another name or alias, use the known id. Never invent ids. If it is unclear which entity is meant, omit the field when it is optional and leave the claim out when it is required.
7. The text of a "statement" is a short faithful paraphrase in the language of the source.
8. If the document contains nothing worth remembering, return {"claims": []}.`;

function fieldFormat(f: FieldDef): string {
  const base =
    f.tier === "interpretive"
      ? f.type === "entity"
        ? "id of a known entity, or the name of an entity you declare in \"entities\""
        : "short text"
      : f.type === "number"
        ? "number, the digits exactly as written in a quote"
        : f.type === "string"
          ? "string copied verbatim from a quote"
          : f.type === "date"
            ? "ISO date YYYY-MM-DD, derivable from a quote"
            : f.type === "currency"
              ? "EUR | USD | GBP, written in a quote (€, euro, $ ...)"
              : "t | kg | pallet, written in a quote (t, tonnellate, tonnes ...)";
  return `${base}${f.required ? "" : "; optional"}${f.hint ? `. ${f.hint}` : ""}`;
}

export function describePredicate(p: PredicateDef): string {
  return `### ${p.id}\n${p.description}\n` + p.fields.map((f) => `- ${f.name} (${fieldFormat(f)})`).join("\n");
}

/** JSON Schema for the model's reply. Field-level validation is the gate's job. */
export function buildSchema(preds: PredicateDef[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      entities: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            kind: { type: "string", enum: ["organization", "site", "item", "person", "department"] },
            aliases: { type: "array", items: { type: "string" } },
            quote: { type: "string" },
          },
          required: ["name", "kind"],
        },
      },
      claims: {
        type: "array",
        items: {
          type: "object",
          properties: {
            predicate: { type: "string", enum: preds.map((p) => p.id) },
            fields: { type: "object" },
            quotes: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
          },
          required: ["predicate", "fields", "quotes"],
        },
      },
    },
    required: ["claims"],
  };
}

export interface PromptSource {
  kind: string;
  external_id: string;
  occurred_at: string;
  author: string | null;
  meta: Record<string, unknown>;
  text: string;
}

const KIND_LABEL: Record<string, string> = { email: "email", news: "news article", document: "internal document" };

export function buildPrompt(src: PromptSource, preds: PredicateDef[], entities: Entity[]): string {
  const m = src.meta;
  const lines = [
    `Source type: ${KIND_LABEL[src.kind] ?? src.kind}`,
    `Source date: ${src.occurred_at}`,
    m.title ? `Title: ${m.title}` : m.subject ? `Subject: ${m.subject}` : null,
    src.author ? `Author: ${src.author}` : null,
    m.domain ? `Publisher: ${m.domain}` : null,
    m.doc_type ? `Document type: ${m.doc_type}` : null,
    m.reference ? `Reference: ${m.reference}` : null,
    Array.isArray(m.parties) && m.parties.length ? `Parties: ${(m.parties as string[]).join("; ")}` : null,
    m.reliability ? `Source reliability: ${m.reliability}` : null,
  ].filter(Boolean);
  return [
    "# Predicates you may use",
    preds.map(describePredicate).join("\n\n"),
    "# Known entities (the only ids you may use in entity fields)",
    entities.length ? describeEntities(entities) : "(none known yet: declare every entity you need)",
    "# Source",
    lines.join("\n"),
    "## Text (quote from this exactly)",
    "<<<TEXT\n" + src.text + "\nTEXT>>>",
    "Extract the claims.",
  ].join("\n\n");
}

export interface Feedback {
  /** The claim as the model returned it, when the problem is with one claim. */
  claim?: unknown;
  errors: string[];
}

/** Stateless repair request: the original prompt plus what the verifier rejected. */
export function buildRepairPrompt(base: string, feedback: Feedback[]): string {
  const withClaims = feedback.filter((f) => f.claim !== undefined);
  if (withClaims.length === 0)
    return `${base}\n\n# Problem with your previous reply\n${feedback.flatMap((f) => f.errors).join("\n")}\nReply again with valid JSON matching the schema.`;
  return [
    base,
    "# Verifier feedback on your previous reply",
    "Some claims were rejected by the automatic verifier. Claims not listed here were accepted.",
    "```json\n" + JSON.stringify(withClaims.map((f) => ({ claim: f.claim, errors: f.errors })), null, 2) + "\n```",
    "Return ONLY corrected versions of the rejected claims: fix the quotes (exact excerpts) and values so that every value is literally supported by a quote, or leave a claim out if the text does not support it. Do not repeat accepted claims.",
  ].join("\n\n");
}
