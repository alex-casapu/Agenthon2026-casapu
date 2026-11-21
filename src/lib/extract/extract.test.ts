import { beforeEach, describe, expect, it } from "vitest";
import { insertSource, listClaims, openDb, verify, type DB } from "../store";
import { extractSource, parseClaims } from "./extract";
import { reply, scriptedLlm } from "./fake-llm";
import { EXTRACTOR_VERSION, buildPrompt, buildSchema, vocabHash } from "./prompt";
import { latestPredicates } from "../predicates";

const TEXT = "Buongiorno,\n\ncome da telefonata, la semola di grano duro è a 412 €/t, valida fino al 31 dicembre, ordine minimo 800 tonnellate.\n\nCordiali saluti\n";
const QUOTE = "la semola di grano duro è a 412 €/t, valida fino al 31 dicembre, ordine minimo 800 tonnellate";
const good = (over: Record<string, unknown> = {}) => ({
  predicate: "supplier_price",
  fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t", min_volume: 800, valid_to: "2026-12-31", price_type: "offer", ...over },
  quotes: [QUOTE],
});

let db: DB;
let sid: string;
beforeEach(() => {
  db = openDb(":memory:");
  sid = insertSource(db, { kind: "email", external_id: "m1", author: "anna@mill.example", occurred_at: "2026-10-12T07:15:00Z", raw: TEXT, meta: { subject: "Offerta semola", reliability: "high" } }).source_id;
});

const opts = (llm: ReturnType<typeof scriptedLlm>["llm"], extra = {}) => ({ llm, model: "test-model", ...extra });

