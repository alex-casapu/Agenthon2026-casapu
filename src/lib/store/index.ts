import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { CANON_VERSION, canonicalize, cpSlice } from "../canon";
import { checkClaim, type GateError, type GateInput, type SourceView } from "../gate";
import { canonicalJson, sha256 } from "../hash";
import { PREDICATES, getPredicate } from "../predicates";
import { chainHash, GENESIS, recordRow, rowPayloadHash, type DB } from "./log";
import { migrate } from "./migrate";

export type { DB } from "./log";

// ---------------------------------------------------------------- open

export function openDb(path: string, migrationsDir = join(process.cwd(), "migrations")): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db, migrationsDir);
  ensurePredicates(db);
  return db;
}

/** Process-wide singleton (survives Next.js dev hot reloads). */
export function getDb(): DB {
  const g = globalThis as unknown as { __brainDb?: DB };
  g.__brainDb ??= openDb(process.env.BRAIN_DB ?? join(process.cwd(), "data", "brain.db"));
  return g.__brainDb;
}

// ---------------------------------------------------------------- predicates

function ensurePredicates(db: DB): void {
  for (const def of PREDICATES) {
    const hash = sha256(canonicalJson(def));
    const row = db
      .prepare("SELECT definition_hash FROM predicates WHERE predicate_id = ? AND version = ?")
      .get(def.id, def.version) as { definition_hash: string } | undefined;
    if (row) {
      if (row.definition_hash !== hash)
        throw new Error(`Predicate ${def.id} v${def.version} changed without a version bump`);
      continue;
    }
    db.transaction(() => {
      db.prepare(
        "INSERT INTO predicates (predicate_id, version, definition, definition_hash, created_at) VALUES (?, ?, ?, ?, ?)",
      ).run(def.id, def.version, canonicalJson(def), hash, new Date().toISOString());
      recordRow(db, "predicates", `${def.id}:${def.version}`);
    })();
  }
}

// ---------------------------------------------------------------- sources

export interface SourceInput {
  kind: string;
  external_id: string;
  thread_id?: string | null;
  author?: string | null;
  recipients?: string[];
  occurred_at: string;
  raw: string;
  acl_labels?: string[];
  meta?: Record<string, unknown>;
  origin_source_id?: string | null;
}

