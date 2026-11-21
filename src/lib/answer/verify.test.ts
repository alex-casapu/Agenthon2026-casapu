import { describe, expect, it } from "vitest";
import { verifySegments, type KnownClaim } from "./verify";

const known = new Map<string, KnownClaim>([
  ["C1", { material: "Molino Tavoliere prices Durum Semolina at 412 EUR/t (fixed, covers 60% of needs, valid until 2027-03-31)\namount=412; valid_to=2027-03-31\n“Il prezzo è fissato in 412 €/t” (Contratto, 2026-01-15)" }],
  ["C2", { material: "Market price of Durum Semolina is 1.250,00 EUR/t, +12,5%\n“€ 1.250,00 a tonnellata”" }],
  ["C3", { material: "Parma Plant holds 9 days of Durum Semolina as of 2026-11-20" }],
]);
const seg = (text: string, ...cites: string[]) => ({ text, cites });

describe("verifySegments", () => {
  it("accepts text whose figures are all in the cited claims", () => {
    const r = verifySegments([seg("The contract fixes 412 EUR/t and covers 60% of needs.", "C1"), seg("Stock covers 9 days.", "C3")], known);
    expect(r.problems).toEqual([]);
    expect(r.ok).toHaveLength(2);
  });

  it("reads numbers across locales and formats", () => {
    expect(verifySegments([seg("Prezzo di 1.250 €/t, in rialzo del 12,5%.", "C2")], known).problems).toEqual([]);
    expect(verifySegments([seg("It is 1,250.00 EUR per tonne (+12.5%).", "C2")], known).problems).toEqual([]);
    expect(verifySegments([seg("Valid until 2027-03-31.", "C1")], known).problems).toEqual([]);
    expect(verifySegments([seg("Valid until 31 March 2027.", "C1")], known).problems).toEqual([]);
  });

  it("rejects a figure the cited claims do not contain, naming it", () => {
    const r = verifySegments([seg("The contract price is 430 EUR/t.", "C1")], known);
    expect(r.ok).toEqual([]);
    expect(r.problems[0].message).toMatch(/says 430, but the cited claims contain no such number/);
  });

  it("does not let a figure borrow support from a claim that is not cited", () => {
    const r = verifySegments([seg("The contract price is 1250 EUR/t.", "C1")], known);
    expect(r.problems).toHaveLength(1);
    expect(verifySegments([seg("The contract price is 1250 EUR/t.", "C1", "C2")], known).problems).toHaveLength(0);
  });

  it("rejects computed figures (no sums, differences, conversions)", () => {
    expect(verifySegments([seg("That is 53 EUR/t more than before.", "C1", "C2")], known).problems).toHaveLength(1);
    expect(verifySegments([seg("About 1.5 million per month.", "C1")], known).problems).toHaveLength(1);
  });

  it("allows numbers the person themselves wrote in the question", () => {
    const r = verifySegments([seg("No: the stored price is 412 EUR/t, not 430.", "C1")], known, "Is the price 430 EUR/t?");
    expect(r.problems).toEqual([]);
  });

  it("rejects segments with no citation or only unknown handles", () => {
    const r = verifySegments([seg("It is good.", ), seg("It is fine.", "C99"), seg("Fine.", "C1")], known);
    expect(r.ok.map((s) => s.text)).toEqual(["Fine."]);
    expect(r.problems.map((p) => p.segment)).toEqual([0, 1]);
    expect(r.problems[0].message).toMatch(/no citation/);
    expect(r.problems[1].message).toMatch(/C99.*not among the claims provided/);
  });

  it("normalises handle spelling and duplicates", () => {
    const r = verifySegments([seg("Stock covers 9 days.", "[c3]", " C3 ", "C3")], known);
    expect(r.ok).toEqual([{ text: "Stock covers 9 days.", cites: ["C3"] }]);
  });

  it("rejects empty and malformed segments without throwing", () => {
    const r = verifySegments([seg("   ", "C1"), { text: 5 as unknown as string, cites: ["C1"] }, { text: "ok", cites: "C1" as unknown as string[] }], known);
    expect(r.ok).toEqual([]);
    expect(r.problems).toHaveLength(3);
  });

  it("text without numbers needs only a valid citation", () => {
    expect(verifySegments([seg("Molino Tavoliere is the supplier.", "C1")], known).problems).toEqual([]);
  });
});
