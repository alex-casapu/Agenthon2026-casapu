import { listClaimViews, visibleTo, type ClaimView, type EvidenceView } from "../claims-view";
import type { Llm, LlmResponse } from "../llm";
import type { Principal } from "../policy";
import type { DB } from "../store/log";
import { ANSWER_SYSTEM, ANSWER_VERSION, buildAnswerPrompt, buildAnswerSchema, claimMaterial, type Turn } from "./prompt";
import { verifySegments, type KnownClaim, type Problem } from "./verify";

export { ANSWER_VERSION, type Turn };

export interface Citation {
  /** 1-based, in order of first use in the answer. */
  n: number;
  claim_id: string;
  sentence: string;
  labels: string[];
  status: string;
  valid_to: string | null;
  evidence: EvidenceView[];
}

export interface AnswerResult {
  /** True when the answer is "I don't know" (nothing visible and approved supports one). */
  idk: boolean;
  segments: { text: string; cites: number[] }[];
  citations: Citation[];
  followups: string[];
  meta: {
    principal: string;
    /** Approved claims this person may see (what the model was given). */
    knowledge: number;
    /** Claims this person may see that are still awaiting approval (unusable). */
    pending: number;
    llm_calls: number;
    /** Statements removed because they could not be verified. */
    dropped: number;
    model: string;
    cost_usd?: number;
    duration_ms: number;
  };
}

export interface AnswerOptions {
  llm: Llm;
  model: string;
  /** Repair rounds after the first call. */
  maxRepairs?: number;
}

/** What a principal may use: approved, visible claims. Others are never read, not even to be counted. */
export function knowledgeFor(db: DB, principal: Principal): { approved: ClaimView[]; pending: number } {
  const visible = visibleTo(listClaimViews(db), principal);
  return { approved: visible.filter((c) => c.status === "approved"), pending: visible.filter((c) => c.status === "proposed").length };
}

const MAX_CLAIMS = 120;
const words = (s: string) => new Set(s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));

/** With a large memory, keep the claims sharing the most words with the question. */
export function selectRelevant(claims: ClaimView[], text: string): ClaimView[] {
  if (claims.length <= MAX_CLAIMS) return claims;
  const q = words(text);
  return claims
    .map((c) => ({ c, score: [...words(claimMaterial(c))].filter((w) => q.has(w)).length }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CLAIMS)
    .map((s) => s.c);
}

interface Parsed {
  answerable: boolean;
  segments: { text: string; cites: string[] }[];
  followups: string[];
}

function parseAnswer(res: LlmResponse): Parsed | null {
  const read = (o: unknown): Parsed | null => {
    if (!o || typeof o !== "object") return null;
    const r = o as { answerable?: unknown; segments?: unknown; followups?: unknown };
    if (typeof r.answerable !== "boolean" || !Array.isArray(r.segments)) return null;
    return {
      answerable: r.answerable,
      segments: r.segments as Parsed["segments"],
      followups: Array.isArray(r.followups) ? r.followups.filter((f): f is string => typeof f === "string") : [],
    };
  };
  const s = read(res.structured);
  if (s) return s;
  const text = res.text.replace(/```(?:json)?/gi, "");
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return read(JSON.parse(text.slice(a, b + 1)));
    } catch {
      /* fall through */
    }
  }
  return null;
}

function repairPrompt(base: string, problems: Problem[]): string {
  return `${base}\n\n# Verifier feedback on your previous reply\nThese segments were rejected by the automatic verifier:\n${problems.map((p) => `- segment ${p.segment + 1}: ${p.message}`).join("\n")}\nReply again with a corrected answer: only claims-backed statements, every segment cited, no figures that are not in the cited claims.`;
}

const IDK = (meta: Omit<AnswerResult["meta"], "duration_ms">, t0: number): AnswerResult => ({
  idk: true,
  segments: [],
  citations: [],
  followups: [],
  meta: { ...meta, duration_ms: Date.now() - t0 },
});

/**
 * Answer a question as `principal`. The model sees only approved claims that
 * principal may see; every citation and figure in its reply is verified; anything
 * that cannot be backed becomes "I don't know". Throws only if the model call fails.
 */
export async function answerQuestion(db: DB, principal: Principal, messages: Turn[], opts: AnswerOptions): Promise<AnswerResult> {
  const t0 = Date.now();
  const { approved, pending } = knowledgeFor(db, principal);
  const base = { principal: principal.id, knowledge: approved.length, pending, llm_calls: 0, dropped: 0, model: opts.model };

  const question = [...messages].reverse().find((m) => m.role === "user")?.content.trim() ?? "";
  if (!question || approved.length === 0) return IDK(base, t0);

  const history = messages.slice(0, messages.lastIndexOf([...messages].reverse().find((m) => m.role === "user")!));
  const claims = selectRelevant(approved, question + " " + history.map((h) => h.content).join(" "));
  const handles = claims.map((_, i) => `C${i + 1}`);
  const known = new Map<string, KnownClaim>(claims.map((c, i) => [handles[i], { material: claimMaterial(c) }]));
  const prompt = buildAnswerPrompt(claims, handles, history, question);
  const schema = buildAnswerSchema();
  const userNumbers = [question, ...history.filter((h) => h.role === "user").map((h) => h.content)].join(" ");

  let cost = 0;
  let calls = 0;
  let best: { ok: { text: string; cites: string[] }[]; problems: Problem[]; followups: string[] } | null = null;
  let feedback: Problem[] = [];
  let sawAnswerable = false;

  for (let round = 0; round <= (opts.maxRepairs ?? 1); round++) {
    const res = await opts.llm({ model: opts.model, system: ANSWER_SYSTEM, prompt: round === 0 ? prompt : repairPrompt(prompt, feedback), schema });
    calls++;
    cost += res.cost_usd ?? 0;
    const parsed = parseAnswer(res);
    if (!parsed) {
      feedback = [{ segment: 0, message: "your reply was not valid JSON of the required form" }];
      continue;
    }
    if (!parsed.answerable || parsed.segments.length === 0) {
      if (!sawAnswerable) break; // the model says the claims do not answer it: an honest "I don't know"
      continue;
    }
    sawAnswerable = true;
    const v = verifySegments(parsed.segments, known, userNumbers);
    if (!best || v.ok.length > best.ok.length) best = { ok: v.ok, problems: v.problems, followups: parsed.followups };
    if (v.problems.length === 0) break;
    feedback = v.problems;
  }

  const meta = { ...base, llm_calls: calls, dropped: best?.problems.length ?? 0, cost_usd: cost || undefined };
  if (!best || best.ok.length === 0) return IDK(meta, t0);

  // number the citations by first use
  const order: string[] = [];
  const segments = best.ok.map((s) => ({
    text: s.text,
    cites: s.cites.map((h) => {
      if (!order.includes(h)) order.push(h);
      return order.indexOf(h) + 1;
    }),
  }));
  const citations: Citation[] = order.map((h, i) => {
    const c = claims[handles.indexOf(h)];
    return { n: i + 1, claim_id: c.claim_id, sentence: c.sentence, labels: c.labels, status: c.status, valid_to: c.valid_to, evidence: c.evidence };
  });

  return {
    idk: false,
    segments,
    citations,
    followups: best.followups.map((f) => f.trim().slice(0, 140)).filter(Boolean).slice(0, 3),
    meta: { ...meta, duration_ms: Date.now() - t0 },
  };
}
