import { allowedDates, allowedNumbers, checkBody, checkParse, checkWorld, datesIn, numbersIn } from "./check";
import { compile, type Compiled } from "./compile";
import { composeBody, parentInfoFrom, renderFile } from "./render";
import type { ScenarioSpec } from "./spec";
import { pieceId, type Piece } from "./types";

export type Profile = "demo7" | "none";

/** Can this role see a piece with these labels? `public` is visible to everyone. */
export function canSee(spec: ScenarioSpec, role: string, labels: string[] | undefined): boolean {
  const ls = labels?.length ? labels : ["public"];
  const sees = spec.roles[role]?.sees ?? [];
  return ls.some((l) => l === "public" || sees.includes(l));
}

const labelsOf = (p: Piece): string[] | undefined => p.header.labels;

function dup<T>(items: T[], key: (t: T) => string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const i of items) {
    const k = key(i);
    if (seen.has(k)) out.push(k);
    seen.add(k);
  }
  return out;
}

/**
 * Checks a spec without any model call: references, ids, formulas, headers through the real contract
 * parsers, number and date discipline in briefs and examples, visibility of the expected answers,
 * and (profile `demo7`) that the scenario gives the demo what it needs. Returns readable errors.
 */
export function lintSpec(spec: ScenarioSpec, profile: Profile = "demo7"): string[] {
  const errors: string[] = [];
  const err = (m: string) => errors.push(m);

  // ── identity ──
  for (const k of dup(spec.people, (p) => p.key)) err(`people: duplicate key "${k}"`);
  for (const k of dup(spec.facts, (f) => f.id)) err(`facts: duplicate id "${k}"`);
  for (const k of dup(spec.derived, (d) => d.id)) err(`derived: duplicate id "${k}"`);
  for (const k of dup(spec.questions, (q) => q.id)) err(`questions: duplicate id "${k}"`);
  const factIds = new Set(spec.facts.map((f) => f.id));
  for (const d of spec.derived) if (factIds.has(d.id)) err(`derived "${d.id}" has the same id as a fact`);
  const tierIds = new Set(spec.tiers.map((t) => t.id));
  if (tierIds.size !== spec.tiers.length) err("tiers: duplicate id");

  // ── roles and who acts as them (at most three principals) ──
  if (Object.keys(spec.roles).length > 3) err(`roles: at most three roles are supported (three principals), found ${Object.keys(spec.roles).length}`);
  for (const p of spec.people) if (p.access !== undefined && !spec.roles[p.access]) err(`people: "${p.key}" has access "${p.access}", which is not a role`);
  for (const k of dup(spec.people.filter((p) => p.access !== undefined), (p) => p.access!)) err(`people: more than one person has access "${k}"`);

  // ── references ──
  const peopleKeys = new Set(spec.people.map((p) => p.key));
  const used = new Set<string>();
  const ids = new Set<string>();
  for (const p of spec.pieces) {
    const id = pieceId(p as unknown as Piece);
    ids.add(id);
    for (const f of p.facts) {
      used.add(f);
      if (!factIds.has(f)) err(`${id}: unknown fact "${f}"`);
    }
    if (p.kind === "email") {
      for (const k of [p.header.from, ...p.header.to, ...(p.header.cc ?? [])]) if (!peopleKeys.has(k)) err(`${id}: unknown person "${k}"`);
    }
    if (p.kind === "news" && p.header.url) {
      try {
        if (!new URL(p.header.url).hostname.endsWith(".example")) err(`${id}: url host must end in .example`);
      } catch {
        err(`${id}: url is not a valid URL`);
      }
    }
  }
  for (const f of spec.facts) if (!used.has(f.id)) err(`fact "${f.id}" is not stated by any piece`);

  // ── compile (formulas, references) ──
  let compiled: Compiled | undefined;
  try {
    compiled = compile(spec);
  } catch (e) {
    err(`compile: ${(e as Error).message}`);
  }
  if (!compiled) return errors;
  const { world } = compiled;

  // ── headers through the real contract parsers; links; time order ──
  const byId = new Map(world.pieces.map((p) => [pieceId(p), p]));
  for (const p of world.pieces) {
    let parent;
    if (p.kind === "email" && p.header.in_reply_to) {
      const par = byId.get(p.header.in_reply_to);
      if (par && par.kind === "email") parent = parentInfoFrom(par, "Testo di prova.");
    }
    try {
      const text = renderFile(p, composeBody(p, "Testo di prova.", parent, world.language));
      for (const e of checkParse(p, text)) err(`${pieceId(p)}: ${e}`);
    } catch (e) {
      err(`${pieceId(p)}: ${(e as Error).message}`);
    }
  }
  for (const e of checkWorld(world.pieces, world.tiers)) err(e);

  // ── number and date discipline in briefs and examples ──
  for (const p of world.pieces) {
    const id = pieceId(p);
    const okN = allowedNumbers(p, world.language);
    for (const n of numbersIn(p.brief, world.language)) if (!okN.has(n)) err(`${id}: the brief mentions the number ${n}, which is not one of the piece's facts`);
    const okD = allowedDates(p);
    for (const d of datesIn(p.brief)) if (!okD.has(d)) err(`${id}: the brief mentions the date ${d}, which is not one of the piece's facts`);
    for (const f of world.forbidden) if (p.brief.includes(f)) err(`${id}: the brief states the derived value ${f}`);
    if (p.example !== undefined) {
      for (const e of checkBody(p, p.example, { forbidden: world.forbidden, banned: world.banned, lang: world.language })) err(`${id}: example: ${e}`);
    }
  }

  // ── expected answers ──
  const factOrDerived = (ref: string): boolean =>
    ref.startsWith("fact:") ? factIds.has(ref.slice(5)) : ref.startsWith("derived:") ? spec.derived.some((d) => d.id === ref.slice(8)) : true;
  for (const q of spec.questions) {
    if (!spec.roles[q.role]) err(`question ${q.id}: unknown role "${q.role}"`);
    for (const r of q.include ?? []) if (!factOrDerived(r)) err(`question ${q.id}: unknown reference "${r}"`);
    const cited = (q.cites ?? []).map((c) => ({ id: c, piece: byId.get(c) }));
    for (const c of cited) if (!c.piece) err(`question ${q.id}: cites unknown piece "${c.id}"`);
    if (q.expect === "answer" && cited.length === 0) err(`question ${q.id}: an answer must cite at least one piece`);
    if (spec.roles[q.role]) {
      const visible = cited.filter((c) => c.piece).map((c) => canSee(spec, q.role, labelsOf(c.piece!)));
      if (q.expect === "answer" && visible.some((v) => !v)) err(`question ${q.id}: role "${q.role}" cannot see a piece it must cite`);
      if (q.expect === "denied" && (cited.length === 0 || visible.every((v) => v))) {
        err(`question ${q.id}: a denied question must cite at least one piece the role "${q.role}" cannot see`);
      }
    }
  }
  for (const a of spec.adversarial) if (!spec.roles[a.role]) err(`adversarial "${a.question}": unknown role "${a.role}"`);

  // ── what the demo needs ──
  if (profile === "demo7") {
    const nonEmptyTiers = new Set(world.pieces.map((p) => p.tier));
    if (nonEmptyTiers.size < 2) err("coverage: at least two tiers must have pieces (a baseline and a later moment)");
    const restricted = world.pieces.filter((p) => (labelsOf(p) ?? ["public"]).some((l) => l !== "public"));
    if (restricted.length === 0) err("coverage: at least one piece must be restricted (labels other than public)");
    else if (!Object.keys(spec.roles).some((r) => restricted.some((p) => !canSee(spec, r, labelsOf(p))))) {
      err("coverage: some role must be unable to see a restricted piece");
    }
    if (!world.pieces.some((p) => p.header.reliability === "low")) err("coverage: at least one piece must have reliability low (a weak source)");
    if (!world.pieces.some((p) => (p.kind === "news" && p.header.corrects) || (p.kind === "doc" && p.header.supersedes))) {
      err("coverage: at least one correction is needed (a news with corrects, or a document with supersedes)");
    }
    for (const kind of ["answer", "unknown", "denied"] as const) {
      if (!spec.questions.some((q) => q.expect === kind)) err(`coverage: the questions need at least one "${kind}"`);
    }
    if (Object.keys(spec.roles).length !== 3) err("coverage: exactly three roles are needed (the system has three principals)");
    for (const r of Object.keys(spec.roles)) if (!spec.people.some((p) => p.access === r)) err(`coverage: role "${r}" needs one internal person with access: "${r}"`);
    if (!Object.values(spec.roles).some((r) => r.curator)) err("coverage: one role must be the curator (curator: true)");
    if (spec.derived.length === 0) err("coverage: at least one derived value is needed (something the system must compute)");
    if (world.pieces.length < 6 || world.pieces.length > 20) err(`coverage: between 6 and 20 pieces are expected, found ${world.pieces.length}`);
  }
  return errors;
}
