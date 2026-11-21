/** What every source-kind parser produces: one immutable source, ready to insert. */
export interface ParsedSource {
  kind: string;
  /** Identity within its kind (message_id, article_id, …). */
  external_id: string;
  /** UTC ISO. When the thing was sent/published, not when we learned of it. */
  occurred_at: string;
  author: string | null;
  recipients: string[];
  thread_id: string | null;
  /** external_id of the item this one replies to, if any (used to resolve threads). */
  reply_to: string | null;
  labels: string[];
  /** Kind-specific metadata. content_hash and file are added at ingest. */
  meta: Record<string, unknown>;
  /** Canonical body: the citable text. */
  body: string;
  content_hash: string;
}

export type ParseOutcome = { ok: true; parsed: ParsedSource } | { ok: false; errors: string[] };
