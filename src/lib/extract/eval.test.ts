import { describe, expect, it } from "vitest";
import { insertSource, listClaims, openDb, submitClaim } from "../store";
import { flattenClaim, matches, scoreSource } from "./eval";

const setup = () => {
  const db = openDb(":memory:");
  const sid = insertSource(db, { kind: "news", external_id: "n", occurred_at: "2026-11-21T07:00:00Z", raw: "Il prezzo spot della semola è salito a 502 €/t, +18% in tre settimane, valida fino al 31 dicembre." }).source_id;
  submitClaim(db, {
    predicate_id: "spot_price",
    evidence: [{ source_id: sid, quote: "salito a 502 €/t, +18% in tre settimane" }],
    fields: { item: "ent:durum_semolina", amount: 502, currency: "EUR", per: "t", change_pct: 18 },
  });
  submitClaim(db, { predicate_id: "statement", evidence: [{ source_id: sid, quote: "valida fino al 31 dicembre" }], fields: { text: "Validità fino al 31 dicembre." } });
  return listClaims(db);
};

describe("eval scoring", () => {
  it("flattens slots back into named fields", () => {
    const spot = setup().find((c) => c.predicate_id === "spot_price")!;
    expect(flattenClaim(spot)).toMatchObject({ item: "ent:durum_semolina", amount: 502, currency: "EUR", per: "t", change_pct: 18 });
  });

  it("matches on predicate, exact fields and quote text", () => {
    const [stmt, spot] = (() => { const c = setup(); return [c.find((x) => x.predicate_id === "statement")!, c.find((x) => x.predicate_id === "spot_price")!]; })();
    expect(matches(spot, { predicate: "spot_price", fields: { amount: 502, change_pct: 18 } })).toBe(true);
    expect(matches(spot, { predicate: "spot_price", fields: { amount: 503 } })).toBe(false);
    expect(matches(spot, { predicate: "supplier_price", fields: { amount: 502 } })).toBe(false);
    expect(matches(stmt, { predicate: "statement", quoteIncludes: "31 dicembre" })).toBe(true);
    expect(matches(stmt, { predicate: "statement", quoteIncludes: "Foggia" })).toBe(false);
    expect(matches(spot, { predicate: "spot_price", fields: { as_of: "2026-01-01" } })).toBe(false);
  });

  it("scores recall, extras and forbidden claims", () => {
    const claims = setup();
    const s = scoreSource(claims, {
      expect: [{ predicate: "spot_price", fields: { amount: 502 } }, { predicate: "demand", fields: { amount: 4000 } }],
      forbid: [{ predicate: "statement" }],
    });
    expect(s).toMatchObject({ expected: 2, found: 1 });
    expect(s.missing).toEqual([{ predicate: "demand", fields: { amount: 4000 } }]);
    expect(s.extras.map((c) => c.predicate_id)).toEqual(["statement"]);
    expect(s.forbiddenHits).toHaveLength(1);
  });

  it("one claim may satisfy several expectations", () => {
    const claims = setup().filter((c) => c.predicate_id === "spot_price");
    const s = scoreSource(claims, { expect: [{ predicate: "spot_price", fields: { amount: 502 } }, { predicate: "spot_price", fields: { change_pct: 18 } }] });
    expect(s).toMatchObject({ expected: 2, found: 2 });
    expect(s.extras).toHaveLength(0);
  });

  it("anyOf accepts alternatives and allow exempts acceptable extras", () => {
    const claims = setup();
    const s = scoreSource(claims, {
      expect: [{ anyOf: [{ predicate: "demand", fields: { amount: 1 } }, { predicate: "spot_price", fields: { amount: 502 } }] }],
      allow: [{ predicate: "statement", quoteIncludes: "31 dicembre" }],
    });
    expect(s).toMatchObject({ expected: 1, found: 1 });
    expect(s.extras).toHaveLength(0);
    expect(scoreSource(claims, { expect: [{ anyOf: [{ predicate: "demand" }, { predicate: "commitment" }] }] }).found).toBe(0);
  });
});
