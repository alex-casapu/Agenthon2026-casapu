import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getPrincipals } from "../../src/lib/policy-config";
import { compile } from "./compile";
import { checkDir, checkPrincipals, loadPrincipals, PRINCIPALS_FILE, readSpec, writeWorld, writeWorldPrincipals } from "./files";
import { generateWorld } from "./generate";
import { lintSpec } from "./lint";
import { buildPlannerPrompt } from "./planner";
import { principalsOf } from "./principals";
import type { ScenarioSpec } from "./spec";
import { ExampleWriter } from "./writer";
import { clone, fixtureSpec, FIXTURES } from "./testkit";

const lint = (s: ScenarioSpec) => lintSpec(s).join("\n");

describe("principalsOf: the people who use the system", () => {
  it("is one person per access role, with the role's clearances and curator flag", () => {
    const p = principalsOf(fixtureSpec("semola"));
    expect(p.map((x) => x.id)).toEqual(["marta", "luca", "sara"]);
    expect(p[0]).toMatchObject({ name: "Marta Ricci", role: "Acquisti", clearances: ["*"], curator: true });
    expect(p[1]).toMatchObject({ name: "Luca Bianchi", clearances: ["public", "finance"], curator: false });
    expect(p[2]).toMatchObject({ clearances: ["public"], curator: false });
  });

  it("takes suggestions from the scenario's expected questions for that role", () => {
    const spec = fixtureSpec("semola");
    for (const person of principalsOf(spec)) {
      const role = spec.people.find((x) => x.key === person.id)!.access!;
      const asked = spec.questions.filter((q) => q.role === role).map((q) => q.question.slice(0, 200));
      expect(person.suggestions!.length).toBeGreaterThan(0);
      expect(person.suggestions!.length).toBeLessThanOrEqual(5);
      for (const q of person.suggestions!) expect(asked).toContain(q);
    }
  });

  it("works for every fixture, in either language, never more than three", () => {
    for (const name of FIXTURES) {
      const p = principalsOf(fixtureSpec(name));
      expect(p).toHaveLength(3);
      expect(p.filter((x) => x.curator)).toHaveLength(1);
    }
  });

  it("refuses a role nobody acts as, or two people acting as the same role", () => {
    const none = clone(fixtureSpec("semola"));
    delete none.people.find((p) => p.key === "luca")!.access;
    expect(() => principalsOf(none)).toThrow(/role "finance" needs exactly one person.*found 0/);
    const two = clone(fixtureSpec("semola"));
    two.people.find((p) => p.key === "roberto")!.access = "finance";
    expect(() => principalsOf(two)).toThrow(/found 2/);
  });

  it("truncates a very long question so the configuration stays valid", () => {
    const spec = clone(fixtureSpec("semola"));
    spec.questions.find((q) => q.expect === "answer")!.question = "Q" + "x".repeat(400);
    for (const person of principalsOf(spec)) for (const q of person.suggestions!) expect(q.length).toBeLessThanOrEqual(200);
  });
});

describe("lint: roles and who acts as them", () => {
  it("accepts the fixtures", () => {
    for (const name of FIXTURES) expect(lintSpec(fixtureSpec(name))).toEqual([]);
  });

  it("allows at most three roles, in every profile", () => {
    const s = clone(fixtureSpec("semola"));
    s.roles.extra = { sees: [] };
    expect(lintSpec(s, "none").join("\n")).toMatch(/at most three roles/);
    expect(lint(s)).toMatch(/exactly three roles/);
  });

  it("requires exactly three roles, each with an internal person acting as it", () => {
    const fewer = clone(fixtureSpec("semola"));
    delete fewer.roles.produzione;
    for (const p of fewer.people) if (p.access === "produzione") delete p.access;
    expect(lint(fewer)).toMatch(/exactly three roles/);
    const noPerson = clone(fixtureSpec("semola"));
    delete noPerson.people.find((p) => p.access === "finance")!.access;
    expect(lint(noPerson)).toMatch(/role "finance" needs one internal person with access: "finance"/);
  });

  it("rejects an access that is not a role, and two people with the same access", () => {
    const bad = clone(fixtureSpec("semola"));
    bad.people.find((p) => p.key === "roberto")!.access = "ghost";
    expect(lint(bad)).toMatch(/"roberto" has access "ghost", which is not a role/);
    const dup = clone(fixtureSpec("semola"));
    dup.people.find((p) => p.key === "roberto")!.access = "acquisti";
    expect(lint(dup)).toMatch(/more than one person has access "acquisti"/);
  });

  it("outside people have no access and that is fine", () => {
    const spec = fixtureSpec("semola");
    expect(spec.people.filter((p) => p.access === undefined).map((p) => p.key)).toEqual(["roberto", "giulia"]);
    expect(lintSpec(spec)).toEqual([]);
  });
});

describe("the planner is told about it", () => {
  it("asks for exactly three roles and one internal person per role", () => {
    const { user } = buildPlannerPrompt({ text: "Un aumento di prezzo", language: "it" });
    expect(user).toContain("ESATTAMENTE tre ruoli");
    expect(user).toContain('access? (la chiave del ruolo di accesso)');
    expect(user).toContain("Le persone esterne (fornitori, giornalisti, clienti) non hanno \"access\"");
    expect(user).toContain("Esattamente tre ruoli di accesso");
  });
});

