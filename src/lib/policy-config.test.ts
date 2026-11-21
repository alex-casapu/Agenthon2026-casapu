import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PRINCIPALS, MAX_PRINCIPALS, canSee, principalIdFromCookieHeader, validatePrincipals, type Principal } from "./policy";
import { getPrincipal, getPrincipals, principalFromCookieHeader, principalsFile, trustByDefault, writePrincipals } from "./policy-config";
import { openDb, verify } from "./store";

const person = (id: string, over: Partial<Principal> = {}): Principal => ({ id, name: `Person ${id}`, role: "Role", clearances: ["public"], curator: false, ...over });
const THREE = [person("ann", { curator: true, clearances: ["*"] }), person("bob", { clearances: ["public", "finance"] }), person("cai")];

describe("validatePrincipals", () => {
  it("accepts one to three people with a curator", () => {
    expect(validatePrincipals(THREE)).toMatchObject({ ok: true });
    expect(validatePrincipals([person("solo", { curator: true })])).toMatchObject({ ok: true });
    const r = validatePrincipals([{ id: "x", name: " X ", role: " R ", clearances: ["public"], curator: true, suggestions: [" Q? "] }]);
    expect(r).toMatchObject({ ok: true, principals: [{ name: "X", role: "R", suggestions: ["Q?"] }] });
  });

  it(`refuses more than ${MAX_PRINCIPALS} principals`, () => {
    const four = [...THREE, person("dan")];
    const r = validatePrincipals(four);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.errors.join("\n")).toMatch(/at most 3 principals/);
  });

  it("refuses an empty list, a list without a curator, and non-lists", () => {
    expect(validatePrincipals([])).toMatchObject({ ok: false });
    const r = validatePrincipals([person("a"), person("b")]);
    expect(r.ok === false && r.errors.join()).toMatch(/must be a curator/);
    expect(validatePrincipals("nope")).toMatchObject({ ok: false, errors: ["principals must be a list"] });
    expect(validatePrincipals({})).toMatchObject({ ok: false });
  });

  it("refuses malformed entries, each with a reason", () => {
    const cases: [unknown, RegExp][] = [
      [{ ...person("A b"), curator: true }, /id must be/],
      [{ ...person("a"), name: " ", curator: true }, /name is required/],
      [{ ...person("a"), role: "", curator: true }, /role is required/],
      [{ ...person("a"), clearances: "public", curator: true }, /clearances must be a list/],
      [{ ...person("a"), clearances: ["Public!"], curator: true }, /clearances must be a list/],
      [{ ...person("a"), curator: "yes" }, /curator must be true or false/],
      [{ ...person("a"), curator: true, suggestions: "why" }, /suggestions must be up to 8/],
      [{ ...person("a"), curator: true, suggestions: Array(9).fill("q?") }, /suggestions must be up to 8/],
      [null, /must be an object/],
    ];
    for (const [entry, re] of cases) {
      const r = validatePrincipals([entry]);
      expect(r.ok, JSON.stringify(entry)).toBe(false);
      if (!r.ok) expect(r.errors.join("\n"), JSON.stringify(entry)).toMatch(re);
    }
    const dup = validatePrincipals([person("a", { curator: true }), person("a")]);
    expect(dup.ok === false && dup.errors.join()).toMatch(/duplicate id "a"/);
  });
});

describe("clearances still decide visibility for any cast", () => {
  it("applies to whoever the world defines", () => {
    const [ann, bob, cai] = THREE;
    expect(canSee(ann, ["finance", "hr"])).toBe(true);
    expect(canSee(bob, ["public", "finance"])).toBe(true);
    expect(canSee(bob, ["hr"])).toBe(false);
    expect(canSee(cai, ["finance"])).toBe(false);
  });
});

describe("loading the configuration", () => {
  let file: string;
  const saved = process.env.BRAIN_PRINCIPALS;
  beforeEach(() => {
    file = join(mkdtempSync(join(tmpdir(), "principals-")), "principals.json");
    process.env.BRAIN_PRINCIPALS = file;
  });
  afterEach(() => {
    process.env.BRAIN_PRINCIPALS = saved;
  });

  it("falls back to the default cast when there is no file", () => {
    expect(principalsFile()).toBe(file);
    expect(getPrincipals()).toBe(DEFAULT_PRINCIPALS);
  });

  it("reads a written configuration, and re-reads it when the file changes", async () => {
    writePrincipals(THREE);
    expect(getPrincipals().map((p) => p.id)).toEqual(["ann", "bob", "cai"]);
    expect(getPrincipal("bob")?.clearances).toEqual(["public", "finance"]);
    expect(getPrincipal("marta")).toBeNull(); // the default cast is gone once a world is loaded
    await new Promise((r) => setTimeout(r, 15));
    writePrincipals([person("zed", { curator: true })]);
    expect(getPrincipals().map((p) => p.id)).toEqual(["zed"]);
  });

  it("accepts a bare list or an object with a principals key", () => {
    writeFileSync(file, JSON.stringify({ principals: THREE }));
    expect(getPrincipals()).toHaveLength(3);
  });

  it("is loud about a bad file instead of quietly using the defaults", () => {
    writeFileSync(file, "{ not json");
    expect(() => getPrincipals()).toThrow(/is not valid JSON/);
    writeFileSync(file, JSON.stringify([person("a"), person("b"), person("c"), person("d")]));
    expect(() => getPrincipals()).toThrow(/at most 3 principals/);
  });

  it("writePrincipals validates before writing, and writes atomically", () => {
    expect(() => writePrincipals([person("a")])).toThrow(/must be a curator/);
    expect(() => readFileSync(file)).toThrow(); // nothing was written
    writePrincipals(THREE);
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveLength(3);
    expect(() => readFileSync(file + ".tmp")).toThrow();
  });

  it("resolves the acting principal from a cookie against the configured people", () => {
    writePrincipals(THREE);
    expect(principalFromCookieHeader("a=1; brain_principal=bob")?.name).toBe("Person bob");
    expect(principalFromCookieHeader("brain_principal=marta")).toBeNull(); // not in this world
    expect(principalIdFromCookieHeader("brain_principal=%E0%A4%A")).toBeNull(); // malformed encoding
    expect(principalIdFromCookieHeader("brain_principal=")).toBeNull();
  });

  it("starting a database records the configured principals; a new world adds new versions", () => {
    writePrincipals(THREE);
    const db = openDb(":memory:");
    expect(db.prepare("SELECT principal_id FROM principals ORDER BY principal_id").all()).toEqual([{ principal_id: "ann" }, { principal_id: "bob" }, { principal_id: "cai" }]);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });
});

describe("trustByDefault", () => {
  const saved = process.env.BRAIN_TRUST;
  afterEach(() => {
    if (saved === undefined) delete process.env.BRAIN_TRUST; else process.env.BRAIN_TRUST = saved;
  });
  it("is on unless explicitly switched off", () => {
    delete process.env.BRAIN_TRUST;
    expect(trustByDefault()).toBe(true);
    process.env.BRAIN_TRUST = "on";
    expect(trustByDefault()).toBe(true);
    process.env.BRAIN_TRUST = "";
    expect(trustByDefault()).toBe(true);
    process.env.BRAIN_TRUST = "off";
    expect(trustByDefault()).toBe(false);
  });
});
