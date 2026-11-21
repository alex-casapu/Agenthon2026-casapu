import { validatePrincipals, type Principal } from "../../src/lib/policy";
import type { ScenarioSpec } from "./spec";

/**
 * The people who use the system in this world, derived from the scenario: for every access role, the one
 * internal person marked with that role. At most three (the spec allows no more roles). A curator reads
 * everything; the others read `public` plus the labels their role sees. Their starter questions are the
 * scenario's expected questions for that role, so the chat opens with questions the answer key covers.
 */
export function principalsOf(spec: ScenarioSpec): Principal[] {
  const out: Principal[] = [];
  for (const [role, r] of Object.entries(spec.roles)) {
    const people = spec.people.filter((p) => p.access === role);
    if (people.length !== 1) throw new Error(`role "${role}" needs exactly one person with access: "${role}" (found ${people.length})`);
    const p = people[0];
    const qs = spec.questions.filter((q) => q.role === role);
    const picked = [
      ...qs.filter((q) => q.expect === "answer").slice(0, 3),
      ...qs.filter((q) => q.expect === "unknown").slice(0, 1),
      ...qs.filter((q) => q.expect === "denied").slice(0, 1),
    ];
    out.push({
      id: p.key.toLowerCase(),
      name: p.name,
      role: p.role,
      clearances: r.curator ? ["*"] : ["public", ...r.sees],
      curator: r.curator === true,
      suggestions: picked.map((q) => q.question.slice(0, 200)),
    });
  }
  const v = validatePrincipals(out);
  if (!v.ok) throw new Error(`the scenario does not make a valid principals configuration:\n  ${v.errors.join("\n  ")}`);
  return v.principals;
}
