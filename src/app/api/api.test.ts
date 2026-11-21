import { beforeEach, describe, expect, it, vi } from "vitest";

// connection() only works inside a Next request; routes are called directly here.
vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET as getState } from "./state/route";
import { POST as postSource } from "./sources/route";
import { POST as postClaim } from "./claims/route";
import { POST as postReview } from "./claims/[id]/review/route";
import { POST as postSeed } from "./seed/route";
import { GET as getSchema } from "./debug/schema/route";
import { GET as getRows } from "./debug/rows/route";
import { POST as postSql } from "./debug/sql/route";
import { GET as getVerify } from "./debug/verify/route";
import { POST as postScan } from "./ingest/scan/route";
import { GET as getIngestStatus } from "./ingest/status/route";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const json = (url: string, body: unknown) =>
  new Request(`http://test${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });

const source = { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "the lot is €412 per tonne, valid until 31 December" };
const claim = (source_id: string, amount = 412) => ({
  predicate_id: "supplier_price",
  fields: { supplier: "ent:a", item: "ent:b", amount, currency: "EUR", per: "t" },
  evidence: [{ source_id, quote: "the lot is €412 per tonne" }],
});

beforeEach(() => {
  process.env.BRAIN_DB = ":memory:";
  delete (globalThis as unknown as { __brainDb?: unknown }).__brainDb;
});

describe("API", () => {
  it("starts empty and verified", async () => {
    const s = await (await getState()).json();
    expect(s.sources).toEqual([]);
    expect(s.claims).toEqual([]);
    expect(s.verify.ok).toBe(true);
  });

  it("ingests a source (idempotently) and rejects bad bodies", async () => {
    const a = await (await postSource(json("/api/sources", source))).json();
    expect(a.created).toBe(true);
    expect((await (await postSource(json("/api/sources", source))).json()).created).toBe(false);
    expect((await postSource(json("/api/sources", { kind: "email" }))).status).toBe(400);
    expect((await postSource(json("/api/sources", { ...source, occurred_at: "nope" }))).status).toBe(400);
    expect((await postSource(json("/api/sources", "not json"))).status).toBe(400);
  });

  it("passes a grounded claim, rejects a fabricated one with 422 and reasons", async () => {
    const { source_id } = await (await postSource(json("/api/sources", source))).json();
    const ok = await postClaim(json("/api/claims", claim(source_id)));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ ok: true, duplicate: false });

    const bad = await postClaim(json("/api/claims", claim(source_id, 413)));
    expect(bad.status).toBe(422);
    const body = await bad.json();
    expect(body.errors[0]).toMatchObject({ code: "literal_not_in_quote", field: "amount" });

    expect((await postClaim(json("/api/claims", { predicate_id: "x" }))).status).toBe(400);
    expect((await getState().then((r) => r.json())).claims).toHaveLength(1);
  });

  it("reviews a claim and enforces legal transitions", async () => {
    const { source_id } = await (await postSource(json("/api/sources", source))).json();
    const { claim_id } = await (await postClaim(json("/api/claims", claim(source_id)))).json();
    const ctx = { params: Promise.resolve({ id: claim_id }) };

    expect((await postReview(json("", { type: "retracted" }), ctx)).status).toBe(409);
    expect((await postReview(json("", { type: "approved" }), ctx)).status).toBe(200);
    expect((await postReview(json("", { type: "rejected" }), ctx)).status).toBe(409);
    expect((await postReview(json("", { type: "bogus" }), ctx)).status).toBe(400);
    expect((await postReview(json("", { type: "approved" }), { params: Promise.resolve({ id: "nope" }) })).status).toBe(409);

    const s = await (await getState()).json();
    expect(s.claims[0].status).toBe("approved");
    expect(s.verify.ok).toBe(true);
  });

  it("seeds sample data", async () => {
    expect(await (await postSeed()).json()).toEqual({ sources: 3, claims: 3 });
    expect((await (await getState()).json()).claims).toHaveLength(3);
  });

  describe("debug routes", () => {
    const get = (url: string) => new Request(`http://test${url}`);

    it("serves schema, rows, sql and verify over seeded data", async () => {
      await postSeed();
      const schema = await (await getSchema()).json();
      expect(schema.find((t: { name: string }) => t.name === "sources").count).toBe(3);

      const rows = await (await getRows(get("/api/debug/rows?table=sources&limit=2&sort=occurred_at&dir=desc"))).json();
      expect(rows.rows).toHaveLength(2);
      expect(rows.total).toBe(3);

      const filtered = await (await getRows(get("/api/debug/rows?table=sources&q=semola"))).json();
      expect(filtered.total).toBe(1);
      const exact = await (await getRows(get(`/api/debug/rows?table=quotes&eqCol=source_id&eqVal=${rows.rows[0].source_id}`))).json();
      expect(exact.rows.every((r: { source_id: string }) => r.source_id === rows.rows[0].source_id)).toBe(true);

      const sql = await postSql(json("/api/debug/sql", { sql: "SELECT COUNT(*) AS n FROM claims" }));
      expect((await sql.json()).rows).toEqual([[3]]);

      const v = await (await getVerify()).json();
      expect(v.ok).toBe(true);
      expect(v.coverage.every((c: { rows: number; logged: number }) => c.rows === c.logged)).toBe(true);
    });

    it("rejects bad input with 400, never 500", async () => {
      expect((await getRows(get("/api/debug/rows"))).status).toBe(400);
      expect((await getRows(get("/api/debug/rows?table=nope"))).status).toBe(400);
      expect((await getRows(get("/api/debug/rows?table=log&sort=bad"))).status).toBe(400);
      expect((await postSql(json("/api/debug/sql", { sql: "DROP TABLE claims" }))).status).toBe(400);
      expect((await postSql(json("/api/debug/sql", { nope: 1 }))).status).toBe(400);
      expect((await postSql(json("/api/debug/sql", "not json"))).status).toBe(400);
    });
  });

  describe("ingest routes", () => {
    it("scans every source folder and reports status per kind", async () => {
      const inbox = mkdtempSync(join(tmpdir(), "api-inbox-"));
      const news = mkdtempSync(join(tmpdir(), "api-news-"));
      const docs = join(mkdtempSync(join(tmpdir(), "api-docs-")), "not-created-yet");
      process.env.BRAIN_INBOX = inbox;
      process.env.BRAIN_NEWS = news;
      process.env.BRAIN_DOCS = docs;
      try {
        mkdirSync(join(news, "sub"), { recursive: true });
        writeFileSync(join(inbox, "a.md"), "---\nmessage_id: m1\ndate: 2026-10-12T09:00:00Z\nfrom: a@x.example\nto: b@x.example\nsubject: s\n---\nCiao 412 €/t\n");
        writeFileSync(join(news, "sub", "n.md"), "---\narticle_id: n1\ndomain: example.com\ndate: 2026-11-21\ntitle: t\n---\nTesto\n");
        writeFileSync(join(news, "bad.md"), "no header");

        const scan = await (await postScan()).json();
        expect(scan.outcomes.map((o: { kind: string; result: string }) => `${o.kind}:${o.result}`).sort()).toEqual(["email:ingested", "news:ingested", "news:invalid"]);
        expect((await (await postScan()).json()).outcomes).toEqual([]);

        const st = await (await getIngestStatus()).json();
        expect(st.folders).toEqual({ email: inbox, news, document: docs });
        expect(st.events).toHaveLength(3);
        expect(st.events.find((e: { kind: string; result: string }) => e.kind === "news" && e.result === "ingested").domain).toBe("example.com");
        expect(st.counts).toEqual(expect.arrayContaining([{ kind: "news", result: "invalid", n: 1 }]));
      } finally {
        delete process.env.BRAIN_INBOX;
        delete process.env.BRAIN_NEWS;
        delete process.env.BRAIN_DOCS;
      }
    });
  });
});
