import { parseDocumentSource } from "../../src/lib/ingest/document";
import { parseEmailSource } from "../../src/lib/ingest/email";
import { parseNewsSource } from "../../src/lib/ingest/news";
import { normalizeNumber } from "./numfmt";
import { pieceId, type Piece, type PieceKind } from "./types";

const PARSERS: Record<PieceKind, (text: string) => ReturnType<typeof parseEmailSource>> = {
  email: parseEmailSource,
  news: parseNewsSource,
  doc: parseDocumentSource,
};

/** Parse a source file with the parser of its kind (the contracts live in src/lib/ingest). */
export const parseFile = (kind: PieceKind, fileText: string) => PARSERS[kind](fileText);

/** Does the file satisfy the source contract, and is it the piece we expect? */
export function checkParse(piece: Piece, fileText: string): string[] {
  const r = parseFile(piece.kind, fileText);
  if (!r.ok) return r.errors.map((e) => `contract: ${e}`);
  const id = pieceId(piece);
  return r.parsed.external_id === id ? [] : [`contract: id is ${r.parsed.external_id}, expected ${id}`];
}

// ───────────── numbers, dates, literals ─────────────

const ISO_RE = /\b\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})?)?\b/g;
const DATE_RE = /\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\b/g;
/** Identifier-like tokens (letters, then hyphen/underscore groups) that contain a digit: CQ-2026-031, PO-9120. */
const ID_RE = /\b[A-Za-z][A-Za-z0-9]*(?:[-_][A-Za-z0-9]+)+\b/g;
/** Product and part codes: letters first, then digits (K7, M2, PO4471). "5kg" is a number and is not matched. */
const CODE_RE = /\b[A-Za-z]+\d[A-Za-z0-9]*\b/g;
/** Legal numbering ("Art. 3", "Article 12", "Section 2") is structure, not a fact. */
const ARTICLE_RE = /\b(?:art\.|artt\.|articolo|article|artículo|artikel|section|clause|sez\.|sezione)\s*\d+\b/gi;
/** Markdown list numbering at the start of a line. */
const LIST_RE = /^[ \t]*\d+[.)][ \t]/gm;
const NUM_RE = /\d+(?:[.,]\d+)*/g;
const isYear = (n: string) => /^(?:19|20)\d{2}$/.test(n);

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim().toLowerCase();
const stripIds = (s: string): string => s.replace(ID_RE, (m) => (/\d/.test(m) ? " " : m)).replace(CODE_RE, " ");

/** Dates written in a text: ISO dates and day/month[/year]. Identifier-like tokens are ignored. */
export function datesIn(text: string): Set<string> {
  const t = stripIds(text);
  return new Set([...(t.match(ISO_RE) ?? []), ...(t.replace(ISO_RE, " ").match(DATE_RE) ?? [])]);
}

/**
 * Numbers written in a text, in canonical form. Not counted: dates, times, identifier-like tokens,
 * legal numbering, list numbering, and years (1900-2099).
 */
export function numbersIn(text: string, lang = "it"): Set<string> {
  const t = stripIds(text).replace(ISO_RE, " ").replace(DATE_RE, " ").replace(TIME_RE, " ").replace(ARTICLE_RE, " ").replace(LIST_RE, " ");
  const out = new Set<string>();
  for (const raw of t.match(NUM_RE) ?? []) {
    const n = normalizeNumber(raw, lang);
    if (!isYear(n)) out.add(n);
  }
  return out;
}

/** Numbers a piece may contain: those of its required facts, plus the explicitly allowed ones. */
export const allowedNumbers = (piece: Piece, lang = "it"): Set<string> =>
  new Set([...numbersIn(piece.mustContain.join(" "), lang), ...(piece.allowNumbers ?? []).map((n) => normalizeNumber(n, lang))]);

/** Dates a piece may contain. */
export const allowedDates = (piece: Piece): Set<string> =>
  new Set([...datesIn(piece.mustContain.join(" ")), ...(piece.allowDates ?? [])]);

/** Drops `>` lines: the quote of a parent message is deterministic and not the writer's text. */
const stripQuotes = (body: string): string =>
  body
    .split("\n")
    .filter((l) => !l.startsWith(">"))
    .join("\n");

export interface BodyCheckOptions {
  /** Derived-value literals that must not appear. */
  forbidden?: string[];
  /** Case-sensitive banned words. */
  banned?: string[];
  /** Language of the texts (number format). */
  lang?: string;
}

