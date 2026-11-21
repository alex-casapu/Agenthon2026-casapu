import { memDb } from "../testkit";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSource, listClaims, listEntities, openDb, seedEntities, verify, type DB } from "../store";
import { extractSource, parseClaims } from "./extract";
import { reply, scriptedLlm } from "./fake-llm";
import { EXTRACTOR_VERSION, buildPrompt, buildSchema, vocabHash } from "./prompt";
import { latestPredicates } from "../predicates";
import { DEMO_ENTITIES } from "../demo-entities";

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
  db = memDb();
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
    expect(parseClaims({ text: "{}", structured: { claims: [1] } })).toEqual({ ok: true, claims: [1], entities: [] });
    expect(parseClaims({ text: 'x {"claims":[2]} y' })).toEqual({ ok: true, claims: [2], entities: [] });
    expect(parseClaims({ text: "{}", structured: { claims: [1], entities: [{ name: "A" }] } })).toEqual({ ok: true, claims: [1], entities: [{ name: "A" }] });
    expect(parseClaims({ text: '{"claims":[],"entities":"nope"}' })).toEqual({ ok: true, claims: [], entities: [] });
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
    expect(buildPrompt({ kind: "news", external_id: "n", occurred_at: "2026-01-01T00:00:00Z", author: null, meta: { domain: "x.example", title: "T" }, text: "a" }, all, [])).toContain("Publisher: x.example");
  });
});

describe("entity registry in extraction", () => {
  it("offers the registry in the prompt; the vocabulary hash is about predicates only, so a growing registry never forces re-extraction", async () => {
    const { llm, calls } = scriptedLlm([reply([])]);
    await extractSource(db, sid, opts(llm));
    const p = calls[0].prompt;
    expect(p).toContain("# Known entities");
    expect(p).toContain("ent:molino_rossi: Molino Rossi S.r.l.");
    expect(p).toContain("ent:parma_plant");
    expect(calls[0].system).toContain("Known entities");
    const preds = latestPredicates();
    expect(vocabHash(preds)).toBe(vocabHash([...preds]));
    expect(vocabHash(preds)).not.toBe(vocabHash(preds.slice(1)));
  });

  it("tells the model about document parties and reference so it can resolve a supplier the quote does not name", async () => {
    const doc = insertSource(db, { kind: "document", external_id: "CQ-1", occurred_at: "2026-01-15T00:00:00Z", raw: "Il prezzo è fissato in 412 €/t.", meta: { title: "Contratto", doc_type: "contract", reference: "CQ-2026-031", parties: ["Pastaco S.p.A.", "Molino Tavoliere S.r.l."] } }).source_id;
    const { llm, calls } = scriptedLlm([reply([])]);
    await extractSource(db, doc, opts(llm));
    expect(calls[0].prompt).toContain("Parties: Pastaco S.p.A.; Molino Tavoliere S.r.l.");
    expect(calls[0].prompt).toContain("Reference: CQ-2026-031");
  });

  it("an invented entity is rejected with suggestions, and repaired to a registry id", async () => {
    const { llm, calls } = scriptedLlm([reply([good({ supplier: "ent:fornitore_semola" })]), reply([good()])]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ status: "done", rounds: 2, proposed: 1, rejected: 0 });
    expect(calls[1].prompt).toContain("not in the entity registry");
    expect(calls[1].prompt).toContain("ent:durum_semolina");
    expect(listClaims(db)[0].subject).toMatchObject({ supplier: "ent:molino_rossi" });
  });

  it("a claim whose entity cannot be resolved is left out, and recorded as rejected", async () => {
    const { llm } = scriptedLlm([reply([good({ supplier: "ent:fornitore_semola" })]), reply([])]);
    const s = await extractSource(db, sid, opts(llm));
    expect(s).toMatchObject({ proposed: 0, rejected: 1 });
    expect(listClaims(db)).toHaveLength(0);
  });
});

