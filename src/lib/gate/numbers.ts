const SEP_CHARS = "[.,\\u00a0\\u202f'’]";
const TOKEN_RE = new RegExp(`\\d+(?:${SEP_CHARS}\\d+)*`, "gu");
const SEP_RE = new RegExp(SEP_CHARS, "gu");

const groupsOk = (ps: string[]) =>
  ps.length > 0 && ps[0] !== "0" && ps[0].length >= 1 && ps[0].length <= 3 && ps.slice(1).every((p) => p.length === 3);

/** All plausible numeric readings of one token (locale-ambiguous tokens yield several). */
function tokenCandidates(token: string): number[] {
  const seps = token.match(SEP_RE) ?? [];
  if (seps.length === 0) return [Number(token)];
  const parts = token.split(SEP_RE);
  const out = new Set<number>();

  // A: every separator is a thousands separator ("1.200" -> 1200)
  if (groupsOk(parts)) out.add(Number(parts.join("")));

  // B: the last separator is the decimal mark ("1.200" -> 1.2, "412,50" -> 412.5)
  const last = seps[seps.length - 1];
  if (last === "." || last === ",") {
    const intParts = parts.slice(0, -1);
    const intSeps = seps.slice(0, -1);
    const intOk =
      intParts.length === 1 ||
      (groupsOk(intParts) && intSeps.every((s) => s === intSeps[0]) && intSeps[0] !== last);
    if (intOk) out.add(Number(intParts.join("") + "." + parts[parts.length - 1]));
  }
  return [...out].filter(Number.isFinite);
}

/** Every number that can be read out of the text, across locales. Digits only (no number words). */
export function numberCandidates(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(TOKEN_RE)) for (const n of tokenCandidates(m[0])) out.add(n);
  return out;
}
