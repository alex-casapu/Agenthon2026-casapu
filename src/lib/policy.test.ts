import { describe, expect, it } from "vitest";
import { listClaimViews, visibleTo, claimLabels } from "./claims-view";
import { PRINCIPALS, canSee, getPrincipal, principalFromCookieHeader } from "./policy";
import { insertSource, openDb, submitClaim, type DB } from "./store";

const marta = getPrincipal("marta")!;
const luca = getPrincipal("luca")!;
const sara = getPrincipal("sara")!;

describe("canSee", () => {
  it("clears a principal for a claim only if every label is within its clearances", () => {
    expect(canSee(sara, ["public"])).toBe(true);
    expect(canSee(sara, ["finance"])).toBe(false);
    expect(canSee(sara, ["public", "finance"])).toBe(false); // the join of labels: one restricted source is enough
    expect(canSee(luca, ["public", "finance"])).toBe(true);
    expect(canSee(luca, ["hr"])).toBe(false);
    expect(canSee(marta, ["public", "finance", "hr", "anything"])).toBe(true);
  });

  it("treats a claim with no labels as restricted, never as public", () => {
    expect(canSee(sara, [])).toBe(false);
    expect(canSee(luca, [])).toBe(false);
    expect(canSee(marta, [])).toBe(true);
  });
});

describe("principals", () => {
  it("are unique, and only Purchasing curates", () => {
    expect(new Set(PRINCIPALS.map((p) => p.id)).size).toBe(PRINCIPALS.length);
    expect(PRINCIPALS.filter((p) => p.curator).map((p) => p.id)).toEqual(["marta"]);
    expect(getPrincipal("nobody")).toBeNull();
    expect(getPrincipal(null)).toBeNull();
  });

  it("are read from the cookie header; anything else is god mode (null)", () => {
    expect(principalFromCookieHeader("brain_principal=sara")?.id).toBe("sara");
    expect(principalFromCookieHeader("a=1; brain_principal=luca; b=2")?.id).toBe("luca");
    expect(principalFromCookieHeader("brain_principal=%6Carta")).toBeNull(); // not a real id once decoded
    expect(principalFromCookieHeader("brain_principal=marta")?.curator).toBe(true);
    expect(principalFromCookieHeader("brain_principal=nobody")).toBeNull();
    expect(principalFromCookieHeader("brain_principal=")).toBeNull();
    expect(principalFromCookieHeader("xbrain_principal=sara")).toBeNull();
    expect(principalFromCookieHeader(null)).toBeNull();
    expect(principalFromCookieHeader("")).toBeNull();
  });
});

const PUBLIC = "Il prezzo spot della semola è di 425 €/t, media nazionale.";
const FINANCE = "Il contratto quadro fissa il prezzo a 412 €/t per il 60% del fabbisogno.";

function build(extra: boolean): DB {
  const db = openDb(":memory:");
  const pub = insertSource(db, { kind: "news", external_id: "pub", occurred_at: "2026-10-31T00:00:00Z", raw: PUBLIC, acl_labels: ["public"] }).source_id;
  submitClaim(db, {
    predicate_id: "spot_price",
    fields: { item: "ent:durum_semolina", amount: 425, currency: "EUR", per: "t" },
    evidence: [{ source_id: pub, quote: "è di 425 €/t" }],
  });
  if (extra) {
    const fin = insertSource(db, { kind: "document", external_id: "fin", occurred_at: "2026-01-15T00:00:00Z", raw: FINANCE, acl_labels: ["finance"] }).source_id;
    submitClaim(db, {
      predicate_id: "supplier_price",
      fields: { supplier: "ent:molino_tavoliere", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t", coverage_pct: 60 },
      evidence: [{ source_id: fin, quote: "fissa il prezzo a 412 €/t per il 60% del fabbisogno" }],
    });
    // a claim resting on a public AND a finance source takes the join of the labels
    submitClaim(db, {
      predicate_id: "statement",
      fields: { text: "Il prezzo di contratto è inferiore al prezzo spot." },
      evidence: [
        { source_id: pub, quote: "425 €/t" },
        { source_id: fin, quote: "412 €/t" },
      ],
    });
  }
  return db;
}

/** What a role sees, stripped of anything that legitimately differs between two databases (timestamps). */
const seenBy = (db: DB, p: typeof sara) =>
  visibleTo(listClaimViews(db), p).map((c) => ({
    id: c.claim_id,
    sentence: c.sentence,
    status: c.status,
    labels: c.labels,
    quotes: c.evidence.map((e) => [e.text, e.before, e.after, e.source.external_id]),
  }));

describe("non-interference", () => {
  it("what Production sees is identical with or without finance-only material in the memory", () => {
    const without = seenBy(build(false), sara);
    const withSecrets = seenBy(build(true), sara);
    expect(withSecrets).toEqual(without);
    expect(without).toHaveLength(1);
  });

  it("the test is not vacuous: Finance and Purchasing do see the extra claims", () => {
    const db = build(true);
    expect(seenBy(db, sara)).toHaveLength(1);
    expect(seenBy(db, luca)).toHaveLength(3);
    expect(seenBy(db, marta)).toHaveLength(3);
    expect(visibleTo(listClaimViews(db), null)).toHaveLength(3);
  });

  it("a claim resting on a public and a finance source is finance, and hidden from Production", () => {
    const db = build(true);
    const mixed = listClaimViews(db).find((c) => c.sentence.includes("inferiore"))!;
    expect(mixed.labels).toEqual(["finance", "public"]);
    expect(mixed.visible_to).toEqual(["marta", "luca"]);
    expect(seenBy(db, sara).map((c) => c.sentence)).not.toContain(mixed.sentence);
  });

  it("claimLabels follows the sources, and is empty for an unknown claim", () => {
    const db = build(true);
    const mixed = listClaimViews(db).find((c) => c.sentence.includes("inferiore"))!;
    expect(claimLabels(db, mixed.claim_id)).toEqual(["finance", "public"]);
    expect(claimLabels(db, "nope")).toEqual([]);
  });
});
