export type Tier = "literal" | "resolved" | "interpretive";
export type FieldType = "number" | "string" | "date" | "currency" | "quantity_unit" | "entity";
export type Slot = "subject" | "value" | "conditions" | "valid_from" | "valid_to";

export interface FieldDef {
  name: string;
  slot: Slot;
  tier: Tier;
  type: FieldType;
  required: boolean;
}

export interface PredicateDef {
  id: string;
  version: number;
  kind: "structured" | "statement";
  description: string;
  /** single: one value per subject+validity (contradiction-detectable). multi: no alerts. */
  cardinality: "single" | "multi";
  fields: FieldDef[];
}

export interface GateInput {
  predicate_id: string;
  predicate_version?: number;
  fields: Record<string, unknown>;
  evidence: { source_id: string; quote: string }[];
  extractor?: Record<string, unknown>;
}

export interface GateError {
  code:
    | "unknown_predicate"
    | "no_evidence"
    | "unknown_source"
    | "quote_empty"
    | "quote_not_found"
    | "quote_ambiguous"
    | "missing_field"
    | "unexpected_field"
    | "bad_type"
    | "literal_not_in_quote"
    | "resolved_mismatch";
  field?: string;
  message: string;
}

export interface FieldGrounding {
  tier: Tier;
  quote_id?: string;
  resolver?: string;
}

export interface VerifiedQuote {
  quote_id: string;
  source_id: string;
  start: number;
  end: number;
  text: string;
}

export interface ClaimDraft {
  claim_id: string;
  kind: "structured" | "statement";
  predicate_id: string;
  predicate_version: number;
  subject: Record<string, unknown>;
  value: Record<string, unknown>;
  conditions: Record<string, unknown>;
  valid_from: string | null;
  valid_to: string | null;
  grounding: Record<string, FieldGrounding>;
  quotes: VerifiedQuote[];
}

export type GateResult = { ok: true; draft: ClaimDraft } | { ok: false; errors: GateError[] };

export interface SourceView {
  canonical_text: string;
  occurred_at: string;
}