describe("automatic entity discovery", () => {
  const OFFER = "Offerta di Molino Nuovo S.r.l.: la semola Fior di Grano è a 450 €/t, valida fino al 31 dicembre.";
  const decl = (name: string, kind: string, quote: string, aliases: string[] = []) => ({ name, kind, aliases, quote });
  const priceClaim = (supplier: string, item: string, over: Record<string, unknown> = {}) => ({
    predicate: "supplier_price",
    fields: { supplier, item, amount: 450, currency: "EUR", per: "t", valid_to: "2026-12-31", ...over },
    quotes: ["la semola Fior di Grano è a 450 €/t, valida fino al 31 dicembre"],
  });
  const reply2 = (claims: unknown[], entities: unknown[]) => ({ ...reply(claims), structured: { claims, entities }, text: JSON.stringify({ claims, entities }) });

  let fresh: DB;
  let src: string;
  beforeEach(() => {
    fresh = openDb(":memory:"); // only the fixed cast: every supplier and product is discovered
    src = insertSource(fresh, { kind: "email", external_id: "o1", occurred_at: "2026-10-12T07:15:00Z", raw: OFFER }).source_id;
  });

  it("recognises suppliers and products it has never seen, with no one approving anything", async () => {
    const { llm } = scriptedLlm([
      reply2([priceClaim("Molino Nuovo S.r.l.", "Fior di Grano")], [decl("Molino Nuovo S.r.l.", "organization", "Offerta di Molino Nuovo S.r.l."), decl("Fior di Grano", "item", "la semola Fior di Grano è a 450 €/t")]),
    ]);
    const s = await extractSource(fresh, src, opts(llm));
    expect(s).toMatchObject({ status: "done", rounds: 1, proposed: 1, rejected: 0, entities_created: 2 });
    expect(listEntities(fresh).map((e) => e.id)).toEqual(expect.arrayContaining(["ent:molino_nuovo", "ent:fior_di_grano"]));
    const [c] = listClaims(fresh);
    expect(c.subject).toEqual({ supplier: "ent:molino_nuovo", item: "ent:fior_di_grano" }); // names became ids, by code
    expect(c.status).toBe("proposed"); // the claim still waits for curation; the entity did not
    const detail = JSON.parse((fresh.prepare("SELECT detail FROM extraction_runs").get() as { detail: string }).detail);
    expect(detail.entities).toEqual([
      { id: "ent:molino_nuovo", name: "Molino Nuovo S.r.l.", created: true },
      { id: "ent:fior_di_grano", name: "Fior di Grano", created: true },
    ]);
    expect(verify(fresh)).toMatchObject({ ok: true, problems: [] });
  });

  it("the registry grows between sources: later prompts list it, and the same entity is reused, not duplicated", async () => {
    const first = scriptedLlm([reply2([priceClaim("Molino Nuovo S.r.l.", "Fior di Grano")], [decl("Molino Nuovo S.r.l.", "organization", "Offerta di Molino Nuovo S.r.l."), decl("Fior di Grano", "item", "la semola Fior di Grano è a 450 €/t")])]);
    await extractSource(fresh, src, opts(first.llm));
    expect(first.calls[0].prompt).not.toContain("ent:molino_nuovo");

    const src2 = insertSource(fresh, { kind: "email", external_id: "o2", occurred_at: "2026-11-01T07:15:00Z", raw: "Molino Nuovo conferma: la semola Fior di Grano resta a 450 €/t, valida fino al 31 dicembre." }).source_id;
    const second = scriptedLlm([
      reply2(
        [{ predicate: "supplier_price", fields: { supplier: "molino nuovo", item: "ent:fior_di_grano", amount: 450, currency: "EUR", per: "t", valid_to: "2026-12-31" }, quotes: ["la semola Fior di Grano resta a 450 €/t, valida fino al 31 dicembre"] }],
        [decl("Molino Nuovo", "organization", "Molino Nuovo conferma")],
      ),
    ]);
    const s = await extractSource(fresh, src2, opts(second.llm));
    expect(second.calls[0].prompt).toContain("ent:molino_nuovo: Molino Nuovo S.r.l.");
    expect(s).toMatchObject({ proposed: 1, entities_created: 0 });
    expect(listEntities(fresh).filter((e) => e.name.startsWith("Molino Nuovo"))).toHaveLength(1);
    expect(listClaims(fresh)).toHaveLength(2);
  });

  it("resolves names the model wrote instead of ids, including known aliases", async () => {
    seedEntities(fresh, DEMO_ENTITIES);
    const { llm } = scriptedLlm([reply2([priceClaim("Molino Rossi", "semola di grano duro")], [])]);
    const s = await extractSource(fresh, src, opts(llm));
    expect(s).toMatchObject({ proposed: 1, rejected: 0, entities_created: 0 });
    expect(listClaims(fresh)[0].subject).toEqual({ supplier: "ent:molino_rossi", item: "ent:durum_semolina" });
  });

  it("does not admit an entity whose name is not in its quote, and the claim that needs it is dropped", async () => {
    const { llm } = scriptedLlm([reply2([priceClaim("Molino Fantasma", "Fior di Grano")], [decl("Molino Fantasma", "organization", "Offerta di Molino Nuovo S.r.l."), decl("Fior di Grano", "item", "la semola Fior di Grano è a 450 €/t")]), reply2([], [])]);
    const s = await extractSource(fresh, src, opts(llm));
    expect(s).toMatchObject({ proposed: 0, entities_created: 1 }); // Fior di Grano is grounded and admitted; the ghost is not
    expect(s.rejected).toBeGreaterThan(0);
    expect(listEntities(fresh).some((e) => e.name === "Molino Fantasma")).toBe(false);
    expect(listClaims(fresh)).toHaveLength(0);
  });

  it("an entity declared in a repair round rescues the claim", async () => {
    const { llm, calls } = scriptedLlm([
      reply2([priceClaim("Molino Nuovo S.r.l.", "Fior di Grano")], []), // forgot to declare them
      reply2([priceClaim("Molino Nuovo S.r.l.", "Fior di Grano")], [decl("Molino Nuovo S.r.l.", "organization", "Offerta di Molino Nuovo S.r.l."), decl("Fior di Grano", "item", "la semola Fior di Grano è a 450 €/t")]),
    ]);
    const s = await extractSource(fresh, src, opts(llm));
    expect(calls[1].prompt).toContain("not in the entity registry");
    expect(s).toMatchObject({ rounds: 2, proposed: 1, rejected: 0, entities_created: 2 });
  });

  it("an ungrounded declaration is reported back so the model can fix it", async () => {
    const { llm, calls } = scriptedLlm([reply2([], [decl("Molino Nuovo S.r.l.", "organization", "Offerta di Molino Vecchio")]), reply2([], [])]);
    await extractSource(fresh, src, opts(llm));
    expect(calls[1].prompt).toContain("does not appear in the source");
  });

  it("teaches the model to declare entities, and the schema allows it", async () => {
    const { llm, calls } = scriptedLlm([reply2([], [])]);
    await extractSource(fresh, src, opts(llm));
    expect(calls[0].system).toContain('top-level "entities" list');
    expect(calls[0].system).toContain("Never invent ids");
    expect(calls[0].system).toContain("never an e-mail address, domain or URL");
    expect(calls[0].system).toContain("The supplier of an offer sent by e-mail is the company, not the sender");
    const props = (calls[0].schema as { properties: Record<string, { items?: { required: string[]; properties: { kind: { enum: string[] } } } }> }).properties.entities.items!;
    expect(props.required).toEqual(["name", "kind"]);
    expect(props.properties.kind.enum).toEqual(["organization", "site", "item", "person", "department"]);
    expect(calls[0].prompt).toContain("none known yet");
    expect(calls[0].prompt).not.toContain("ent:molino_rossi"); // nothing is shipped: every entity is discovered
  });
});

