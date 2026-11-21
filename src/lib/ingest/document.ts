import { z } from "zod";
import { canonicalJson, sha256 } from "../hash";
import {
  authorField,
  dayOrDatetime,
  issueMessages,
  joinAuthor,
  labelsField,
  languageField,
  normaliseWhen,
  reliabilityField,
  splitFrontMatter,
  token,
} from "./common";
import type { ParseOutcome } from "./types";

/** Parser for the document contract. See docs/DOCUMENT_CONTRACT.md. */

export interface DocumentHeader {
  doc_id: string;
  doc_type: string;
  title: string;
  date: string; // UTC ISO
  date_precision: "day" | "time";
  author: string | null;
  reference: string | null;
  parties: string[];
  version: string | null;
  supersedes: string | null;
  origin: string | null;
  language: string | null;
  labels: string[];
  reliability: "high" | "low" | null;
}

const quoted = (what: string) => ({ error: `must be a string; quote it in the header, e.g. ${what}` });

const HeaderSchema = z
  .object({
    doc_id: token,
    doc_type: z.string().regex(/^[a-z0-9_-]+$/, "must match [a-z0-9_-]+ (e.g. contract, invoice, report)"),
    title: z.string().min(1),
    date: dayOrDatetime,
    author: authorField,
    reference: z.string(quoted('reference: "8841"')).min(1).optional(),
    parties: z.array(z.string().min(1)).min(1).optional(),
    version: z.string(quoted('version: "1.10"')).min(1).optional(),
    supersedes: token.optional(),
    origin: z.string().min(1).optional(),
    language: languageField,
    labels: labelsField,
    reliability: reliabilityField,
  })
  .strict();

export function parseDocumentSource(fileText: string): ParseOutcome {
  const split = splitFrontMatter(fileText);
  if (!split.ok) return split;

  const p = HeaderSchema.safeParse(split.raw);
  if (!p.success) return { ok: false, errors: issueMessages(p.error) };
  if (split.body.trim() === "") return { ok: false, errors: ["body is empty"] };

  const h = p.data;
  const when = normaliseWhen(h.date);
  const header: DocumentHeader = {
    doc_id: h.doc_id,
    doc_type: h.doc_type,
    title: h.title,
    date: when.iso,
    date_precision: when.precision,
    author: joinAuthor(h.author),
    reference: h.reference ?? null,
    parties: h.parties ?? [],
    version: h.version ?? null,
    supersedes: h.supersedes ?? null,
    origin: h.origin ?? null,
    language: h.language ?? null,
    labels: h.labels ?? ["public"],
    reliability: h.reliability ?? null,
  };

  return {
    ok: true,
    parsed: {
      kind: "document",
      external_id: header.doc_id,
      occurred_at: header.date,
      author: header.author,
      recipients: [],
      thread_id: null,
      reply_to: null,
      labels: header.labels,
      meta: {
        title: header.title,
        doc_type: header.doc_type,
        reference: header.reference,
        parties: header.parties,
        version: header.version,
        supersedes: header.supersedes,
        origin: header.origin,
        language: header.language,
        date_precision: header.date_precision,
        reliability: header.reliability,
      },
      body: split.body,
      content_hash: sha256(canonicalJson(header) + "\n" + split.body),
    },
  };
}
