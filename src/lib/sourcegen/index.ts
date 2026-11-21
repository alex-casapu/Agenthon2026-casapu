import { existsSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../hash";
import { KINDS, SOURCE_KINDS, type SourceKind } from "../ingest/inbox";
import type { Llm } from "../llm";

/**
 * Generating a new source from a short prompt. The model fills in a flat description (who, when,
 * what it says); CODE writes the file, so the header always follows the contract, and the real
 * parser then checks it. Nothing is written until a person accepts the preview.
 */

export interface DraftItem {
  kind: SourceKind;
  /** ISO 8601 with timezone. Defaults to now. */
  date?: string;
  /** Email subject, article headline or document title. */
  title: string;
  body: string;
  from_name?: string;
  from_email?: string;
  to?: { name?: string; email: string }[];
  /** News: publisher domain. */
  domain?: string;
  author?: string;
  /** Document: contract, invoice, report... */
  doc_type?: string;
  origin?: string;
  language?: string;
  reliability?: "high" | "low";
  labels?: string[];
}

export interface Draft {
  kind: SourceKind;
  filename: string;
  content: string;
}

export interface Preview extends Draft {
  ok: boolean;
  errors: string[];
  /** Same fields the parser reads, for the card. */
  summary: { title: string; when: string | null; from: string | null; to: string[]; labels: string[]; reliability: string | null; body: string };
}

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";

const q = (v: string) => JSON.stringify(v); // a JSON string is a valid YAML scalar
const list = (xs: string[]) => `[${xs.map(q).join(", ")}]`;
const iso = (d: string | undefined, now: Date) => {
  const t = d && Date.parse(d) ? new Date(d) : now;
  return t;
};
/** Local-offset-free timestamp the parsers accept. */
const stamp = (t: Date) => t.toISOString().replace(/\.\d+Z$/, "Z");

/** Turns the model's flat description into the exact file the contract asks for. Pure. */
export function buildDraft(item: DraftItem, now = new Date()): Draft {
  const when = iso(item.date, now);
  const ymd = stamp(when).slice(0, 10).replace(/-/g, "");
  const hm = stamp(when).slice(11, 16).replace(":", "");
  const key = slug(item.title);
  const id = `${key}-${sha256(item.kind + item.title + item.body).slice(0, 6)}`;
  const labels = item.labels && item.labels.length ? item.labels : undefined;
  const head: string[] = [];
  const opt = (k: string, v: string | undefined) => v && head.push(`${k}: ${q(v)}`);

  if (item.kind === "email") {
    const from = item.from_email ? (item.from_name ? `${item.from_name} <${item.from_email}>` : item.from_email) : "";
    head.push(`message_id: ${q(`msg-${ymd}-${hm}-${id}`)}`, `date: ${q(stamp(when))}`, `from: ${q(from)}`);
    head.push("to:", ...(item.to ?? []).map((t) => `  - ${q(t.name ? `${t.name} <${t.email}>` : t.email)}`));
    head.push(`subject: ${q(item.title)}`);
  } else if (item.kind === "news") {
    head.push(`article_id: ${q(`news-${ymd}-${id}`)}`, `domain: ${q(item.domain ?? "")}`, `date: ${q(stamp(when))}`, `title: ${q(item.title)}`);
    opt("author", item.author);
    opt("language", item.language);
  } else {
    head.push(`doc_id: ${q(`doc-${ymd}-${id}`)}`, `doc_type: ${q(item.doc_type ?? "report")}`, `title: ${q(item.title)}`, `date: ${q(stamp(when))}`);
    opt("origin", item.origin);
    opt("language", item.language);
  }
  if (labels) head.push(`labels: ${list(labels)}`);
  if (item.reliability) head.push(`reliability: ${item.reliability}`);

  return { kind: item.kind, filename: `${ymd}-${hm}-${key}.md`, content: `---\n${head.join("\n")}\n---\n${item.body.trim()}\n` };
}

/** Parses a draft with the real contract parser. */
export function previewOf(d: Draft): Preview {
  const r = KINDS[d.kind].parse(d.content);
  const base = { kind: d.kind, filename: d.filename, content: d.content };
  if (!r.ok)
    return { ...base, ok: false, errors: r.errors, summary: { title: d.filename, when: null, from: null, to: [], labels: [], reliability: null, body: d.content } };
  const p = r.parsed;
  return {
    ...base,
    ok: true,
    errors: [],
    summary: {
      title: String(p.meta.title ?? p.meta.subject ?? p.external_id),
      when: p.occurred_at,
      from: p.author,
      to: p.recipients,
      labels: p.labels,
      reliability: (p.meta.reliability as string | null | undefined) ?? null,
      body: p.body,
    },
  };
}

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: SOURCE_KINDS },
    date: { type: "string", description: "ISO 8601 with timezone, e.g. 2026-11-24T09:30:00+01:00" },
    title: { type: "string", description: "email subject, news headline or document title" },
    body: { type: "string", description: "the full text, plain; for documents Markdown tables are fine" },
    from_name: { type: "string" },
    from_email: { type: "string", description: "email only: one address" },
    to: { type: "array", items: { type: "object", properties: { name: { type: "string" }, email: { type: "string" } }, required: ["email"] } },
    domain: { type: "string", description: "news only: publisher domain like granimercati.example" },
    author: { type: "string" },
    doc_type: { type: "string", description: "documents only: lowercase word such as contract, invoice, report, export" },
    origin: { type: "string", description: "documents only: system or office it came from" },
    language: { type: "string" },
    reliability: { type: "string", enum: ["high", "low"] },
    labels: { type: "array", items: { type: "string" } },
  },
  required: ["kind", "title", "body"],
};

