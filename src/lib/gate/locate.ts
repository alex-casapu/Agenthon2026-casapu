import { cpLength } from "../canon";

export type LocateResult =
  | { ok: true; start: number; end: number; text: string }
  | { ok: false; code: "quote_empty" | "quote_not_found" | "quote_ambiguous"; message: string };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Find the model-supplied quote in the canonical source text.
 * Whitespace-tolerant match; the stored span is the EXACT source slice
 * (code-point offsets). Zero or multiple matches are rejected.
 */
export function locateQuote(canonicalText: string, quote: string): LocateResult {
  const parts = quote.normalize("NFC").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { ok: false, code: "quote_empty", message: "quote is empty" };

  const re = new RegExp(parts.map(escapeRe).join("\\s+"), "gu");
  const matches: { index: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(canonicalText)) !== null) {
    matches.push({ index: m.index, text: m[0] });
    if (m[0].length === 0) re.lastIndex++;
    if (matches.length > 1) break;
  }

  if (matches.length === 0)
    return { ok: false, code: "quote_not_found", message: "quote does not appear in the source" };
  if (matches.length > 1)
    return {
      ok: false,
      code: "quote_ambiguous",
      message: "quote appears more than once in the source; extend it with surrounding words",
    };

  const { index, text } = matches[0];
  const start = cpLength(canonicalText.slice(0, index));
  return { ok: true, start, end: start + cpLength(text), text };
}