describe("trust by default in extraction", () => {
  it("with trust, extracted claims are approved by the policy and usable at once", async () => {
    const { llm } = scriptedLlm([reply([good()])]);
    const s = await extractSource(db, sid, opts(llm, { trust: true }));
    expect(s).toMatchObject({ status: "done", proposed: 1 });
    expect(listClaims(db)[0].status).toBe("approved");
    expect(db.prepare("SELECT actor FROM claim_events ORDER BY seq").all()).toEqual([{ actor: "agent:extractor" }, { actor: "policy:trust-by-default" }]);
    expect(verify(db).ok).toBe(true);
  });

  it("without it they wait for a curator, as before", async () => {
    const { llm } = scriptedLlm([reply([good()])]);
    await extractSource(db, sid, opts(llm));
    expect(listClaims(db)[0].status).toBe("proposed");
  });

  it("a repaired claim is trusted too, and a rejected one is not resurrected by re-extraction", async () => {
    const { llm } = scriptedLlm([reply([good({ amount: 413 })]), reply([good()])]);
    await extractSource(db, sid, opts(llm, { trust: true }));
    const [c] = listClaims(db);
    expect(c.status).toBe("approved");
    db.prepare("INSERT INTO claim_events (claim_id, type, actor, created_at, policy_version) VALUES (?, 'rejected', 'human:marta', 'x', 0)").run(c.claim_id);
    const again = scriptedLlm([reply([good()])]);
    await extractSource(db, sid, opts(again.llm, { trust: true, force: true }));
    expect(listClaims(db)[0].status).toBe("rejected");
  });
});
