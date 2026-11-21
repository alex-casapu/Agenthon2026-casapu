import { describe, expect, it } from "vitest";
import { loadSample } from "./sample";
import { listClaims, listSources, openDb, verify } from "./store";

describe("sample data", () => {
  it("loads sources and gate-passing claims and verifies clean", () => {
    const db = openDb(":memory:");
    expect(loadSample(db)).toEqual({ sources: 3, claims: 3 });
    expect(listSources(db)).toHaveLength(3);
    const claims = listClaims(db);
    expect(claims.map((c) => c.status)).toEqual(["proposed", "proposed", "proposed"]);
    expect(claims.map((c) => c.predicate_id).sort()).toEqual(["commitment", "supplier_price", "supplier_price"]);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("is idempotent", () => {
    const db = openDb(":memory:");
    loadSample(db);
    const entries = verify(db).entries;
    loadSample(db);
    expect(listClaims(db)).toHaveLength(3);
    expect(verify(db).entries).toBe(entries);
  });

  it("reads Italian number and date formats", () => {
    const db = openDb(":memory:");
    loadSample(db);
    const it = listClaims(db).find((c) => c.value.amount === 1250);
    expect(it?.valid_to).toBe("2027-01-15");
    expect(it?.grounding.amount.tier).toBe("literal");
  });
});
