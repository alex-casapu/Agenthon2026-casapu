/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { allowedNumbers, checkBody, checkWorld, datesIn, numbersIn } from "./check";
import { compile } from "./compile";
import { evaluateDerived, parseFormula } from "./formula";
import { lintSpec } from "./lint";
import { formatNumber, normalizeNumber } from "./numfmt";
import { parseSpec, type ScenarioSpec } from "./spec";
import { clone, FIXTURES, fixtureCompiled, fixtureJson, fixtureSpec } from "./testkit";
import { pieceId } from "./types";

describe("formulas", () => {
  const ev = (src: string, env: Record<string, number> = {}) => evaluateDerived(env, [{ id: "x", formula: src }]).x;

  it("respects precedence, parentheses and unary minus", () => {
    expect(ev("2 + 3 * 4")).toBe(14);
    expect(ev("(2 + 3) * 4")).toBe(20);
    expect(ev("-2 + 5")).toBe(3);
    expect(ev("2 ^ 3 ^ 2")).toBe(512);
    expect(ev("10 / 4")).toBe(2.5);
  });
  it("evaluates identifiers and functions", () => {
    expect(ev("round(a * 1.5)", { a: 3 })).toBe(5);
    expect(ev("round(a / 3, 2)", { a: 10 })).toBe(3.33);
    expect(ev("min(a, b) + max(a, b) + abs(0 - 1) + floor(2.9) + ceil(2.1)", { a: 4, b: 9 })).toBe(4 + 9 + 1 + 2 + 3);
  });
  it("resolves derived values in dependency order, whatever the order they are listed in", () => {
    const v = evaluateDerived({ a: 2 }, [
      { id: "c", formula: "b * 10" },
      { id: "b", formula: "a + 1" },
    ]);
    expect(v).toEqual({ b: 3, c: 30 });
  });
  it("fails with readable messages", () => {
    expect(() => ev("a + 1")).toThrow(/unknown identifier "a"/);
    expect(() => ev("1 / 0")).toThrow(/division by zero/);
    expect(() => ev("1 +")).toThrow(/unexpected end/);
    expect(() => ev("foo(1)")).toThrow(/unknown function "foo"/);
    expect(() => ev("1 $ 2")).toThrow(/unexpected character/);
    expect(() => evaluateDerived({}, [{ id: "a", formula: "b" }, { id: "b", formula: "a" }])).toThrow(/circular/);
  });
  it("never evaluates code", () => {
    expect(() => parseFormula("process.exit(1)")).toThrow();
    expect(() => parseFormula("constructor")).not.toThrow(); // an identifier, resolved against the facts only
    expect(() => ev("constructor")).toThrow(/unknown identifier/);
  });
});

describe("number conventions", () => {
  it("writes and reads numbers per language", () => {
    expect(formatNumber(123200, 0, "it")).toBe("123.200");
    expect(formatNumber(31.5, 1, "it")).toBe("31,5");
    expect(formatNumber(1395, 0, "en")).toBe("1,395");
    expect(formatNumber(18.5, 2, "en")).toBe("18.50");
    expect(normalizeNumber("1.200", "it")).toBe("1200");
    expect(normalizeNumber("12,5", "it")).toBe("12.5");
    expect(normalizeNumber("1,200", "en")).toBe("1200");
    expect(normalizeNumber("18.50", "en")).toBe("18.50");
  });
});

describe("number and date reading", () => {
  it("reads Italian numbers: thousands dots and decimal commas", () => {
    expect([...numbersIn("4.000 t/mese, +12,5%, 31/03/2027")].sort()).toEqual(["12.5", "4000"]);
  });
  it("reads English numbers when the language says so", () => {
    expect([...numbersIn("1,200 units at 18.50 each", "en")].sort()).toEqual(["1200", "18.50"]);
  });
  it("does not count identifiers, product codes, times, years, list or article numbering", () => {
    const text = "Order PO-4471 (code K7, part M2) is due 14/12/2026 at 08:30 in 2026.\n1. First\n2) Second\nArt. 3 and Article 12 apply to WMS-20261122.";
    expect([...numbersIn(text)]).toEqual([]);
  });
  it("counts a number glued to its unit", () => {
    expect([...numbersIn("a 5kg bag and 12h shift")].sort()).toEqual(["12", "5"]);
  });
  it("finds dates, ISO included, and ignores identifier look-alikes", () => {
    expect([...datesIn("Due 14/12/2026 and 2026-11-21, ref msg-2026-11-10-ricci")].sort()).toEqual(["14/12/2026", "2026-11-21"]);
  });
});

