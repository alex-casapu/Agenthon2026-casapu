/** Number conventions by language: how a number is written and how a written number is read back. */

const DOT_THOUSANDS = new Set(["it", "de", "es", "pt", "nl", "da", "tr", "id"]);

/** `it`-style languages write 1.234,5; the others 1,234.5. */
export const usesCommaDecimal = (lang: string): boolean => DOT_THOUSANDS.has(lang.toLowerCase().split("-")[0]);

/** Formats a number the way a text in `lang` writes it. Thousands are grouped from 4 digits. */
export function formatNumber(n: number, decimals: number, lang: string): string {
  const [int, dec] = Math.abs(n).toFixed(decimals).split(".");
  const [thou, point] = usesCommaDecimal(lang) ? [".", ","] : [",", "."];
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
  return (n < 0 ? "-" : "") + grouped + (dec ? point + dec : "");
}

/** Reads a written number back to a canonical form: no thousands separator, `.` as decimal point. */
export function normalizeNumber(s: string, lang: string): string {
  if (usesCommaDecimal(lang)) return /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s.replace(",", ".");
  return /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s;
}

const NAMES: Record<string, string> = {
  it: "italiano",
  en: "inglese",
  fr: "francese",
  de: "tedesco",
  es: "spagnolo",
  pt: "portoghese",
  nl: "olandese",
};
/** Name of a language, in Italian, for the writer's prompt. */
export const languageName = (lang: string): string => NAMES[lang.toLowerCase().split("-")[0]] ?? lang;