describe("extractSource", () => {
  it("saves gate-passing claims as proposed, stamped with the extractor", async () => {
    const { llm, calls } = scriptedLlm([reply([good()])]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ status: "done", rounds: 1, proposed: 1, duplicates: 0, rejected: 0 });
    expect(calls).toHaveLength(1);

    const [c] = listClaims(db);
    expect(c).toMatchObject({ predicate_id: "supplier_price", predicate_version: 2, status: "proposed" });
    expect(c.value).toMatchObject({ amount: 412, currency: "EUR", per: "t" });
    expect(c.valid_to).toBe("2026-12-31");
    const stamp = JSON.parse((db.prepare("SELECT extractor FROM claims").get() as { extractor: string }).extractor);
    expect(stamp).toMatchObject({ type: "llm", name: EXTRACTOR_VERSION, model: "test-model" });
    const actor = (db.prepare("SELECT actor FROM claim_events").get() as { actor: string }).actor;
    expect(actor).toBe("agent:extractor");

    const run = db.prepare("SELECT * FROM extraction_runs").get() as Record<string, unknown>;
    expect(run).toMatchObject({ status: "done", rounds: 1, proposed: 1, rejected: 0, model: "test-model", extractor: EXTRACTOR_VERSION });
    expect(run.cost_usd).toBeCloseTo(0.01);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("repairs a hallucinated number using the gate's error", async () => {
    const { llm, calls } = scriptedLlm([reply([good({ amount: 413 })]), reply([good()])]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ status: "done", rounds: 2, proposed: 1, rejected: 0 });
    expect(calls[1].prompt).toContain("Verifier feedback");
    expect(calls[1].prompt).toContain("413 does not appear in any quote");
    expect(listClaims(db)[0].value.amount).toBe(412);
  });

  it("repairs only the rejected claims, leaving accepted ones alone", async () => {
    const ok = { predicate: "statement", fields: { text: "Offerta telefonica del mulino." }, quotes: ["come da telefonata"] };
    const { llm, calls } = scriptedLlm([reply([ok, good({ currency: "USD" })]), reply([good()])]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ rounds: 2, proposed: 2, rejected: 0 });
    expect(calls[1].prompt).toContain("currency");
    expect(calls[1].prompt).not.toContain("Offerta telefonica del mulino");
    expect(listClaims(db)).toHaveLength(2);
  });

  it("gives up after the repair budget, saving nothing and recording what was rejected", async () => {
    const { llm, calls } = scriptedLlm([reply([good({ amount: 413 })])]);
    const s = await extractSource(db, sid, opts(llm, { maxRepairs: 2 }));
    expect(calls).toHaveLength(3);
    expect(s).toMatchObject({ status: "done", rounds: 3, proposed: 0, rejected: 1 });
    expect(listClaims(db)).toHaveLength(0);
    const detail = JSON.parse((db.prepare("SELECT detail FROM extraction_runs").get() as { detail: string }).detail);
    expect(detail.rejected[0].errors.join(" ")).toMatch(/413/);
    expect(detail.rounds).toHaveLength(3);
  });

  it("rejects a fabricated quote", async () => {
    const bad = { ...good(), quotes: ["il prezzo è di 412 euro alla tonnellata"] };
    const { llm } = scriptedLlm([reply([bad])]);
    const s = await extractSource(db, sid, opts(llm, { maxRepairs: 0 }));
    expect(s).toMatchObject({ proposed: 0, rejected: 1, rounds: 1 });
    const detail = JSON.parse((db.prepare("SELECT detail FROM extraction_runs").get() as { detail: string }).detail);
    expect(detail.rejected[0].errors.join(" ")).toMatch(/does not appear in the source/);
  });

  it("turns malformed claims into feedback instead of crashing", async () => {
    const { llm, calls } = scriptedLlm([reply([{ predicate: "made_up", fields: {}, quotes: ["x"] }, { predicate: "statement", fields: "nope", quotes: [] }]), reply([])]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ rounds: 2, proposed: 0, rejected: 2 });
    expect(calls[1].prompt).toContain("unknown predicate");
    expect(calls[1].prompt).toContain("fields must be an object");
  });

  it("an empty claim list is a clean run", async () => {
    const { llm } = scriptedLlm([reply([])]);
    expect(await extractSource(db, sid, opts(llm))).toMatchObject({ status: "done", rounds: 1, proposed: 0, rejected: 0 });
  });

  it("reads JSON out of fenced text when there is no structured output", async () => {
    const { llm } = scriptedLlm([{ text: "Ecco:\n```json\n" + JSON.stringify({ claims: [good()] }) + "\n```" }]);
    expect(await extractSource(db, sid, opts(llm))).toMatchObject({ status: "done", proposed: 1 });
  });

  it("retries invalid JSON, and fails the run if it never gets valid output", async () => {
    const { llm, calls } = scriptedLlm([{ text: "boh" }]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ status: "failed", rounds: 3, proposed: 0 });
    expect(calls[1].prompt).toContain("not valid JSON");
    expect(s.error).toMatch(/not valid JSON/);
    expect(db.prepare("SELECT status FROM extraction_runs").get()).toEqual({ status: "failed" });
  });

  it("recovers when the first reply is invalid but the retry is good", async () => {
    const { llm } = scriptedLlm([{ text: "boh" }, reply([good()])]);
    expect(await extractSource(db, sid, opts(llm))).toMatchObject({ status: "done", rounds: 2, proposed: 1 });
  });

  it("records a failed run when the model call throws", async () => {
    const { llm } = scriptedLlm([new Error("claude CLI timed out")]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ status: "failed", rounds: 1, error: "claude CLI timed out" });
    expect(listClaims(db)).toHaveLength(0);
  });

  it("keeps earlier results when a repair call throws", async () => {
    const { llm } = scriptedLlm([reply([good(), good({ amount: 413, min_volume: 801 })]), new Error("rate limited")]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ status: "done", proposed: 1, rejected: 1, error: "rate limited" });
  });

  it("skips a source that is up to date, unless forced", async () => {
    const { llm, calls } = scriptedLlm([reply([good()])]);
    await extractSource(db, sid, opts(llm));
    expect(await extractSource(db, sid, opts(llm))).toMatchObject({ status: "skipped" });
    expect(calls).toHaveLength(1);
    const forced = await extractSource(db, sid, opts(llm, { force: true }));
    expect(forced).toMatchObject({ status: "done", proposed: 0, duplicates: 1 });
    expect(listClaims(db)).toHaveLength(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM extraction_runs").get() as { n: number }).n).toBe(2);
  });

  it("a different predicate set counts as new work (targeted pass)", async () => {
    const { llm, calls } = scriptedLlm([reply([good()]), reply([])]);
    await extractSource(db, sid, opts(llm));
    const s = await extractSource(db, sid, opts(llm, { predicates: ["statement"] }));
    expect(s.status).toBe("done");
    expect(calls).toHaveLength(2);
    expect(calls[1].prompt).toContain("### statement");
    expect(calls[1].prompt).not.toContain("### supplier_price");
  });

  it("builds a prompt with the source, its metadata and only the latest predicates", async () => {
    const { llm, calls } = scriptedLlm([reply([])]);
    await extractSource(db, sid, opts(llm));
    const p = calls[0].prompt;
    expect(p).toContain("Source type: email");
    expect(p).toContain("Source date: 2026-10-12T07:15:00Z");
    expect(p).toContain("Subject: Offerta semola");
    expect(p).toContain("Source reliability: high");
    expect(p).toContain("<<<TEXT\n" + TEXT + "\nTEXT>>>");
    for (const id of ["supplier_price", "spot_price", "demand", "stock_coverage", "commitment", "statement"]) expect(p).toContain(`### ${id}`);
    expect(p.match(/### supplier_price/g)).toHaveLength(1);
    expect(p).toContain("coverage_pct");
    expect(calls[0].system).toContain("VERBATIM");
    expect(calls[0].schema).toEqual(buildSchema(latestPredicates()));
  });

  it("unknown sources are an error", async () => {
    await expect(extractSource(db, "nope", opts(scriptedLlm([reply([])]).llm))).rejects.toThrow(/unknown source/);
  });
});

describe("parseClaims", () => {
  it("prefers structured output, falls back to text, rejects the rest", () => {
    expect(parseClaims({ text: "{}", structured: { claims: [1] } })).toEqual({ ok: true, claims: [1] });
    expect(parseClaims({ text: 'x {"claims":[2]} y' })).toEqual({ ok: true, claims: [2] });
    expect(parseClaims({ text: '{"claims": "no"}' }).ok).toBe(false);
    expect(parseClaims({ text: "" }).ok).toBe(false);
    expect(parseClaims({ text: "{broken", structured: null }).ok).toBe(false);
  });
});

describe("vocabulary hash", () => {
  it("changes with the predicate set, not with prompt text", () => {
    const all = latestPredicates();
    expect(vocabHash(all)).toBe(vocabHash([...all]));
    expect(vocabHash(all)).not.toBe(vocabHash(all.slice(1)));
    expect(buildPrompt({ kind: "news", external_id: "n", occurred_at: "2026-01-01T00:00:00Z", author: null, meta: { domain: "x.example", title: "T" }, text: "a" }, all)).toContain("Publisher: x.example");
  });
});
