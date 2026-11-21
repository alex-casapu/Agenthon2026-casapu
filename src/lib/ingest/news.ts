import { z } from "zod";
import { canonicalJson, sha256 } from "../hash";
import {
  DATETIME_TZ,
  authorField,
  dayOrDatetime,
  issueMessages,
  joinAuthor,
  labelsField,
  languageField,
  normaliseWhen,
  realDate,
  reliabilityField,
  splitFrontMatter,
  token,
} from "./common";
import type { ParseOutcome } from "./types";

/** Parser for the news article contract. See docs/NEWS_CONTRACT.md. */

export interface NewsHeader {
  article_id: string;
  domain: string;
  date: string; // UTC ISO
  date_precision: "day" | "time";
  title: string;
  url: string | null;
  author: string | null;
  language: string | null;
  retrieved_at: string | null;
  corrects: string | null;
  labels: string[];
  reliability: "high" | "low" | null;
}

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const stripWww = (h: string) => h.replace(/^www\./, "");

const domain = z.string().transform((v, ctx) => {
  const d = stripWww(v.trim().toLowerCase().replace(/\.$/, ""));
  if (!HOST.test(d)) ctx.addIssue({ code: "custom", message: "must be a bare hostname such as example.com (no scheme, path or port)" });
  return d;
});

const HeaderSchema = z
  .object({
    article_id: token,
    domain,
    date: dayOrDatetime,
    title: z.string().min(1),
    url: z.string().optional(),
    author: authorField,
    language: languageField,
    retrieved_at: z.string().regex(DATETIME_TZ, "must be ISO 8601 with a timezone").refine(realDate, "is not a real date").optional(),
    corrects: token.optional(),
    labels: labelsField,
    reliability: reliabilityField,
  })
  .strict()
  .superRefine((h, ctx) => {
    if (h.url === undefined) return;
    let u: URL | null = null;
    try {
      u = new URL(h.url);
    } catch {
      /* handled below */
    }
    if (!u || (u.protocol !== "http:" && u.protocol !== "https:")) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "must be an http(s) URL" });
    } else if (HOST.test(h.domain) && stripWww(u.hostname.toLowerCase()) !== h.domain) {
      ctx.addIssue({ code: "custom", path: ["url"], message: `host ${u.hostname} does not match domain ${h.domain}` });
    }
  });

export function parseNewsSource(fileText: string): ParseOutcome {
  const split = splitFrontMatter(fileText);
  if (!split.ok) return split;

  const p = HeaderSchema.safeParse(split.raw);
  if (!p.success) return { ok: false, errors: issueMessages(p.error) };
  if (split.body.trim() === "") return { ok: false, errors: ["body is empty"] };

  const h = p.data;
  const when = normaliseWhen(h.date);
  const header: NewsHeader = {
    article_id: h.article_id,
    domain: h.domain,
    date: when.iso,
    date_precision: when.precision,
    title: h.title,
    url: h.url ?? null,
    author: joinAuthor(h.author),
    language: h.language ?? null,
    retrieved_at: h.retrieved_at ? new Date(h.retrieved_at).toISOString() : null,
    corrects: h.corrects ?? null,
    labels: h.labels ?? ["public"],
    reliability: h.reliability ?? null,
  };

  return {
    ok: true,
    parsed: {
      kind: "news",
      external_id: header.article_id,
      occurred_at: header.date,
      author: header.author,
      recipients: [],
      thread_id: null,
      reply_to: null,
      labels: header.labels,
      meta: {
        title: header.title,
        domain: header.domain,
        url: header.url,
        language: header.language,
        retrieved_at: header.retrieved_at,
        corrects: header.corrects,
        date_precision: header.date_precision,
        reliability: header.reliability,
      },
      body: split.body,
      content_hash: sha256(canonicalJson(header) + "\n" + split.body),
    },
  };
}
