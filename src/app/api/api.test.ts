import { beforeEach, describe, expect, it, vi } from "vitest";

// connection() only works inside a Next request; routes are called directly here.
vi.mock("next/server", () => ({ connection: async () => {} }));

import { getDb, insertSource, submitClaim } from "@/lib/store";
import { GET as getState } from "./state/route";
import { POST as postSource } from "./sources/route";
import { POST as postClaim } from "./claims/route";
import { POST as postReview } from "./claims/[id]/review/route";
import { POST as postSeed } from "./seed/route";
import { GET as getSchema } from "./debug/schema/route";
import { GET as getRows } from "./debug/rows/route";
import { POST as postSql } from "./debug/sql/route";
import { GET as getVerify } from "./debug/verify/route";
import { GET as getClaimViews } from "./debug/claims/route";
import { POST as postScan } from "./ingest/scan/route";
import { POST as postExtract } from "./extract/route";
import { GET as getIngestStatus } from "./ingest/status/route";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const json = (url: string, body: unknown, cookie?: string) =>
  new Request(`http://test${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const as = (id: string) => `brain_principal=${id}`;
// the latest claim event's actor, straight from the database
const lastActor = () => (getDb().prepare("SELECT actor FROM claim_events ORDER BY seq DESC LIMIT 1").get() as { actor: string }).actor;

const source = { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "the lot is €412 per tonne, valid until 31 December" };
const claim = (source_id: string, amount = 412) => ({
  predicate_id: "supplier_price",
  fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount, currency: "EUR", per: "t" },
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

  it("reviews a claim as a curator and enforces legal transitions", async () => {
    const { source_id } = await (await postSource(json("/api/sources", source))).json();
    const { claim_id } = await (await postClaim(json("/api/claims", claim(source_id)))).json();
    const ctx = { params: Promise.resolve({ id: claim_id }) };
    const marta = as("marta");

    expect((await postReview(json("", { type: "retracted" }, marta), ctx)).status).toBe(409);
    expect((await postReview(json("", { type: "approved" }, marta), ctx)).status).toBe(200);
    expect((await postReview(json("", { type: "rejected" }, marta), ctx)).status).toBe(409);
    expect((await postReview(json("", { type: "bogus" }, marta), ctx)).status).toBe(400);
    expect((await postReview(json("", { type: "approved" }, marta), { params: Promise.resolve({ id: "nope" }) })).status).toBe(409);

    const s = await (await getState()).json();
    expect(s.claims[0].status).toBe("approved");
    expect(s.verify.ok).toBe(true);
    expect(lastActor()).toBe("human:marta");
  });

  it("only a named curator may curate; the actor is the principal, not a client claim", async () => {
    const { source_id } = await (await postSource(json("/api/sources", source))).json();
    const { claim_id } = await (await postClaim(json("/api/claims", claim(source_id)))).json();
    const ctx = { params: Promise.resolve({ id: claim_id }) };

    const none = await postReview(json("", { type: "approved" }), ctx);
    expect(none.status).toBe(403);
    expect((await none.json()).error).toMatch(/role switcher/);
    for (const who of ["luca", "sara"]) {
      const r = await postReview(json("", { type: "approved", actor: "human:marta" }, as(who)), ctx);
      expect(r.status, who).toBe(403);
      expect((await r.json()).error).toMatch(/cannot curate/);
    }
    expect((await postReview(json("", { type: "approved" }, "brain_principal=nobody"), ctx)).status).toBe(403);
    expect((await (await getState()).json()).claims[0].status).toBe("proposed");

    expect((await postReview(json("", { type: "approved", actor: "human:sara" }, as("marta")), ctx)).status).toBe(200);
    expect(lastActor()).toBe("human:marta");
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

    it("serves human-friendly claim views, filtered by the acting role", async () => {
      await postSeed();
      const view = async (cookie?: string) =>
        (await getClaimViews(new Request("http://test/api/debug/claims", { headers: cookie ? { cookie } : {} }))).json();

      const god = await view();
      expect(god).toMatchObject({ principal: null, total: 3 });
      expect(god.claims).toHaveLength(3);
      expect(god.claims[0]).toMatchObject({ status: "proposed", labels: ["public"], visible_to: ["marta", "luca", "sara"] });
      expect(typeof god.claims[0].sentence).toBe("string");
      expect(god.claims[0].evidence[0].source.external_id).toMatch(/^sample-/);

      const sara = await view(as("sara"));
      expect(sara.principal).toMatchObject({ id: "sara", role: "Production" });
      expect(sara.total).toBe(3);
      expect(sara.claims).toHaveLength(3); // sample data is all public

      // a finance-only source makes its claim invisible to Production, visible to Finance and Purchasing
      const db = getDb();
      const secret = insertSource(db, { kind: "email", external_id: "fin1", occurred_at: "2026-10-12T09:00:00Z", raw: "the lot is €412 per tonne", acl_labels: ["finance"] });
      expect(
        submitClaim(db, {
          predicate_id: "supplier_price",
          fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t" },
          evidence: [{ source_id: secret.source_id, quote: "the lot is €412 per tonne" }],
        }).ok,
      ).toBe(true);

      const counts = async (id: string) => {
        const v = await view(as(id));
        return [v.total, v.claims.length];
      };
      expect(await counts("sara")).toEqual([4, 3]);
      expect(await counts("luca")).toEqual([4, 4]);
      expect(await counts("marta")).toEqual([4, 4]);
      expect((await view()).claims).toHaveLength(4);
      const hidden = (await view()).claims.find((c: { labels: string[] }) => c.labels.includes("finance"));
      expect(hidden.visible_to).toEqual(["marta", "luca"]);
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

  describe("extract route", () => {
    it("validates input and respects the off switch", async () => {
      process.env.BRAIN_EXTRACT = "off";
      try {
        expect((await postExtract(json("/api/extract", { source_id: 5 }))).status).toBe(400);
        const off = await postExtract(json("/api/extract", {}));
        expect(off.status).toBe(409);
        expect((await off.json()).error).toMatch(/off/);
        const st = await (await getIngestStatus()).json();
        expect(st.extraction).toMatchObject({ enabled: false, queue: null, runs: [] });
      } finally {
        delete process.env.BRAIN_EXTRACT;
      }
    });
  });
});
