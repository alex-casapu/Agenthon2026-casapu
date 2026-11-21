import { numberCandidates, numberTokens } from "../gate/numbers";

/**
 * Deterministic checks on a model-written answer. They cannot prove a sentence
 * is entailed by its citations, but they do guarantee that every citation exists
 * and is visible to the asker, and that no number appears that the cited claims
 * do not contain, so the model cannot invent or compute figures.
 */

export interface RawSegment {
  text: string;
  cites: string[];
}

export interface KnownClaim {
  /** Everything a claim states: sentence, field values, validity, quotes, source dates. */
  material: string;
}

export interface Problem {
  segment: number;
  message: string;
}

export interface VerifyResult {
  ok: { text: string; cites: string[] }[];
  problems: Problem[];
}

const normaliseHandle = (h: string) => h.replace(/[\[\]\s]/g, "").toUpperCase();

export function verifySegments(segments: RawSegment[], known: Map<string, KnownClaim>, extraNumbersFrom = ""): VerifyResult {
  const ok: VerifyResult["ok"] = [];
  const problems: Problem[] = [];
  const allowedFromQuestion = numberCandidates(extraNumbersFrom);

  segments.forEach((seg, i) => {
    const text = typeof seg?.text === "string" ? seg.text.trim() : "";
    if (!text) {
      problems.push({ segment: i, message: "empty segment" });
      return;
    }
    const cites = [...new Set((Array.isArray(seg.cites) ? seg.cites : []).map((c) => normaliseHandle(String(c))))];
    if (cites.length === 0) {
      problems.push({ segment: i, message: `"${text.slice(0, 60)}" has no citation` });
      return;
    }
    const unknown = cites.filter((c) => !known.has(c));
    if (unknown.length) {
      problems.push({ segment: i, message: `cites ${unknown.join(", ")}, which are not among the claims provided` });
      return;
    }

    const supported = new Set<number>();
    for (const c of cites) for (const n of numberCandidates(known.get(c)!.material)) supported.add(n);
    const unsupported = numberTokens(text).filter((cands) => !cands.some((n) => supported.has(n) || allowedFromQuestion.has(n)));
    if (unsupported.length) {
      problems.push({ segment: i, message: `says ${unsupported.map((c) => c[0]).join(", ")}, but the cited claims contain no such number (do not compute or convert figures; restate them)` });
      return;
    }
    ok.push({ text, cites });
  });

  return { ok, problems };
}
