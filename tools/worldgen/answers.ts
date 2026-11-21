import type { Compiled } from "./compile";

export interface AnswerItem {
  id: string;
  /** Moment of the demo flow the question is asked at. */
  when: string;
  role: string;
  question: string;
  /** answer: a cited answer; unknown: "I don't know"; denied: "not authorized". */
  expect: "answer" | "unknown" | "denied";
  /** Values the answer must contain, rendered from the facts and derived values. */
  mustInclude?: string[];
  /** Source ids the answer must cite. */
  cites?: string[];
  note?: string;
}

/**
 * The ground-truth answer key, built from the scenario. References (`fact:<id>`, `derived:<id>`) are
 * rendered by code from the facts ledger and the evaluated formulas, never written by hand.
 */
export function buildAnswerKey(c: Compiled) {
  const { spec, values, derivedText } = c;
  const factText = new Map(spec.facts.map((f) => [f.id, f.text]));
  const render = (ref: string): string =>
    ref.startsWith("fact:") ? (factText.get(ref.slice(5)) ?? ref) : ref.startsWith("derived:") ? (derivedText[ref.slice(8)] ?? ref) : ref;

  const items: AnswerItem[] = spec.questions.map((q) => ({
    id: q.id,
    when: q.when,
    role: q.role,
    question: q.question,
    expect: q.expect,
    mustInclude: q.include?.map(render),
    cites: q.cites,
    note: q.note,
  }));
  return {
    title: spec.title,
    company: spec.company.name,
    language: spec.language,
    today: spec.today,
    tiers: spec.tiers,
    roles: spec.roles,
    derived: spec.derived.map((d) => ({ id: d.id, label: d.label, formula: d.formula, value: values[d.id], text: derivedText[d.id], unit: d.unit })),
    items,
    adversarial: spec.adversarial,
  };
}
export type AnswerKey = ReturnType<typeof buildAnswerKey>;
