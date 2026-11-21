import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { canonicalize } from "../canon";

/** Pieces shared by every Markdown-with-YAML-header source contract. */

const FRONT = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/;

export type Split = { ok: true; raw: Record<string, unknown>; body: string } | { ok: false; errors: string[] };

/**
 * Split a file into its YAML header (as a plain object) and canonical body.
 * Body emptiness and header contents are the caller's business.
 */
export function splitFrontMatter(fileText: string): Split {
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

  return { ok: true, raw: raw as Record<string, unknown>, body: canonicalize(text.slice(m[0].length)) };
}

export const issueMessages = (e: z.ZodError): string[] =>
  e.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message));

export const token = z.string().regex(/^\S+$/, "must not contain whitespace").max(200);

export const labelsField = z
  .array(z.string().regex(/^[a-z0-9_-]+$/, "labels must match [a-z0-9_-]+"))
  .min(1)
  .optional();

export const reliabilityField = z.enum(["high", "low"]).optional();

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const DATETIME_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
export const realDate = (s: string) =>
  !Number.isNaN(Date.parse(s)) && (!DATE_ONLY.test(s) || new Date(s).toISOString().startsWith(s));

/** `YYYY-MM-DD` or ISO 8601 with timezone. */
export const dayOrDatetime = z
  .string()
  .refine((s) => DATE_ONLY.test(s) || DATETIME_TZ.test(s), "must be YYYY-MM-DD or ISO 8601 with a timezone, e.g. 2026-11-21T08:00:00+01:00")
  .refine(realDate, "is not a real date");

/** Normalise a day-or-datetime to UTC ISO, flagging day precision. */
export function normaliseWhen(s: string): { iso: string; precision: "day" | "time" } {
  return DATE_ONLY.test(s) ? { iso: `${s}T00:00:00.000Z`, precision: "day" } : { iso: new Date(s).toISOString(), precision: "time" };
}

export const authorField = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]).optional();
export const joinAuthor = (a: string | string[] | undefined): string | null => (a === undefined ? null : Array.isArray(a) ? a.join(", ") : a);

export const languageField = z
  .string()
  .regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/, "must be a BCP 47 tag such as it or en-GB")
  .optional();
