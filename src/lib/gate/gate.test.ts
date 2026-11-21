import { describe, expect, it } from "vitest";
import { canonicalize, cpLength } from "../canon";
import { DEMO_ENTITIES } from "../demo-entities";
import { ENTITIES, registryOf } from "../entities";
import { checkClaim } from ".";
import { dateCandidates } from "./dates";
import { locateQuote } from "./locate";
import { numberCandidates } from "./numbers";

describe("numberCandidates", () => {
  it("reads plain and currency-adjacent numbers", () => {
    expect(numberCandidates("price is €412 per tonne").has(412)).toBe(true);
  });
  it("reads European and English thousands/decimals", () => {
    expect(numberCandidates("1.200,50").has(1200.5)).toBe(true);
    expect(numberCandidates("1,200.50").has(1200.5)).toBe(true);
    expect(numberCandidates("412,50").has(412.5)).toBe(true);
  });
  it("keeps ambiguous tokens ambiguous", () => {
    const c = numberCandidates("1.200");
    expect(c.has(1200)).toBe(true);
    expect(c.has(1.2)).toBe(true);
  });
  it("does not invent numbers", () => {
    expect(numberCandidates("price is €412").has(413)).toBe(false);
    expect(numberCandidates("price is €412").has(41)).toBe(false);
  });
});

describe("dateCandidates", () => {
  const at = "2026-10-12T09:00:00Z";
  it("resolves a year-less date to the year nearest the message date", () => {
    expect([...dateCandidates("valid until 31 December", at)]).toEqual(["2026-12-31"]);
  });
  it("reads Italian and explicit-year forms", () => {
    expect(dateCandidates("entro il 31 dicembre 2026", at).has("2026-12-31")).toBe(true);
    expect(dateCandidates("December 31, 2026", at).has("2026-12-31")).toBe(true);
    expect(dateCandidates("2026-12-31", at).has("2026-12-31")).toBe(true);
  });
  it("accepts both orders for ambiguous numeric dates", () => {
    const c = dateCandidates("on 03/04/2026", at);
    expect(c.has("2026-04-03")).toBe(true);
    expect(c.has("2026-03-04")).toBe(true);
  });
  it("rejects impossible dates", () => {
    expect(dateCandidates("31 February 2026", at).size).toBe(0);
  });
});

describe("locateQuote", () => {
  const text = canonicalize("Hello team,\nthe price is\n  €412 per tonne.\nThanks. Thanks again.");
  it("tolerates whitespace differences and returns the exact slice", () => {
    const r = locateQuote(text, "the price is €412 per tonne");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("the price is\n  €412 per tonne");
  });
  it("rejects missing and ambiguous quotes", () => {
    expect(locateQuote(text, "the price is €999")).toMatchObject({ ok: false, code: "quote_not_found" });
    expect(locateQuote(text, "Thanks")).toMatchObject({ ok: false, code: "quote_ambiguous" });
    expect(locateQuote(text, "   ")).toMatchObject({ ok: false, code: "quote_empty" });
  });
  it("uses code-point offsets (emoji before the quote)", () => {
    const t = "🍝 pasta 🍝 costs €5";
    const r = locateQuote(t, "costs €5");
    expect(r.ok && r.start).toBe(cpLength("🍝 pasta 🍝 "));
  });
  it("matches NFD input against NFC text", () => {
    expect(locateQuote("caffè", "caffè").ok).toBe(true);
  });
});

