import { canonicalJson } from "../hash";
import { recordRow, type DB } from "../store/log";

export interface RunRecord {
  source_id: string;
  extractor: string;
  vocab_hash: string;
  model: string;
  prompt_hash: string;
  status: "done" | "failed";
  rounds: number;
  proposed: number;
  duplicates: number;
  rejected: number;
  detail: unknown;
  error?: string | null;
  cost_usd?: number | null;
  duration_ms?: number | null;
}

export function recordExtractionRun(db: DB, r: RunRecord): number {
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO extraction_runs (source_id, extractor, vocab_hash, model, prompt_hash, status, rounds, proposed, duplicates, rejected,
                                      detail, error, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(r.source_id, r.extractor, r.vocab_hash, r.model, r.prompt_hash, r.status, r.rounds, r.proposed, r.duplicates, r.rejected,
        canonicalJson(r.detail), r.error ?? null, r.cost_usd ?? null, r.duration_ms ?? null, new Date().toISOString());
    recordRow(db, "extraction_runs", String(info.lastInsertRowid));
    return Number(info.lastInsertRowid);
  })();
}

export function hasDoneRun(db: DB, sourceId: string, extractor: string, vocabHash: string): boolean {
  return !!db
    .prepare("SELECT 1 FROM extraction_runs WHERE source_id = ? AND extractor = ? AND vocab_hash = ? AND status = 'done'")
    .get(sourceId, extractor, vocabHash);
}

/** Sources with no completed run for this extractor + vocabulary, oldest first. */
export function pendingSources(db: DB, extractor: string, vocabHash: string): string[] {
  return (
    db
      .prepare(
        `SELECT s.source_id FROM sources s
         WHERE NOT EXISTS (SELECT 1 FROM extraction_runs r
                           WHERE r.source_id = s.source_id AND r.extractor = ? AND r.vocab_hash = ? AND r.status = 'done')
         ORDER BY s.rowid`,
      )
      .all(extractor, vocabHash) as { source_id: string }[]
  ).map((r) => r.source_id);
}