export const GEN_SCHEMA = {
  type: "object",
  properties: { items: { type: "array", items: ITEM_SCHEMA, minItems: 1, maxItems: 5 } },
  required: ["items"],
};

export const GEN_SYSTEM = `You write realistic business source material for a company-memory demo: emails, news articles and internal documents.
Reply only with the structured result.
- Do what the request says and nothing else: only the sources it asks for, at most five.
- Facts must be concrete and checkable: names, figures with units, dates, places. Never vague.
- Keep each text short and natural, like the real thing. Do not explain or comment on it.
- Use the people, companies and places of the company context when they fit. Invent new ones only when the request needs them. Email addresses use the company's example domain and end in ".example".
- Write in the language the request asks for; otherwise in the language of the existing material.
- Dates: if the request gives a time, use it; otherwise use the current time given. Always ISO 8601 with a timezone.
- labels: only from the allowed list, and only if the content is clearly restricted (finance, for example). Leave them out for ordinary material.
- Set reliability to "low" for rumours, hearsay and unverified claims.`;

export interface GenContext {
  now: Date;
  /** Labels the access policy knows about. */
  labels: string[];
  /** Names and titles to keep the new material consistent with the world. */
  entities: string[];
  people: string[];
  recent: string[];
}

export interface GenOptions {
  llm: Llm;
  model: string;
  /** Restrict to these kinds; empty = the model chooses. */
  kinds?: SourceKind[];
}

export async function generateSources(prompt: string, ctx: GenContext, opts: GenOptions): Promise<Preview[]> {
  const kinds = opts.kinds && opts.kinds.length ? opts.kinds : null;
  const user = [
    `Current time: ${ctx.now.toISOString()}`,
    kinds ? `Allowed source kinds: ${kinds.join(", ")}` : `Source kinds: ${SOURCE_KINDS.join(", ")} (choose what fits the request)`,
    `Allowed labels: ${ctx.labels.length ? ctx.labels.join(", ") : "(none)"}`,
    ctx.people.length ? `People in the company: ${ctx.people.join("; ")}` : "",
    ctx.entities.length ? `Known companies, products and places: ${ctx.entities.join("; ")}` : "",
    ctx.recent.length ? `Recent material (for tone and language):\n${ctx.recent.map((t) => `- ${t}`).join("\n")}` : "",
    "",
    `Request: ${prompt.trim()}`,
  ]
    .filter((l) => l !== "")
    .join("\n");

  const res = await opts.llm({ model: opts.model, system: GEN_SYSTEM, prompt: user, schema: GEN_SCHEMA });
  const items = ((res.structured as { items?: DraftItem[] } | undefined)?.items ?? []).filter((i) => i && typeof i.body === "string" && typeof i.title === "string");
  const allowed = new Set(ctx.labels);
  const used = new Set<string>();
  return items
    .filter((i) => !kinds || kinds.includes(i.kind))
    .slice(0, 5)
    .map((i) => {
      const d = buildDraft({ ...i, labels: (i.labels ?? []).filter((l) => allowed.has(l)) }, ctx.now);
      let name = d.filename;
      for (let n = 2; used.has(name); n++) name = d.filename.replace(/\.md$/, `-${n}.md`);
      used.add(name);
      return previewOf({ ...d, filename: name });
    });
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

export type WriteResult = { ok: true; path: string } | { ok: false; error: string };

/**
 * Writes an accepted draft into its source folder. Re-checks everything: the file must parse, the name
 * must be a plain file name, and nothing already there may be overwritten (sources are immutable).
 * Written under a "_" name first and renamed, so the watcher never sees half a file.
 */
export function writeSource(d: Draft): WriteResult {
  if (!SOURCE_KINDS.includes(d.kind)) return { ok: false, error: "unknown source kind" };
  if (!SAFE_NAME.test(d.filename)) return { ok: false, error: "file name must be a plain name ending in .md" };
  const p = previewOf(d);
  if (!p.ok) return { ok: false, error: p.errors.join("; ") };
  const dir = KINDS[d.kind].dir();
  const target = join(dir, d.filename);
  if (existsSync(target)) return { ok: false, error: `${d.filename} already exists; sources are never overwritten` };
  const tmp = join(dir, `_${d.filename}`);
  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(tmp, d.content, { flag: "wx" });
    renameSync(tmp, target);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true, path: target };
}
