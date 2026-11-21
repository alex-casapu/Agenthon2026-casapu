import type Database from "better-sqlite3";
import { canonicalJson, sha256 } from "../hash";

export type DB = Database.Database;

export const GENESIS = "0".repeat(64);

/** How to select the row behind a log entry, per table. */
const ROW_SELECT: Record<string, string> = {
  sources: "SELECT * FROM sources WHERE source_id = ?",
  quotes: "SELECT * FROM quotes WHERE quote_id = ?",
  predicates: "SELECT * FROM predicates WHERE predicate_id || ':' || version = ?",
  claims: "SELECT * FROM claims WHERE claim_id = ?",
  claim_evidence: "SELECT * FROM claim_evidence WHERE claim_id || ':' || quote_id = ?",
  claim_events: "SELECT * FROM claim_events WHERE seq = ?",
  ingest_events: "SELECT * FROM ingest_events WHERE seq = ?",
  extraction_runs: "SELECT * FROM extraction_runs WHERE seq = ?",
  principals: "SELECT * FROM principals WHERE principal_id || ':' || version = ?",
  entities: "SELECT * FROM entities WHERE entity_id || ':' || version = ?",
};

/** Hash of the stored row as it currently is. Same function on write and on verify. */
export function rowPayloadHash(db: DB, tbl: string, rowId: string): string | null {
  const sel = ROW_SELECT[tbl];
  if (!sel) return null;
  const row = db.prepare(sel).get(rowId);
  return row ? sha256(canonicalJson(row)) : null;
}

export function chainHash(prev: string, tbl: string, rowId: string, payload: string, createdAt: string): string {
  return sha256([prev, tbl, rowId, payload, createdAt].join("|"));
}

/** Append an entry to the global chain. Call inside the same transaction as the row insert. */
export function appendLog(db: DB, tbl: string, rowId: string, payloadHash: string): void {
  const last = db.prepare("SELECT hash FROM log ORDER BY seq DESC LIMIT 1").get() as { hash: string } | undefined;
  const prev = last?.hash ?? GENESIS;
  const createdAt = new Date().toISOString();
  db.prepare(
    "INSERT INTO log (tbl, row_id, payload_hash, prev_hash, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(tbl, rowId, payloadHash, prev, chainHash(prev, tbl, rowId, payloadHash, createdAt), createdAt);
}

/** Log a row that has just been inserted. */
export function recordRow(db: DB, tbl: string, rowId: string): void {
  const payload = rowPayloadHash(db, tbl, rowId);
  if (!payload) throw new Error(`recordRow: no row ${tbl}/${rowId}`);
  appendLog(db, tbl, rowId, payload);
}
