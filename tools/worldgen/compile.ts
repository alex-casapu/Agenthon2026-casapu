import { numbersIn } from "./check";
import { evaluateDerived } from "./formula";
import { formatNumber } from "./numfmt";
import type { ScenarioSpec, SpecPiece } from "./spec";
import { pieceId, type AuthorInfo, type Piece, type World } from "./types";

type Person = ScenarioSpec["people"][number];

export interface Compiled {
  world: World;
  spec: ScenarioSpec;
  /** Numeric values of the derived values. */
  values: Record<string, number>;
  /** Derived values as written in the language of the world. */
  derivedText: Record<string, string>;
}

const nameAddr = (p: Person) => `${p.name} <${p.email}>`;

/** Literals of derived values the sources must not state, without those that collide with a fact. */
function forbiddenLiterals(spec: ScenarioSpec, values: Record<string, number>): string[] {
  const factNumbers = numbersIn(spec.facts.map((f) => f.text).join(" "), spec.language);
  const out = new Set<string>();
  for (const d of spec.derived) {
    const v = values[d.id];
    const candidates = [formatNumber(v, d.decimals, spec.language), String(Math.round(v * 10 ** d.decimals) / 10 ** d.decimals)];
    if (Math.abs(v) >= 10000) candidates.push(formatNumber(Math.round(v / 1000) * 1000, 0, spec.language));
    for (const c of candidates) {
      if (c.replace(/\D/g, "").length < 4) continue; // too short to ban safely; the number check still applies
      if ([...numbersIn(c, spec.language)].some((n) => factNumbers.has(n))) continue;
      out.add(c);
    }
  }
  return [...out];
}

/** The author of a piece, with the facts they know from what they sent or received before. */
function authorOf(spec: ScenarioSpec, piece: SpecPiece, people: Map<string, Person>, factText: Map<string, string>): AuthorInfo | undefined {
  let person: Person | undefined;
  if (piece.kind === "email") person = people.get(piece.header.from);
  else if (piece.header.author) person = [...people.values()].find((p) => p.name === piece.header.author);
  if (!person) return undefined;
  const me = person;

  const involves = (p: SpecPiece): boolean =>
    p.kind === "email"
      ? [p.header.from, ...p.header.to, ...(p.header.cc ?? [])].includes(me.key)
      : p.kind === "doc" && p.header.author === me.name;
  const before = spec.pieces.filter((p) => p !== piece && involves(p) && Date.parse(p.header.date) < Date.parse(piece.header.date));
  const known = new Set<string>();
  for (const p of before) for (const f of p.facts) known.add(factText.get(f) ?? f);
  for (const f of piece.facts) known.add(factText.get(f) ?? f);
  return { name: me.name, role: me.role, persona: me.persona, knows: [...known] };
}

/** Compiles a (valid) spec into the world the engine generates. Throws on a broken reference. */
export function compile(spec: ScenarioSpec): Compiled {
  const people = new Map(spec.people.map((p) => [p.key, p]));
  const factText = new Map(spec.facts.map((f) => [f.id, f.text]));
  const person = (key: string): Person => {
    const p = people.get(key);
    if (!p) throw new Error(`unknown person "${key}"`);
    return p;
  };

  const factValues: Record<string, number> = {};
  for (const f of spec.facts) if (f.value !== undefined) factValues[f.id] = f.value;
  const values = evaluateDerived(factValues, spec.derived);
  const derivedText = Object.fromEntries(spec.derived.map((d) => [d.id, formatNumber(values[d.id], d.decimals, spec.language)]));

  const pieces: Piece[] = spec.pieces.map((sp): Piece => {
    const common = {
      tier: sp.tier,
      slug: sp.slug,
      brief: sp.brief,
      example: sp.example,
      mustContain: sp.facts.map((id) => {
        const t = factText.get(id);
        if (t === undefined) throw new Error(`${pieceId(sp as unknown as Piece)}: unknown fact "${id}"`);
        return t;
      }),
      allowNumbers: sp.allowNumbers,
      allowDates: sp.allowDates,
      author: authorOf(spec, sp, people, factText),
    };
    if (sp.kind === "email") {
      const h = sp.header;
      return {
        ...common,
        kind: "email",
        quoteParent: sp.quoteParent,
        header: {
          message_id: h.message_id,
          date: h.date,
          from: nameAddr(person(h.from)),
          to: h.to.map((k) => nameAddr(person(k))),
          cc: h.cc?.map((k) => person(k).email),
          subject: h.subject,
          thread_id: h.thread_id,
          in_reply_to: h.in_reply_to,
          labels: h.labels,
          reliability: h.reliability,
        },
      };
    }
    if (sp.kind === "news") return { ...common, kind: "news", header: { ...sp.header, language: spec.language } };
    return { ...common, kind: "doc", header: { ...sp.header, language: spec.language } };
  });

  const world: World = {
    slug: spec.slug,
    title: spec.title,
    company: spec.company.name,
    description: spec.company.description,
    language: spec.language,
    today: spec.today,
    tiers: spec.tiers.map((t) => t.id),
    people: spec.people.map((p) => ({ key: p.key, name: p.name, email: p.email, role: p.role })),
    banned: spec.banned,
    forbidden: forbiddenLiterals(spec, values),
    pieces,
  };
  return { world, spec, values, derivedText };
}
