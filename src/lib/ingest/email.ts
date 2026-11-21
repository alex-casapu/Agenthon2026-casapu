import { z } from "zod";
import { canonicalJson, sha256 } from "../hash";
import { DATETIME_TZ, issueMessages, labelsField, reliabilityField, splitFrontMatter, token } from "./common";
import type { ParseOutcome } from "./types";

/** Parser for the email source contract. See docs/EMAIL_CONTRACT.md. */

export interface Address {
  name: string | null;
  addr: string;
}

export interface EmailHeader {
  message_id: string;
  date: string; // UTC ISO
  from: Address;
  to: Address[];
  cc: Address[];
  subject: string;
  thread_id: string | null;
  in_reply_to: string | null;
  labels: string[];
  reliability: "high" | "low" | null;
}

export interface ParsedEmail {
  header: EmailHeader;
  /** Canonical body text: the citable text. */
  body: string;
  content_hash: string;
}

export type ParseResult = { ok: true; email: ParsedEmail } | { ok: false; errors: string[] };

const NAMED = /^(.*?)\s*<([^<>\s,]+@[^<>\s,]+)>$/;
const BARE = /^([^<>\s,]+@[^<>\s,]+)$/;

function parseAddress(s: string): Address | null {
  const t = s.trim();
  const n = NAMED.exec(t);
  if (n) return { name: n[1].replace(/^"(.*)"$/, "$1").trim() || null, addr: n[2].toLowerCase() };
  const b = BARE.exec(t);
  return b ? { name: null, addr: b[1].toLowerCase() } : null;
}

const addressList = (field: string) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((v, ctx) => {
      const parts = (Array.isArray(v) ? v : v.split(",")).map((p) => p.trim()).filter(Boolean);
      const out: Address[] = [];
      for (const p of parts) {
        const a = parseAddress(p);
        if (!a) ctx.addIssue({ code: "custom", message: `${field}: "${p}" is not an address` });
        else out.push(a);
      }
      return out;
    });

const HeaderSchema = z
  .object({
    message_id: token,
    date: z
      .string()
      .regex(DATETIME_TZ, "must be ISO 8601 with a timezone, e.g. 2026-10-12T09:15:00+02:00")
      .refine((s) => !Number.isNaN(Date.parse(s)), "is not a real date"),
    from: z.string().transform((v, ctx) => {
      const a = v.includes(",") && !/<[^>]*,[^>]*>/.test(v) ? null : parseAddress(v);
      if (!a) ctx.addIssue({ code: "custom", message: "must be exactly one address: Name <addr> or addr" });
      return a as Address;
    }),
    to: addressList("to").refine((l) => l.length > 0, "needs at least one recipient"),
    cc: addressList("cc").optional(),
    subject: z.string().min(1),
    thread_id: token.optional(),
    in_reply_to: token.optional(),
    labels: labelsField,
    reliability: reliabilityField,
  })
  .strict();

export function parseEmail(fileText: string): ParseResult {
  const split = splitFrontMatter(fileText);
  if (!split.ok) return split;

  const parsed = HeaderSchema.safeParse(split.raw);
  if (!parsed.success) return { ok: false, errors: issueMessages(parsed.error) };

  const body = split.body;
  if (body.trim() === "") return { ok: false, errors: ["body is empty"] };

  const h = parsed.data;
  const header: EmailHeader = {
    message_id: h.message_id,
    date: new Date(h.date).toISOString(),
    from: h.from,
    to: h.to,
    cc: h.cc ?? [],
    subject: h.subject,
    thread_id: h.thread_id ?? null,
    in_reply_to: h.in_reply_to ?? null,
    labels: h.labels ?? ["public"],
    reliability: h.reliability ?? null,
  };
  return { ok: true, email: { header, body, content_hash: sha256(canonicalJson(header) + "\n" + body) } };
}

/** Email parser in the common shape used by the ingest layer. */
export function parseEmailSource(fileText: string): ParseOutcome {
  const r = parseEmail(fileText);
  if (!r.ok) return r;
  const { header: h, body, content_hash } = r.email;
  return {
    ok: true,
    parsed: {
      kind: "email",
      external_id: h.message_id,
      occurred_at: h.date,
      author: h.from.addr,
      recipients: [...h.to, ...h.cc].map((a) => a.addr),
      thread_id: h.thread_id,
      reply_to: h.in_reply_to,
      labels: h.labels,
      meta: {
        subject: h.subject,
        from_name: h.from.name,
        to: h.to,
        cc: h.cc,
        in_reply_to: h.in_reply_to,
        reliability: h.reliability,
      },
      body,
      content_hash,
    },
  };
}
