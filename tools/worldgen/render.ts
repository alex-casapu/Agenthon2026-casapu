import { stringify } from "yaml";
import { KIND_DIR, type Piece } from "./types";

/** Information about the parent message, needed to quote it in a reply. */
export interface ParentInfo {
  fromName: string;
  /** ISO date of the parent, as written in its header (local time offset kept). */
  date: string;
  /** The parent's own text (without its own quote). */
  written: string;
}

const nameOf = (from: string): string => /^(.*?)\s*<[^<>]+>$/.exec(from)?.[1]?.trim() || from;
export const parentInfoFrom = (parent: Piece, written: string): ParentInfo => {
  if (parent.kind !== "email") throw new Error("only emails can be quoted");
  return { fromName: nameOf(parent.header.from), date: parent.header.date, written };
};

const QUOTE_HEADER: Record<string, (dd: string, mm: string, name: string) => string> = {
  it: (dd, mm, name) => `Il ${dd}/${mm} ${name} ha scritto:`,
  en: (dd, mm, name) => `On ${dd}/${mm}, ${name} wrote:`,
  fr: (dd, mm, name) => `Le ${dd}/${mm}, ${name} a écrit :`,
  de: (dd, mm, name) => `Am ${dd}.${mm}. schrieb ${name}:`,
  es: (dd, mm, name) => `El ${dd}/${mm}, ${name} escribió:`,
};

/** Final body: the writer's text, plus a deterministic `>` quote when the piece is a quoting reply. */
export function composeBody(piece: Piece, written: string, parent?: ParentInfo, lang = "it"): string {
  let body = written.replace(/\s+$/, "");
  if (piece.kind === "email" && piece.quoteParent) {
    if (!parent) throw new Error(`${piece.header.message_id}: quoteParent needs the parent message`);
    const dd = parent.date.slice(8, 10);
    const mm = parent.date.slice(5, 7);
    const quoted = parent.written
      .replace(/\s+$/, "")
      .split("\n")
      .map((l) => (l === "" ? ">" : `> ${l}`))
      .join("\n");
    const header = (QUOTE_HEADER[lang.split("-")[0].toLowerCase()] ?? QUOTE_HEADER.en)(dd, mm, parent.fromName);
    body += `\n\n> ${header}\n${quoted}`;
  }
  return body + "\n";
}

/** The full source file: YAML front matter built from the header fields, then the body. */
export function renderFile(piece: Piece, body: string): string {
  const header = Object.fromEntries(Object.entries(piece.header).filter(([, v]) => v !== undefined));
  return `---\n${stringify(header, { lineWidth: 0 })}---\n${body}`;
}

/** `YYYYMMDD[-HHMM]-slug.md`, from the header date. */
export function fileName(piece: Piece): string {
  const d = piece.header.date;
  const day = d.slice(0, 10).replace(/-/g, "");
  const time = d.length > 10 ? `-${d.slice(11, 13)}${d.slice(14, 16)}` : "";
  return `${day}${time}-${piece.slug}.md`;
}

/** Path of a piece inside the world folder: `<tier>/<kind dir>/<file name>`. */
export const relPath = (piece: Piece): string => `${piece.tier}/${KIND_DIR[piece.kind]}/${fileName(piece)}`;