/**
 * Checks a body against its spec:
 * - every required literal is present;
 * - no number or date that is neither required nor explicitly allowed (catches invented and derived values);
 * - no forbidden literal, no banned word.
 */
export function checkBody(piece: Piece, body: string, opts: BodyCheckOptions = {}): string[] {
  const lang = opts.lang ?? "it";
  const errors: string[] = [];
  const text = stripQuotes(body);
  const flat = collapse(text);

  if (/^\s*(---|```)/.test(body)) errors.push("the body must not start with front matter or a code fence");
  if (/^\s*(oggetto|subject|da|a|cc|from|to|objet|betreff)\s*:/im.test(text)) errors.push("do not write email headers (Subject, From, To, Cc) in the body");

  for (const lit of piece.mustContain) {
    if (!flat.includes(collapse(lit))) errors.push(`missing required fact: "${lit}"`);
  }

  const okNumbers = allowedNumbers(piece, lang);
  for (const n of numbersIn(text, lang)) if (!okNumbers.has(n)) errors.push(`unexpected number: ${n}`);

  const okDates = allowedDates(piece);
  for (const d of datesIn(text)) if (!okDates.has(d)) errors.push(`unexpected date: ${d}`);

  for (const f of [...(opts.forbidden ?? []), ...(piece.forbid ?? [])]) {
    if (flat.includes(collapse(f))) errors.push(`forbidden value: "${f}"`);
  }
  for (const b of opts.banned ?? []) if (text.includes(b)) errors.push(`banned word: "${b}"`);
  return errors;
}

// ───────────── cross-piece consistency ─────────────

const at = (p: Piece): number => Date.parse(p.header.date);

/** Consistency across the whole world: ids, links, and time order of the tiers. */
export function checkWorld(pieces: Piece[], tiers: string[]): string[] {
  const errors: string[] = [];

  const seen = new Set<string>();
  for (const p of pieces) {
    const key = `${p.kind}:${pieceId(p)}`;
    if (seen.has(key)) errors.push(`duplicate id: ${key}`);
    seen.add(key);
    if (!tiers.includes(p.tier)) errors.push(`${pieceId(p)}: unknown tier "${p.tier}"`);
  }

  const byId = (kind: PieceKind, id: string) => pieces.find((p) => p.kind === kind && pieceId(p) === id);

  for (const p of pieces) {
    const id = pieceId(p);
    if (p.kind === "email" && p.header.in_reply_to) {
      const parent = byId("email", p.header.in_reply_to);
      if (!parent || parent.kind !== "email") errors.push(`${id}: in_reply_to ${p.header.in_reply_to} not found`);
      else {
        if (at(parent) >= at(p)) errors.push(`${id}: replies to a message that is not earlier`);
        if (parent.header.thread_id !== p.header.thread_id) errors.push(`${id}: thread_id differs from its parent`);
      }
    }
    if (p.kind === "email" && p.quoteParent && !p.header.in_reply_to) errors.push(`${id}: quoteParent without in_reply_to`);
    if (p.kind === "news" && p.header.corrects) {
      const target = byId("news", p.header.corrects);
      if (!target) errors.push(`${id}: corrects ${p.header.corrects} not found`);
      else if (at(target) >= at(p)) errors.push(`${id}: corrects an article that is not earlier`);
    }
    if (p.kind === "doc" && p.header.supersedes) {
      const target = byId("doc", p.header.supersedes);
      if (!target) errors.push(`${id}: supersedes ${p.header.supersedes} not found`);
      else if (at(target) >= at(p)) errors.push(`${id}: supersedes a document that is not earlier`);
    }
  }

  // Tiers are in time order: everything in a tier is earlier than everything in the next non-empty tier.
  const ranges = tiers
    .map((t) => {
      const ts = pieces.filter((p) => p.tier === t).map(at);
      return ts.length ? { tier: t, min: Math.min(...ts), max: Math.max(...ts) } : null;
    })
    .filter((r): r is { tier: string; min: number; max: number } => r !== null);
  for (let i = 0; i + 1 < ranges.length; i++) {
    if (ranges[i].max >= ranges[i + 1].min) {
      errors.push(`time order: a piece in tier ${ranges[i].tier} is not earlier than every piece in tier ${ranges[i + 1].tier}`);
    }
  }
  return errors;
}
