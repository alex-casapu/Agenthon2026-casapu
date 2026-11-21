import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { Llm } from "../llm";
import { buildDraft, generateSources, previewOf, writeSource, type DraftItem } from ".";

const NOW = new Date("2026-11-24T08:00:00Z");
const ctx = { now: NOW, labels: ["public", "finance"], entities: [], people: [], recent: [] };

const email: DraftItem = {
  kind: "email",
  date: "2026-11-24T09:30:00+01:00",
  title: "Offerta semola: 655 €/t",
  body: "Buongiorno, vi offriamo semola a 655 €/t, consegna entro il 30 novembre.",
  from_name: "Anna Rossi",
  from_email: "anna.rossi@molinorossi.example",
  to: [{ name: "Giulia Ferri", email: "giulia.ferri@pastificio.example" }],
  reliability: "high",
};
const news: DraftItem = { kind: "news", title: "Semola in calo", body: "La semola scende a 610 €/t.", domain: "granimercati.example", author: "Redazione" };
const doc: DraftItem = { kind: "document", title: "Giacenze al 24/11", body: "| Articolo | t |\n|---|---|\n| Semola | 900 t |", doc_type: "export", origin: "WMS" };

describe("buildDraft", () => {
  it.each([email, news, doc])("produces a file the real parser accepts ($kind)", (item) => {
    const p = previewOf(buildDraft(item, NOW));
    expect(p.errors).toEqual([]);
    expect(p.ok).toBe(true);
    expect(p.summary.body).toContain(item.body.split("\n")[0]);
  });

  it("keeps quotes and colons in titles safe and names files by date and slug", () => {
    const d = buildDraft({ ...email, title: 'Re: "Offerta": 655 €/t' }, NOW);
    expect(previewOf(d).ok).toBe(true);
    expect(d.filename).toMatch(/^20261124-0830-re-offerta-655-t\.md$/);
  });

  it("defaults the date to now and accepts a past date without rewriting it", () => {
    const past = previewOf(buildDraft({ ...news, date: "2026-10-01T10:00:00+02:00" }, NOW));
    expect(past.summary.when).toBe("2026-10-01T08:00:00.000Z");
    expect(previewOf(buildDraft(news, NOW)).summary.when).toBe("2026-11-24T08:00:00.000Z");
  });

  it("reports contract errors instead of writing a broken header", () => {
    const p = previewOf(buildDraft({ ...email, from_email: "not an address" }, NOW));
    expect(p.ok).toBe(false);
    expect(p.errors.length).toBeGreaterThan(0);
  });
});

describe("generateSources", () => {
  const llmReturning = (items: unknown[]): Llm => async () => ({ text: "", structured: { items } });

  it("returns previews, drops labels the policy does not know, and de-duplicates file names", async () => {
    const out = await generateSources("an offer", ctx, { llm: llmReturning([{ ...email, labels: ["finance", "secret"] }, { ...email, labels: ["finance"] }]), model: "m" });
    expect(out).toHaveLength(2);
    expect(out[0].summary.labels).toEqual(["finance"]);
    expect(new Set(out.map((o) => o.filename)).size).toBe(2);
  });

  it("honours the requested kinds", async () => {
    const out = await generateSources("news only", ctx, { llm: llmReturning([email, news]), model: "m", kinds: ["news"] });
    expect(out.map((o) => o.kind)).toEqual(["news"]);
  });

  it("puts the request, the clock and the allowed labels in front of the model", async () => {
    let seen = "";
    await generateSources("rumour about a strike", ctx, { llm: async (r) => ((seen = r.prompt), { text: "", structured: { items: [] } }), model: "m" });
    expect(seen).toContain("rumour about a strike");
    expect(seen).toContain("2026-11-24T08:00:00.000Z");
    expect(seen).toContain("public, finance");
  });
});

describe("writeSource", () => {
  const withDirs = () => {
    process.env.BRAIN_INBOX = mkdtempSync(join(tmpdir(), "sg-in-"));
    process.env.BRAIN_NEWS = mkdtempSync(join(tmpdir(), "sg-nw-"));
    return process.env.BRAIN_NEWS;
  };

  it("writes into the folder of its kind, atomically, and never overwrites", () => {
    const dir = withDirs();
    const d = buildDraft(news, NOW);
    const r = writeSource(d);
    expect(r.ok).toBe(true);
    expect(readFileSync(join(dir, d.filename), "utf8")).toBe(d.content);
    expect(readdirSync(dir).filter((f) => f.startsWith("_"))).toEqual([]);
    const again = writeSource(d);
    expect(again.ok).toBe(false);
  });

  it("refuses path tricks and invalid content", () => {
    const dir = withDirs();
    const d = buildDraft(news, NOW);
    expect(writeSource({ ...d, filename: "../evil.md" }).ok).toBe(false);
    expect(writeSource({ ...d, filename: "a/b.md" }).ok).toBe(false);
    expect(writeSource({ ...d, content: "no header" }).ok).toBe(false);
    expect(existsSync(join(dir, "..", "evil.md"))).toBe(false);
  });
});
