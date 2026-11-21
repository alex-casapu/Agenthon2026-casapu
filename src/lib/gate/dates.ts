const MONTHS: Record<string, number> = {
  january: 1, jan: 1, gennaio: 1, gen: 1,
  february: 2, feb: 2, febbraio: 2,
  march: 3, mar: 3, marzo: 3,
  april: 4, apr: 4, aprile: 4,
  may: 5, maggio: 5, mag: 5,
  june: 6, jun: 6, giugno: 6, giu: 6,
  july: 7, jul: 7, luglio: 7, lug: 7,
  august: 8, aug: 8, agosto: 8, ago: 8,
  september: 9, sep: 9, sept: 9, settembre: 9, set: 9,
  october: 10, oct: 10, ottobre: 10, ott: 10,
  november: 11, nov: 11, novembre: 11,
  december: 12, dec: 12, dicembre: 12, dic: 12,
};

const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join("|");
const ORD = "(?:st|nd|rd|th|°|º)?";

const DAY_MONTH = new RegExp(
  `(?<![\\d\\p{L}])(\\d{1,2})${ORD}\\s+(?:of\\s+)?(${MONTH_ALT})\\.?(?![\\p{L}])(?:,?\\s+(\\d{4})(?!\\d))?`,
  "giu",
);
const MONTH_DAY = new RegExp(
  `(?<![\\p{L}])(${MONTH_ALT})\\.?\\s+(\\d{1,2})${ORD}(?!\\d)(?:,?\\s+(\\d{4})(?!\\d))?`,
  "giu",
);
const ISO = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/g;
const NUMERIC = /(?<!\d)(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?!\d)/g;

const pad = (n: number) => String(n).padStart(2, "0");

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Year missing: pick the year that puts the date nearest to the message date. */
function inferYear(m: number, d: number, anchor: Date): number | null {
  let best: { y: number; dist: number } | null = null;
  for (const y of [anchor.getUTCFullYear() - 1, anchor.getUTCFullYear(), anchor.getUTCFullYear() + 1]) {
    if (!valid(y, m, d)) continue;
    const dist = Math.abs(Date.UTC(y, m - 1, d) - anchor.getTime());
    if (!best || dist < best.dist) best = { y, dist };
  }
  return best?.y ?? null;
}

/**
 * Every ISO date that can be read out of the text. `occurredAt` (the source's
 * timestamp) resolves year-less dates. Day-first and month-first numeric
 * dates are both accepted when ambiguous. Relative dates ("next Friday") are not supported.
 */
export function dateCandidates(text: string, occurredAt: string): Set<string> {
  const anchor = new Date(occurredAt);
  const out = new Set<string>();
  const add = (s: string | null) => s && out.add(s);

  for (const m of text.matchAll(ISO)) add(valid(+m[1], +m[2], +m[3]));

  for (const m of text.matchAll(NUMERIC)) {
    add(valid(+m[3], +m[2], +m[1])); // dd/mm/yyyy
    add(valid(+m[3], +m[1], +m[2])); // mm/dd/yyyy
  }

  const named = (day: number, monthWord: string, year?: string) => {
    const month = MONTHS[monthWord.toLowerCase()];
    if (!month) return;
    const y = year ? +year : Number.isNaN(anchor.getTime()) ? null : inferYear(month, day, anchor);
    if (y !== null) add(valid(y, month, day));
  };
  for (const m of text.matchAll(DAY_MONTH)) named(+m[1], m[2], m[3]);
  for (const m of text.matchAll(MONTH_DAY)) named(+m[2], m[1], m[3]);

  return out;
}