describe("checkClaim", () => {
  const body =
    "Per our call, the October lot of durum semolina is €412 per tonne, valid until 31 December, minimum 800 tonnes.";
  const sources: Record<string, { canonical_text: string; occurred_at: string }> = {
    s1: { canonical_text: body, occurred_at: "2026-10-12T09:00:00Z" },
  };
  const get = (id: string) => sources[id];
  const base = {
    predicate_id: "supplier_price",
    evidence: [{ source_id: "s1", quote: "the October lot of durum semolina is €412 per tonne, valid until 31 December, minimum 800 tonnes" }],
    fields: {
      supplier: "ent:molino_rossi",
      item: "ent:durum_semolina",
      amount: 412,
      currency: "EUR",
      per: "t",
      min_volume: 800,
      valid_to: "2026-12-31",
    },
  };

  it("accepts a fully grounded claim", () => {
    const r = checkClaim(base, get);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.value).toMatchObject({ amount: 412, currency: "EUR", per: "t" });
      expect(r.draft.valid_to).toBe("2026-12-31");
      expect(r.draft.grounding.amount.tier).toBe("literal");
      expect(r.draft.grounding.valid_to).toMatchObject({ tier: "resolved", resolver: "date@1" });
      expect(r.draft.grounding.supplier.tier).toBe("interpretive");
    }
  });

  it("is deterministic: same input, same claim_id", () => {
    const a = checkClaim(base, get);
    const b = checkClaim(structuredClone(base), get);
    expect(a.ok && b.ok && a.draft.claim_id === b.draft.claim_id).toBe(true);
  });

  it("rejects a hallucinated number", () => {
    const r = checkClaim({ ...base, fields: { ...base.fields, amount: 413 } }, get);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.errors).toContainEqual(expect.objectContaining({ code: "literal_not_in_quote", field: "amount" }));
  });

  it("rejects a date the resolver cannot derive", () => {
    const r = checkClaim({ ...base, fields: { ...base.fields, valid_to: "2026-12-30" } }, get);
    if (r.ok) throw new Error("expected rejection");
    expect(r.errors[0]).toMatchObject({ code: "resolved_mismatch", field: "valid_to" });
  });

  it("rejects a wrong currency or unit", () => {
    const r = checkClaim({ ...base, fields: { ...base.fields, currency: "USD", per: "kg" } }, get);
    if (r.ok) throw new Error("expected rejection");
    expect(r.errors.map((e) => e.field).sort()).toEqual(["currency", "per"]);
  });

  it("rejects fabricated quotes, unknown sources, unknown fields, missing fields", () => {
    expect(checkClaim({ ...base, evidence: [{ source_id: "s1", quote: "it costs a million" }] }, get)).toMatchObject({ ok: false });
    expect(checkClaim({ ...base, evidence: [{ source_id: "nope", quote: "x" }] }, get)).toMatchObject({ ok: false });
    expect(checkClaim({ ...base, evidence: [] }, get)).toMatchObject({ ok: false });
    expect(checkClaim({ ...base, predicate_id: "nope" }, get)).toMatchObject({ ok: false });
    const rest: Record<string, unknown> = { ...base.fields, color: "red" };
    delete rest.supplier;
    const r = checkClaim({ ...base, fields: rest }, get);
    if (r.ok) throw new Error("expected rejection");
    expect(r.errors.map((e) => e.code).sort()).toEqual(["missing_field", "unexpected_field"]);
  });

  it("accepts a statement claim grounded only by its quote", () => {
    const r = checkClaim(
      { predicate_id: "statement", fields: { text: "Semolina price was confirmed by phone." }, evidence: [{ source_id: "s1", quote: "Per our call" }] },
      get,
    );
    expect(r.ok).toBe(true);
  });
});

describe("entity registry in the gate", () => {
  const reg = registryOf([...ENTITIES, ...DEMO_ENTITIES]);
  const text = "Il lotto di semola è a 412 €/t, valida fino al 31 dicembre.";
  const src: Record<string, { canonical_text: string; occurred_at: string }> = { s1: { canonical_text: text, occurred_at: "2026-10-12T07:15:00Z" } };
  const get = (id: string) => src[id];
  const input = (over: Record<string, unknown> = {}) => ({
    predicate_id: "supplier_price",
    evidence: [{ source_id: "s1", quote: "è a 412 €/t" }],
    fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t", ...over },
  });

  it("accepts registry ids", () => {
    expect(checkClaim(input(), get, { entities: reg }).ok).toBe(true);
  });

  it("rejects an unknown entity with the closest known ids, per field", () => {
    const r = checkClaim(input({ supplier: "ent:fornitore_semola", item: "ent:made_up_thing" }), get, { entities: reg });
    if (r.ok) throw new Error("expected rejection");
    expect(r.errors.map((e) => e.field).sort()).toEqual(["item", "supplier"]);
    const supplier = r.errors.find((e) => e.field === "supplier")!;
    expect(supplier.code).toBe("unknown_entity");
    expect(supplier.message).toMatch(/not in the entity registry \(closest: .*ent:durum_semolina/);
    expect(supplier.message).toMatch(/leave the claim out/);
  });

  it("checks optional entity fields too, but not plain text fields", () => {
    const c = {
      predicate_id: "commitment",
      evidence: [{ source_id: "s1", quote: "è a 412 €/t" }],
      fields: { owner: "ent:pastaco", counterparty: "ent:unknown_party", action: "chiunque / anything at all" },
    };
    const r = checkClaim(c, get, { entities: reg });
    if (r.ok) throw new Error("expected rejection");
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ code: "unknown_entity", field: "counterparty" });
  });

  it("does not apply to an audit: without the option, unknown ids pass (claims admitted before the registry)", () => {
    expect(checkClaim(input({ supplier: "ent:fornitore_semola" }), get).ok).toBe(true);
    expect(checkClaim(input({ supplier: "ent:fornitore_semola" }), get, {}).ok).toBe(true);
    expect(checkClaim(input({ supplier: "ent:fornitore_semola" }), get, { entities: reg }).ok).toBe(false);
  });
});
