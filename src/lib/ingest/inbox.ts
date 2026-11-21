import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { sha256Bytes } from "../hash";
import {
  findSourcesByExternalId,
  ingestSeen,
  insertSource,
  recordIngestEvent,
  type DB,
  type IngestResult,
} from "../store";
import { parseDocumentSource } from "./document";
import { parseEmailSource } from "./email";
import { parseNewsSource } from "./news";
import type { ParseOutcome } from "./types";

/** Every source kind: where its files live and how they are parsed. Add a kind = add an entry. */
export const KINDS = {
  email: { dir: () => process.env.BRAIN_INBOX ?? join(process.cwd(), "data", "inbox"), parse: parseEmailSource },
  news: { dir: () => process.env.BRAIN_NEWS ?? join(process.cwd(), "data", "news"), parse: parseNewsSource },
  document: { dir: () => process.env.BRAIN_DOCS ?? join(process.cwd(), "data", "docs"), parse: parseDocumentSource },
} satisfies Record<string, { dir: () => string; parse: (text: string) => ParseOutcome }>;

export type SourceKind = keyof typeof KINDS;
export const SOURCE_KINDS = Object.keys(KINDS) as SourceKind[];

export interface FileOutcome {
  kind: SourceKind;
  path: string;
  result: IngestResult;
  source_id?: string;
  errors?: string[];
}

/** The email inbox folder. */
export function inboxDir(): string {
  return KINDS.email.dir();
}

/** *.md files under root (none if it does not exist yet), skipping dotfiles and anything starting with "_". */
export function listInboxFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name.startsWith("_")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(p);
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort();
}

/** Ingest one file. Always appends to the ledger; appends a source only for a new item. */
export function ingestFile(db: DB, root: string, abs: string, kind: SourceKind = "email"): FileOutcome {
  const bytes = readFileSync(abs);
  const path = relative(root, abs).split(sep).join("/");
  const file_hash = sha256Bytes(bytes);

  const record = (o: Omit<FileOutcome, "path" | "kind">): FileOutcome => {
    recordIngestEvent(db, { kind, path, file_hash, result: o.result, source_id: o.source_id, errors: o.errors });
    return { kind, path, ...o };
  };

  const r = KINDS[kind].parse(bytes.toString("utf8"));
  if (!r.ok) return record({ result: "invalid", errors: r.errors });
  const p = r.parsed;

  const existing = findSourcesByExternalId(db, kind, p.external_id);
  const same = existing.find((s) => s.meta.content_hash === p.content_hash);
  if (same) return record({ result: "duplicate", source_id: same.source_id });
  if (existing.length > 0)
    return record({
      result: "conflict",
      source_id: existing[0].source_id,
      errors: [`${kind} ${p.external_id} was already ingested with different content; send a correction as a new item`],
    });

  const parent = p.reply_to ? findSourcesByExternalId(db, kind, p.reply_to)[0] : undefined;
  const thread_id = p.thread_id ?? (parent ? parent.thread_id ?? p.reply_to : p.reply_to) ?? (kind === "email" ? p.external_id : null);

  return db.transaction(() => {
    const { source_id } = insertSource(db, {
      kind,
      external_id: p.external_id,
      thread_id,
      author: p.author,
      recipients: p.recipients,
      occurred_at: p.occurred_at,
      raw: p.body,
      acl_labels: p.labels,
      meta: { ...p.meta, content_hash: p.content_hash, file: path },
    });
    return record({ result: "ingested", source_id });
  })();
}

export interface ScanResult {
  outcomes: FileOutcome[];
  /** Files skipped because they changed too recently (possibly mid-write). */
  pending: number;
}

/** Ingest every file not yet seen with its current content. Safe to call any time. */
export function scanInbox(db: DB, root: string, opts: { minAgeMs?: number; kind?: SourceKind } = {}): ScanResult {
  const kind = opts.kind ?? "email";
  const outcomes: FileOutcome[] = [];
  let pending = 0;
  for (const abs of listInboxFiles(root)) {
    if (opts.minAgeMs && Date.now() - statSync(abs).mtimeMs < opts.minAgeMs) {
      pending++;
      continue;
    }
    const path = relative(root, abs).split(sep).join("/");
    if (ingestSeen(db, kind, path, sha256Bytes(readFileSync(abs)))) continue;
    outcomes.push(ingestFile(db, root, abs, kind));
  }
  return { outcomes, pending };
}
