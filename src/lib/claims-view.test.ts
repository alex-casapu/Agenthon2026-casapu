import { beforeEach, describe, expect, it } from "vitest";
import { listClaimViews, prettyEntity, sentenceFor } from "./claims-view";
import { loadSample } from "./sample";
import { admitEntity, insertSource, openDb, reviewClaim, submitClaim, type DB } from "./store";

describe("prettyEntity", () => {
  it("turns entity ids into names", () => {
    expect(prettyEntity("ent:molino_rossi")).toBe("Molino Rossi");
    expect(prettyEntity("ent:farina_00")).toBe("Farina 00");
    expect(prettyEntity("plain text")).toBe("Plain Text");
    expect(prettyEntity(undefined)).toBe("?");
    expect(prettyEntity("ent:")).toBe("?");
  });
});

describe("sentenceFor", () => {
  it("renders each predicate in plain language", () => {
    expect(sentenceFor("supplier_price", { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t", price_type: "offer", min_volume: 800, valid_to: "2026-12-31" })).toBe(
      "Molino Rossi prices Durum Semolina at 412 EUR/t (offer, minimum order 800 t, valid until 2026-12-31)",
    );
    expect(sentenceFor("supplier_price", { supplier: "ent:a", item: "ent:b", amount: 1250, currency: "EUR", per: "t", volume: 3000, coverage_pct: 60 })).toBe(
      "A prices B at 1,250 EUR/t (for 3,000 t, covers 60% of needs)",
    );
    expect(sentenceFor("spot_price", { item: "ent:durum_semolina", market: "Foggia", amount: 502, currency: "EUR", per: "t", change_pct: 18, period: "last 3 weeks" })).toBe(
      "Market price of Durum Semolina (Foggia) is 502 EUR/t, +18% — last 3 weeks",
    );
    expect(sentenceFor("spot_price", { item: "ent:x", amount: 400, currency: "EUR", per: "t", change_pct: -3 })).toBe("Market price of X is 400 EUR/t, -3%");
    expect(sentenceFor("demand", { item: "ent:durum_semolina", site: "ent:parma", amount: 4000, unit: "t", period: "month" })).toBe("Parma needs 4,000 t of Durum Semolina per month");
    expect(sentenceFor("demand", { item: "ent:x", amount: 1, unit: "kg", period: "week" })).toBe("Requirement needs 1 kg of X per week");
    expect(sentenceFor("stock_coverage", { item: "ent:semola", site: "ent:parma", days: 9, as_of: "2026-11-20" })).toBe("Parma holds 9 days of Semola as of 2026-11-20");
    expect(sentenceFor("stock_coverage", { item: "ent:semola", site: "ent:parma", days: 9 })).toBe("Parma holds 9 days of Semola");
    expect(sentenceFor("commitment", { owner: "ent:marketing", counterparty: "ent:retailer", action: "ship 40 pallets", due: "2027-02-10" })).toBe("Marketing commits to ship 40 pallets for Retailer, by 2027-02-10");
    expect(sentenceFor("commitment", { owner: "ent:us", action: "reply" })).toBe("Us commits to reply");
    expect(sentenceFor("statement", { text: "Ciao." })).toBe("Ciao.");
  });

  it("falls back to a generic line for unknown predicates", () => {
    expect(sentenceFor("mystery", { a: 1, b: "x" })).toBe("mystery: a=1, b=x");
  });
});

describe("listClaimViews", () => {
  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    loadSample(db);
  });

  it("returns every claim, newest first, with sentence, fields, quotes and source details", () => {
    const views = listClaimViews(db);
    expect(views).toHaveLength(3);
    const it = views.find((v) => v.sentence.includes("Molino Bianchi"))!;
    expect(it.sentence).toBe("Molino Bianchi S.r.l. prices Durum semolina at 1,250 EUR/t (minimum order 500 t, valid until 2027-01-15)");
    expect(it.predicate_id).toBe("supplier_price");
    expect(it.predicate_version).toBe(2);
    expect(it.status).toBe("proposed");
    expect(it.valid_to).toBe("2027-01-15");

    const byName = Object.fromEntries(it.fields.map((f) => [f.name, f]));
    expect(byName.amount).toMatchObject({ value: 1250, tier: "literal" });
    expect(byName.currency).toMatchObject({ tier: "resolved", resolver: "currency@1" });
    expect(byName.supplier.tier).toBe("interpretive");
    expect(byName.valid_to).toMatchObject({ value: "2027-01-15", tier: "resolved", resolver: "date@1" });
    expect(byName.amount.quote_id).toBe(it.evidence[0].quote_id);

    const e = it.evidence[0];
    expect(e.text).toContain("1.250,00");
    expect(e.before).toContain("Buongiorno");
    expect(e.after).toContain("Cordiali saluti");
    expect(e.source).toMatchObject({ kind: "email", external_id: "sample-it-1", author: "luca@molinobianchi.example", occurred_at: "2026-11-03T08:40:00Z", labels: ["public"] });
    expect(it.extractor).toEqual({ type: "manual" });
    expect(it.history).toMatchObject([{ type: "proposed", actor: "human:manual" }]);
    expect(it.raw.grounding).toBeTruthy();
  });

  it("follows status and history after review, newest claim first", () => {
    const [first] = listClaimViews(db);
    reviewClaim(db, first.claim_id, "approved", "human:marta", "looks right");
    const after = listClaimViews(db).find((v) => v.claim_id === first.claim_id)!;
    expect(after.status).toBe("approved");
    expect(after.history.map((h) => h.type)).toEqual(["proposed", "approved"]);
    expect(after.history[1]).toMatchObject({ actor: "human:marta", reason: "looks right" });
    const created = listClaimViews(db).map((v) => v.created_at);
    expect([...created].sort().reverse()).toEqual(created);
  });

  it("clips context at the ends of the source and keeps multi-byte text intact", () => {
    const sid = insertSource(db, { kind: "news", external_id: "n9", occurred_at: "2026-11-21T07:00:00Z", raw: "🍝 prezzo 502 €/t 🍝", meta: { title: "T", domain: "x.example", reliability: "low" } }).source_id;
    submitClaim(db, { predicate_id: "statement", fields: { text: "Prezzo." }, evidence: [{ source_id: sid, quote: "prezzo 502 €/t" }] });
    const v = listClaimViews(db).find((c) => c.evidence[0]?.source.external_id === "n9")!;
    expect(v.evidence[0]).toMatchObject({ before: "🍝 ", after: " 🍝", text: "prezzo 502 €/t" });
    expect(v.evidence[0].source).toMatchObject({ title: "T", domain: "x.example", reliability: "low", kind: "news" });
  });

  it("an empty database has no claims", () => {
    expect(listClaimViews(openDb(":memory:"))).toEqual([]);
  });

  it("names entities as the sources do, not as a prettified id", () => {
    db = openDb(":memory:"); // nothing seeded: every name is discovered
    const sid = insertSource(db, { kind: "email", external_id: "nm", author: "luca@mulino-santa-chiara.example", occurred_at: "2026-11-23T08:00:00Z", raw: "Il prezzo della semola di grano duro è 480 €/t, fisso fino al 31 dicembre." }).source_id;
    admitEntity(db, { name: "Mulino Santa Chiara S.r.l.", kind: "organization" }, sid);
    admitEntity(db, { name: "semola di grano duro", kind: "item", quote: "della semola di grano duro è 480 €/t" }, sid);
    submitClaim(db, {
      predicate_id: "supplier_price",
      fields: { supplier: "ent:mulino_santa_chiara", item: "ent:semola_di_grano_duro", amount: 480, currency: "EUR", per: "t" },
      evidence: [{ source_id: sid, quote: "della semola di grano duro è 480 €/t" }],
    });
    const v = listClaimViews(db).find((c) => c.sentence.includes("480"))!;
    expect(v.sentence).toBe("Mulino Santa Chiara S.r.l. prices semola di grano duro at 480 EUR/t");
    // an id nobody registered still reads sensibly
    expect(sentenceFor("demand", { item: "ent:unregistered_thing", amount: 1, unit: "t", period: "month" }, (v) => `<${v}>`)).toBe("Requirement needs 1 t of <ent:unregistered_thing> per month");
  });
});
