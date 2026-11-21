/**
 * Canonical text: the exact string quotes are verbatim slices of.
 * Deliberately minimal and versioned: NFC + newline normalisation only.
 * Whitespace is NOT collapsed.
 */
export const CANON_VERSION = 1;

export function canonicalize(raw: string): string {
  return raw.normalize("NFC").replace(/\r\n?/g, "\n");
}

/** Length in Unicode code points (the unit of all stored offsets). */
export function cpLength(s: string): number {
  return Array.from(s).length;
}

export function cpSlice(s: string, start: number, end: number): string {
  return Array.from(s).slice(start, end).join("");
}
