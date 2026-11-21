import { readdirSync, readFileSync, statSync } from "node:fs";
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
import { parseEmail } from "./email";

export interface FileOutcome {
  path: string;
  result: IngestResult;
  source_id?: string;
  errors?: string[];
}

export function inboxDir(): string {
  return process.env.BRAIN_INBOX ?? join(process.cwd(), "data", "inbox");
}

/** *.md files under root, skipping dotfiles and anything starting with "_". */
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
  walk(root);
  return out.sort();
}

/** Ingest one file. Always appends to the ledger; appends a source only for a new message. */
export function ingestFile(db: DB, root: string, abs: string): FileOutcome {
  const bytes = readFileSync(abs);
  const path = relative(root, abs).split(sep).join("/");
  const file_hash = sha256Bytes(bytes);

  const record = (o: Omit<FileOutcome, "path">): FileOutcome => {
    recordIngestEvent(db, { path, file_hash, result: o.result, source_id: o.source_id, errors: o.errors });
    return { path, ...o };
  };

  const parsed = parseEmail(bytes.toString("utf8"));
  if (!parsed.ok) return record({ result: "invalid", errors: parsed.errors });
  const { header: h, body, content_hash } = parsed.email;

  const existing = findSourcesByExternalId(db, "email", h.message_id);
  const same = existing.find((s) => s.meta.content_hash === content_hash);
  if (same) return record({ result: "duplicate", source_id: same.source_id });
  if (existing.length > 0)
    return record({
      result: "conflict",
      source_id: existing[0].source_id,
      errors: [`message_id ${h.message_id} was already ingested with different content; send a correction as a new email`],
    });

  const parent = h.in_reply_to ? findSourcesByExternalId(db, "email", h.in_reply_to)[0] : undefined;
  const thread_id = h.thread_id ?? (parent ? parent.thread_id ?? h.in_reply_to : h.in_reply_to) ?? h.message_id;

  return db.transaction(() => {
    const { source_id } = insertSource(db, {
      kind: "email",
      external_id: h.message_id,
      thread_id,
      author: h.from.addr,
      recipients: [...h.to, ...h.cc].map((a) => a.addr),
      occurred_at: h.date,
      raw: body,
      acl_labels: h.labels,
      meta: {
        subject: h.subject,
        from_name: h.from.name,
        to: h.to,
        cc: h.cc,
        in_reply_to: h.in_reply_to,
        reliability: h.reliability,
        content_hash,
        file: path,
      },
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
export function scanInbox(db: DB, root: string, opts: { minAgeMs?: number } = {}): ScanResult {
  const outcomes: FileOutcome[] = [];
  let pending = 0;
  for (const abs of listInboxFiles(root)) {
    if (opts.minAgeMs && Date.now() - statSync(abs).mtimeMs < opts.minAgeMs) {
      pending++;
      continue;
    }
    const path = relative(root, abs).split(sep).join("/");
    if (ingestSeen(db, path, sha256Bytes(readFileSync(abs)))) continue;
    outcomes.push(ingestFile(db, root, abs));
  }
  return { outcomes, pending };
}