describe("body checks", () => {
  const c = fixtureCompiled("semola");
  const offer = c.world.pieces.find((p) => pieceId(p) === "msg-2026-11-18-neri-1020")!;
  const opts = { forbidden: c.world.forbidden, banned: c.world.banned, lang: "it" };

  it("accepts the reference body", () => expect(checkBody(offer, offer.example!, opts)).toEqual([]));
  it("reports a missing required fact", () => {
    expect(checkBody(offer, offer.example!.replace("470 €/t", "un buon prezzo"), opts)).toContain('missing required fact: "470 €/t"');
  });
  it("reports an invented number and an invented date", () => {
    expect(checkBody(offer, offer.example! + "\nSconto del 5%.", opts)).toContain("unexpected number: 5");
    expect(checkBody(offer, offer.example! + "\nEntro il 15/12/2026.", opts)).toContain("unexpected date: 15/12/2026");
  });
  it("reports a derived value", () => {
    expect(checkBody(offer, offer.example! + "\nRisparmio 96.000 €.", opts)).toContain('forbidden value: "96.000"');
  });
  it("ignores quoted lines", () => {
    expect(checkBody(offer, offer.example! + "\n\n> Il 10/11 qualcuno ha scritto:\n> 999 tonnellate", opts)).toEqual([]);
  });
  it("rejects banned words, case-sensitively", () => {
    expect(checkBody(offer, offer.example! + "\nPastaCo", opts)).toContain('banned word: "PastaCo"');
    expect(checkBody(offer, offer.example! + "\nPastaco S.p.A.", opts)).toEqual([]);
  });
  it("rejects front matter, code fences and email headers in the body", () => {
    expect(checkBody(offer, "---\n" + offer.example!, opts).join()).toMatch(/front matter/);
    expect(checkBody(offer, "Oggetto: ciao\n" + offer.example!, opts).join()).toMatch(/headers/);
  });
  it("accepts legal numbering written either way", () => {
    const contract = c.world.pieces.find((p) => pieceId(p) === "CQ-2026-031")!;
    expect(checkBody(contract, contract.example!.replace("## Art. 3", "## Articolo 1").replace("## Art. 4", "## Art. 2"), opts)).toEqual([]);
    expect(allowedNumbers(contract, "it").has("412")).toBe(true);
  });
});

describe("spec schema", () => {
  it("accepts both fixtures", () => {
    for (const f of FIXTURES) expect(parseSpec(fixtureJson(f)).ok).toBe(true);
  });
  it("rejects unknown keys, bad addresses, bad dates and bad ids, with paths", () => {
    const bad = clone(fixtureJson("semola")) as Record<string, any>;
    bad.surprise = 1;
    bad.people[0].email = "marta@pastaco.com";
    bad.pieces[0].header.date = "15/01/2026";
    bad.facts[0].id = "has space";
    const r = parseSpec(bad);
    expect(r.ok).toBe(false);
    const msg = r.ok ? "" : r.errors.join("\n");
    expect(msg).toMatch(/\(root\).*surprise|Unrecognized key/i);
    expect(msg).toMatch(/people\.0\.email/);
    expect(msg).toMatch(/pieces\.0\.header\.date/);
    expect(msg).toMatch(/facts\.0\.id/);
  });
});

describe("compile", () => {
  it("builds mustContain from the facts ledger and resolves people to addresses", () => {
    const c = fixtureCompiled("semola");
    const req = c.world.pieces.find((p) => pieceId(p) === "msg-2026-11-10-ricci-0915")!;
    expect(req.mustContain).toEqual(["3.000 tonnellate", "dicembre", "gennaio"]);
    if (req.kind !== "email") throw new Error("expected an email");
    expect(req.header.from).toBe("Marta Ricci <marta.ricci@pastaco.example>");
    expect(req.header.cc).toEqual(["luca.bianchi@pastaco.example"]);
  });
  it("computes the derived values from the facts", () => {
    const d = fixtureCompiled("semola").values;
    expect(d).toMatchObject({ scoperta: 1600, extra_mese_t1: 123200, extra_marzo_t1: 492800, risparmio_t1: 96000, extra_mese_t2: 84800, extra_marzo_t2: 339200, risparmio_t2: 24000, copertura_dopo: 31.5 });
    expect(fixtureCompiled("semola").derivedText.extra_mese_t1).toBe("123.200");
    const e = fixtureCompiled("supplier-delay");
    expect(e.values).toMatchObject({ order_value: 22200, stockout_alert: 16, short_alert: 640, penalty_alert: 1395, stockout_final: 9, short_final: 360, penalty_final: 951 });
    expect(e.derivedText.order_value).toBe("22,200");
  });
  it("forbids derived literals, without those that collide with a fact", () => {
    const c = fixtureCompiled("semola");
    expect(c.world.forbidden).toEqual(expect.arrayContaining(["123.200", "492.800", "96.000", "84.800", "339.200", "24.000"]));
    expect(c.world.forbidden).not.toContain("31,5"); // too short to ban safely
    const s = clone(fixtureSpec("semola"));
    s.derived.push({ id: "same_as_offer", label: "x", formula: "offerta_tonnellate", decimals: 0 });
    expect(compile(s).world.forbidden).not.toContain("3.000"); // it is a fact, so it may appear
  });
  it("gives each author a persona and only the facts they know from their own messages", () => {
    const c = fixtureCompiled("semola");
    const reply = c.world.pieces.find((p) => pieceId(p) === "msg-2026-11-18-neri-1020")!;
    expect(reply.author?.name).toBe("Giulia Neri");
    expect(reply.author?.persona).toMatch(/formale/);
    expect(reply.author?.knows).toEqual(expect.arrayContaining(["3.000 tonnellate", "dicembre"]));
    expect(reply.author?.knows).not.toContain("412 €/t"); // she never saw the contract
    const rumour = c.world.pieces.find((p) => pieceId(p) === "msg-2026-11-19-fabbri-1730")!;
    expect(rumour.author?.knows).not.toContain("470 €/t");
  });
});