export function insertSource(db: DB, input: SourceInput): { source_id: string; created: boolean } {
  if (Number.isNaN(Date.parse(input.occurred_at))) throw new Error("occurred_at must be an ISO timestamp");
  const canonical = canonicalize(input.raw);
  const source_id = sha256([CANON_VERSION, input.kind, input.external_id, canonical].join("\n"));
  if (db.prepare("SELECT 1 FROM sources WHERE source_id = ?").get(source_id)) return { source_id, created: false };

  db.transaction(() => {
    db.prepare(
      `INSERT INTO sources (source_id, kind, external_id, thread_id, author, recipients, occurred_at, ingested_at,
                            raw, canonical_text, canon_version, acl_labels, meta, origin_source_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      source_id,
      input.kind,
      input.external_id,
      input.thread_id ?? null,
      input.author ?? null,
      canonicalJson(input.recipients ?? []),
      input.occurred_at,
      new Date().toISOString(),
      input.raw,
      canonical,
      CANON_VERSION,
      canonicalJson(input.acl_labels ?? []),
      canonicalJson(input.meta ?? {}),
      input.origin_source_id ?? null,
    );
    recordRow(db, "sources", source_id);
  })();
  return { source_id, created: true };
}

function sourceView(db: DB, id: string): SourceView | undefined {
  return db.prepare("SELECT canonical_text, occurred_at FROM sources WHERE source_id = ?").get(id) as
    | SourceView
    | undefined;
}

// ---------------------------------------------------------------- ingest ledger

export type IngestResult = "ingested" | "duplicate" | "conflict" | "invalid";

export function recordIngestEvent(
  db: DB,
  e: { path: string; file_hash: string; result: IngestResult; source_id?: string | null; errors?: string[] },
): void {
  const info = db
    .prepare("INSERT INTO ingest_events (path, file_hash, result, source_id, error, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(e.path, e.file_hash, e.result, e.source_id ?? null, e.errors?.length ? canonicalJson(e.errors) : null, new Date().toISOString());
  recordRow(db, "ingest_events", String(info.lastInsertRowid));
}

export function ingestSeen(db: DB, path: string, fileHash: string): boolean {
  return !!db.prepare("SELECT 1 FROM ingest_events WHERE path = ? AND file_hash = ?").get(path, fileHash);
}

export function findSourcesByExternalId(db: DB, kind: string, externalId: string) {
  return (db.prepare("SELECT source_id, thread_id, meta FROM sources WHERE kind = ? AND external_id = ?").all(kind, externalId) as {
    source_id: string;
    thread_id: string | null;
    meta: string;
  }[]).map((r) => ({ ...r, meta: JSON.parse(r.meta) as Record<string, unknown> }));
}

// ---------------------------------------------------------------- claims

export type SubmitResult =
  | { ok: true; claim_id: string; duplicate: boolean }
  | { ok: false; errors: GateError[] };

/** Gate, then persist quotes + claim + evidence + 'proposed' event atomically. */
export function submitClaim(db: DB, input: GateInput, actor = "human:manual"): SubmitResult {
  const res = checkClaim(input, (id) => sourceView(db, id));
  if (!res.ok) return res;
  const d = res.draft;

  if (db.prepare("SELECT 1 FROM claims WHERE claim_id = ?").get(d.claim_id))
    return { ok: true, claim_id: d.claim_id, duplicate: true };

  db.transaction(() => {
    for (const q of d.quotes) {
      if (db.prepare("SELECT 1 FROM quotes WHERE quote_id = ?").get(q.quote_id)) continue;
      db.prepare('INSERT INTO quotes (quote_id, source_id, start, "end", text) VALUES (?, ?, ?, ?, ?)').run(
        q.quote_id,
        q.source_id,
        q.start,
        q.end,
        q.text,
      );
      recordRow(db, "quotes", q.quote_id);
    }
    db.prepare(
      `INSERT INTO claims (claim_id, kind, predicate_id, predicate_version, subject, value, conditions,
                           valid_from, valid_to, grounding, extractor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      d.claim_id,
      d.kind,
      d.predicate_id,
      d.predicate_version,
      canonicalJson(d.subject),
      canonicalJson(d.value),
      canonicalJson(d.conditions),
      d.valid_from,
      d.valid_to,
      canonicalJson(d.grounding),
      canonicalJson(input.extractor ?? { type: "manual" }),
      new Date().toISOString(),
    );
    recordRow(db, "claims", d.claim_id);
    for (const q of d.quotes) {
      db.prepare("INSERT INTO claim_evidence (claim_id, quote_id) VALUES (?, ?)").run(d.claim_id, q.quote_id);
      recordRow(db, "claim_evidence", `${d.claim_id}:${q.quote_id}`);
    }
    insertEvent(db, d.claim_id, "proposed", actor);
  })();
  return { ok: true, claim_id: d.claim_id, duplicate: false };
}

type EventType = "proposed" | "approved" | "rejected" | "superseded" | "retracted";

function insertEvent(db: DB, claimId: string, type: EventType, actor: string, reason?: string): void {
  const info = db
    .prepare("INSERT INTO claim_events (claim_id, type, actor, reason, policy_version, created_at) VALUES (?, ?, ?, ?, 0, ?)")
    .run(claimId, type, actor, reason ?? null, new Date().toISOString());
  recordRow(db, "claim_events", String(info.lastInsertRowid));
}

const TRANSITIONS: Record<string, EventType[]> = {
  proposed: ["approved", "rejected"],
  approved: ["retracted", "superseded"],
  rejected: [],
  retracted: [],
  superseded: [],
};

export function reviewClaim(
  db: DB,
  claimId: string,
  type: Exclude<EventType, "proposed">,
  actor: string,
  reason?: string,
): { ok: true } | { ok: false; error: string } {
  const row = db.prepare("SELECT status FROM claim_status WHERE claim_id = ?").get(claimId) as
    | { status: string }
    | undefined;
  if (!row) return { ok: false, error: "unknown claim" };
  if (!TRANSITIONS[row.status]?.includes(type))
    return { ok: false, error: `cannot go from ${row.status} to ${type}` };
  db.transaction(() => insertEvent(db, claimId, type, actor, reason))();
  return { ok: true };
}

// ---------------------------------------------------------------- reads

export function listSources(db: DB) {
  return db
    .prepare(
      "SELECT source_id, kind, external_id, author, occurred_at, canonical_text AS text FROM sources ORDER BY occurred_at, rowid",
    )
    .all() as {
    source_id: string;
    kind: string;
    external_id: string;
    author: string | null;
    occurred_at: string;
    text: string;
  }[];
}

export function listClaims(db: DB) {
  const rows = db
    .prepare(
      `SELECT c.*, s.status FROM claims c JOIN claim_status s USING (claim_id) ORDER BY c.rowid DESC`,
    )
    .all() as Record<string, string | number | null>[];
  const ev = db.prepare(
    `SELECT q.quote_id, q.source_id, q.start, q."end", q.text, s.external_id, s.author
     FROM claim_evidence e JOIN quotes q USING (quote_id) JOIN sources s ON s.source_id = q.source_id
     WHERE e.claim_id = ?`,
  );
  return rows.map((r) => ({
    claim_id: r.claim_id as string,
    kind: r.kind as string,
    predicate_id: r.predicate_id as string,
    predicate_version: r.predicate_version as number,
    status: r.status as string,
    subject: JSON.parse(r.subject as string),
    value: JSON.parse(r.value as string),
    conditions: JSON.parse(r.conditions as string),
    valid_from: r.valid_from as string | null,
    valid_to: r.valid_to as string | null,
    grounding: JSON.parse(r.grounding as string) as Record<string, { tier: string; quote_id?: string; resolver?: string }>,
    evidence: ev.all(r.claim_id) as {
      quote_id: string;
      source_id: string;
      start: number;
      end: number;
      text: string;
      external_id: string;
      author: string | null;
    }[],
  }));
}

// ---------------------------------------------------------------- verify

export interface VerifyReport {
  ok: boolean;
  entries: number;
  problems: string[];
}

/**
 * Independent audit of the whole DB: re-walks the hash chain, re-derives every
 * row payload, re-slices every quote from its source, and re-runs the gate on
 * every stored claim. Does not trust triggers.
 */
export function verify(db: DB): VerifyReport {
  const problems: string[] = [];

  // 1. Chain + payloads
  const log = db.prepare("SELECT * FROM log ORDER BY seq").all() as {
    seq: number; tbl: string; row_id: string; payload_hash: string; prev_hash: string; hash: string; created_at: string;
  }[];
  let prev = GENESIS;
  const perTable = new Map<string, number>();
  for (const e of log) {
    if (e.prev_hash !== prev) problems.push(`log #${e.seq}: prev_hash does not link to the previous entry`);
    if (chainHash(e.prev_hash, e.tbl, e.row_id, e.payload_hash, e.created_at) !== e.hash)
      problems.push(`log #${e.seq}: entry hash mismatch`);
    prev = e.hash;
    perTable.set(e.tbl, (perTable.get(e.tbl) ?? 0) + 1);

    if (e.tbl === "schema_migrations") {
      const m = db.prepare("SELECT checksum FROM schema_migrations WHERE version = ?").get(e.row_id) as
        | { checksum: string }
        | undefined;
      if (!m || m.checksum !== e.payload_hash) problems.push(`log #${e.seq}: migration ${e.row_id} does not match`);
    } else {
      const now = rowPayloadHash(db, e.tbl, e.row_id);
      if (now === null) problems.push(`log #${e.seq}: row ${e.tbl}/${e.row_id} is missing`);
      else if (now !== e.payload_hash) problems.push(`log #${e.seq}: row ${e.tbl}/${e.row_id} was altered`);
    }
  }
  for (const tbl of ["sources", "quotes", "predicates", "claims", "claim_evidence", "claim_events", "ingest_events", "schema_migrations"]) {
    const n = (db.prepare(`SELECT COUNT(*) AS n FROM ${tbl}`).get() as { n: number }).n;
    if (n !== (perTable.get(tbl) ?? 0)) problems.push(`${tbl}: ${n} rows but ${perTable.get(tbl) ?? 0} log entries`);
  }

  // 2. Sources are canonical, quotes are verbatim
  for (const s of db.prepare("SELECT * FROM sources").all() as {
    source_id: string; kind: string; external_id: string; raw: string; canonical_text: string;
  }[]) {
    if (canonicalize(s.raw) !== s.canonical_text) problems.push(`source ${s.source_id.slice(0, 8)}: canonical_text != canonicalize(raw)`);
    if (sha256([CANON_VERSION, s.kind, s.external_id, s.canonical_text].join("\n")) !== s.source_id)
      problems.push(`source ${s.source_id.slice(0, 8)}: id does not match content`);
  }
  for (const q of db
    .prepare('SELECT q.quote_id, q.start, q."end", q.text, s.canonical_text FROM quotes q JOIN sources s USING (source_id)')
    .all() as { quote_id: string; start: number; end: number; text: string; canonical_text: string }[]) {
    if (cpSlice(q.canonical_text, q.start, q.end) !== q.text) problems.push(`quote ${q.quote_id.slice(0, 8)}: not a verbatim slice`);
  }

  // 3. Re-run the gate on every claim
  const claims = db.prepare("SELECT * FROM claims").all() as Record<string, string | number | null>[];
  const evQuery = db.prepare(
    "SELECT q.source_id, q.text FROM claim_evidence e JOIN quotes q USING (quote_id) WHERE e.claim_id = ?",
  );
  for (const c of claims) {
    const pred = getPredicate(c.predicate_id as string, c.predicate_version as number);
    if (!pred) { problems.push(`claim ${(c.claim_id as string).slice(0, 8)}: unknown predicate`); continue; }
    const slots: Record<string, Record<string, unknown>> = {
      subject: JSON.parse(c.subject as string),
      value: JSON.parse(c.value as string),
      conditions: JSON.parse(c.conditions as string),
    };
    const fields: Record<string, unknown> = {};
    for (const f of pred.fields) {
      const v = f.slot === "valid_from" || f.slot === "valid_to" ? c[f.slot] : slots[f.slot][f.name];
      if (v !== null && v !== undefined) fields[f.name] = v;
    }
    const evidence = (evQuery.all(c.claim_id) as { source_id: string; text: string }[]).map((e) => ({
      source_id: e.source_id,
      quote: e.text,
    }));
    const res = checkClaim({ predicate_id: pred.id, predicate_version: pred.version, fields, evidence }, (id) => sourceView(db, id));
    const short = (c.claim_id as string).slice(0, 8);
    if (!res.ok) problems.push(`claim ${short}: fails the gate (${res.errors.map((e) => e.message).join("; ")})`);
    else if (res.draft.claim_id !== c.claim_id) problems.push(`claim ${short}: id does not match content`);
  }

  return { ok: problems.length === 0, entries: log.length, problems };
}