describe("exporting and loading principals.json", () => {
  const saved = process.env.BRAIN_PRINCIPALS;
  let target: string;
  beforeEach(() => {
    target = join(mkdtempSync(join(tmpdir(), "app-config-")), "principals.json");
    process.env.BRAIN_PRINCIPALS = target;
  });
  afterEach(() => {
    process.env.BRAIN_PRINCIPALS = saved;
  });

  it("writeWorld writes it next to the scenario, and the world still checks out", async () => {
    const c = compile(fixtureSpec("semola"));
    const dir = mkdtempSync(join(tmpdir(), "world-"));
    writeWorld(c, await generateWorld(c.world, { writer: new ExampleWriter(c.world.pieces) }), dir, { writer: "test" });
    expect(JSON.parse(readFileSync(join(dir, PRINCIPALS_FILE), "utf8"))).toEqual(principalsOf(c.spec));
    expect(checkDir(c.world, dir)).toEqual([]);
    expect(checkPrincipals(c.spec, dir)).toEqual([]);
    expect(readFileSync(join(dir, "SUMMARY.md"), "utf8")).toMatch(/\| Persona \| Ruolo \| Accesso \| Voce \|/);
  });

  it("checkPrincipals notices a missing, unreadable or out-of-date file", () => {
    const spec = fixtureSpec("semola");
    const dir = mkdtempSync(join(tmpdir(), "world-"));
    expect(checkPrincipals(spec, dir).join()).toMatch(/is missing/);
    writeFileSync(join(dir, PRINCIPALS_FILE), "{ nope");
    expect(checkPrincipals(spec, dir).join()).toMatch(/not valid JSON/);
    writeFileSync(join(dir, PRINCIPALS_FILE), JSON.stringify([{ id: "x" }]));
    expect(checkPrincipals(spec, dir).join()).toMatch(/does not match the scenario/);
    const noAccess = clone(spec);
    delete noAccess.people.find((p) => p.access === "finance")!.access;
    expect(checkPrincipals(noAccess, dir).join()).toMatch(/needs exactly one person/);
  });

  it("loadPrincipals makes the world's people the system's principals", () => {
    const dir = mkdtempSync(join(tmpdir(), "world-"));
    writeFileSync(join(dir, "scenario.json"), JSON.stringify(fixtureSpec("supplier-delay")));
    expect(existsSync(target)).toBe(false);
    const list = loadPrincipals(dir); // computed from the scenario when principals.json is absent
    expect(list.map((p) => p.id)).toEqual(["dana", "tom", "priya"]);
    expect(getPrincipals().map((p) => p.name)).toEqual(["Dana Hughes", "Tom Reyes", "Priya Nair"]);
    expect(JSON.parse(readFileSync(target, "utf8"))).toHaveLength(3);
  });

  it("refuses to load a configuration the app would not accept", () => {
    const dir = mkdtempSync(join(tmpdir(), "world-"));
    writeFileSync(join(dir, "scenario.json"), JSON.stringify(fixtureSpec("semola")));
    writeFileSync(join(dir, PRINCIPALS_FILE), JSON.stringify([{ id: "a", name: "A", role: "R", clearances: ["public"] }]));
    expect(() => loadPrincipals(dir)).toThrow(/must be a curator/);
    expect(existsSync(target)).toBe(false);
  });

  it("writeWorldPrincipals regenerates it from an existing scenario", () => {
    const dir = mkdtempSync(join(tmpdir(), "world-"));
    writeFileSync(join(dir, "scenario.json"), JSON.stringify(fixtureSpec("semola")));
    const list = writeWorldPrincipals(dir);
    expect(list).toHaveLength(3);
    expect(checkPrincipals(readSpec(join(dir, "scenario.json")), dir)).toEqual([]);
  });
});

describe("the committed worlds", () => {
  const root = join(__dirname, "..", "..", "worlds");
  // A world directory without principals.json is not finished (or predates the export): world:check flags it.
  // Work in progress is not this test's business, so it covers the worlds that have exported theirs.
  const exported = readdirSync(root).filter((d) => existsSync(join(root, d, PRINCIPALS_FILE)));

  it("includes the two committed worlds", () => {
    expect(exported).toEqual(expect.arrayContaining(["semola-prezzo-in-rialzo", "customs-delay-power-modules"]));
  });

  it("each exports at most three principals, one curator, matching its scenario", () => {
    for (const w of exported) {
      const spec = readSpec(join(root, w, "scenario.json"));
      expect(lintSpec(spec), w).toEqual([]);
      expect(checkPrincipals(spec, join(root, w)), w).toEqual([]);
      const list = JSON.parse(readFileSync(join(root, w, PRINCIPALS_FILE), "utf8")) as { curator: boolean }[];
      expect(list.length, w).toBeLessThanOrEqual(3);
      expect(list.filter((p) => p.curator), w).toHaveLength(1);
    }
  });
});
