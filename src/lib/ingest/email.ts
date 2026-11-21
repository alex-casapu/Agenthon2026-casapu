import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { canonicalize } from "../canon";
import { canonicalJson, sha256 } from "../hash";

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

const token = z.string().regex(/^\S+$/, "must not contain whitespace").max(200);

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

const HeaderSchema = z
  .object({
    message_id: token,
    date: z
      .string()
      .regex(DATE_RE, "must be ISO 8601 with a timezone, e.g. 2026-10-12T09:15:00+02:00")
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
    labels: z.array(z.string().regex(/^[a-z0-9_-]+$/, "labels must match [a-z0-9_-]+")).min(1).optional(),
    reliability: z.enum(["high", "low"]).optional(),
  })
  .strict();

const FRONT = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

export function parseEmail(fileText: string): ParseResult {
  const text = fileText.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const m = FRONT.exec(text);
  if (!m) return { ok: false, errors: ["file must start with a --- YAML header closed by a --- line"] };

  let raw: unknown;
  try {
    raw = parseYaml(m[1]);
  } catch (e) {
    return { ok: false, errors: [`header is not valid YAML: ${(e as Error).message.split("\n")[0]}`] };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, errors: ["header must be a YAML mapping of keys to values"] };

  const parsed = HeaderSchema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, errors: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)) };

  const body = canonicalize(text.slice(m[0].length));
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