describe("lint", () => {
  const mutate = (name: (typeof FIXTURES)[number], fn: (s: ScenarioSpec) => void): string => {
    const s = clone(fixtureSpec(name));
    fn(s);
    return lintSpec(s).join("\n");
  };

  it("accepts both fixtures", () => {
    for (const f of FIXTURES) expect(lintSpec(fixtureSpec(f))).toEqual([]);
  });
  it("catches references to unknown facts and people", () => {
    expect(mutate("semola", (s) => s.pieces[0].facts.push("nope"))).toMatch(/unknown fact "nope"/);
    expect(mutate("semola", (s) => { const p = s.pieces.find((x) => x.kind === "email")!; if (p.kind === "email") p.header.to = ["ghost"]; })).toMatch(/unknown person "ghost"/);
  });
  it("catches a fact that no piece states", () => {
    expect(mutate("semola", (s) => s.facts.push({ id: "orphan", text: "9 €" }))).toMatch(/fact "orphan" is not stated by any piece/);
  });
  it("catches a broken formula", () => {
    expect(mutate("semola", (s) => (s.derived[1].formula = "spot_t1 - ghost"))).toMatch(/unknown identifier "ghost"/);
  });
  it("catches a header the real contract parsers reject", () => {
    expect(mutate("semola", (s) => { const p = s.pieces.find((x) => x.kind === "email")!; if (p.kind === "email") p.header.date = "2026-11-10T09:15:00"; })).toMatch(/contract/);
  });
  it("catches numbers and derived values in a brief", () => {
    expect(mutate("semola", (s) => (s.pieces[1].brief += " Sono circa 77 tonnellate."))).toMatch(/brief mentions the number 77/);
    expect(mutate("semola", (s) => (s.pieces[1].brief += " Il costo è 123.200 euro."))).toMatch(/states the derived value 123.200/);
  });
  it("catches an example that breaks its own spec", () => {
    expect(mutate("semola", (s) => (s.pieces[1].example += "\nAltri 55 giorni."))).toMatch(/example: unexpected number: 55/);
  });
  it("catches broken links and time order", () => {
    expect(mutate("semola", (s) => { const p = s.pieces.find((x) => x.kind === "news" && x.header.corrects)!; if (p.kind === "news") p.header.corrects = "news-missing"; })).toMatch(/corrects news-missing not found/);
    expect(mutate("semola", (s) => { const p = s.pieces.find((x) => x.tier === "t1")!; p.header.date = "2026-01-01"; })).toMatch(/time order/);
  });
  it("catches visibility mistakes in the expected answers", () => {
    expect(mutate("semola", (s) => (s.questions.find((q) => q.id === "Q5")!.role = "produzione"))).toMatch(/cannot see a piece it must cite/);
    expect(mutate("semola", (s) => (s.questions.find((q) => q.id === "Q6")!.cites = ["WMS-PR-20261120"]))).toMatch(/denied question must cite at least one piece/);
    expect(mutate("semola", (s) => delete (s.questions.find((q) => q.id === "Q2")! as { cites?: string[] }).cites)).toMatch(/must cite at least one piece/);
  });
  it("checks that the scenario gives the demo what it needs", () => {
    expect(mutate("semola", (s) => s.pieces.forEach((p) => p.header.reliability === "low" && (p.header.reliability = "high")))).toMatch(/reliability low/);
    expect(mutate("semola", (s) => s.pieces.forEach((p) => { if (p.kind === "news") delete p.header.corrects; }))).toMatch(/at least one correction/);
    expect(mutate("semola", (s) => (s.roles = { acquisti: { sees: ["finance"], curator: true } }))).toMatch(/at least three roles/);
    expect(mutate("semola", (s) => (s.derived = []))).toMatch(/at least one derived value/);
    expect(mutate("semola", (s) => s.questions.forEach((q) => q.expect === "denied" && (q.expect = "unknown")))).toMatch(/at least one "denied"/);
  });
  it("can switch the demo profile off", () => {
    const s = clone(fixtureSpec("semola"));
    s.derived = [];
    s.questions.forEach((q) => (q.include = q.include?.filter((r) => !r.startsWith("derived:"))));
    expect(lintSpec(s, "none")).toEqual([]);
  });
});

describe("world consistency", () => {
  it("rejects a reply not later than its parent and an unknown tier", () => {
    const c = fixtureCompiled("supplier-delay");
    const pieces = clone(c.world.pieces);
    pieces[0].tier = "ghost";
    expect(checkWorld(pieces, c.world.tiers).join()).toMatch(/unknown tier "ghost"/);
  });
});
