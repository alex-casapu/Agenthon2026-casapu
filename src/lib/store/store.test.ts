import { memDb } from "../testkit";
import { mkdtempSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSource, openDb, reviewClaim, submitClaim, TRUST_ACTOR, verify, listClaims, type DB } from ".";
import { migrate } from "./migrate";

const TEXT = "Hi, the October lot of durum semolina is €412 per tonne, valid until 31 December. Regards";
let db: DB;
let sourceId: string;

const priceInput = (sid: string) => ({
  predicate_id: "supplier_price",
  evidence: [{ source_id: sid, quote: "durum semolina is €412 per tonne, valid until 31 December" }],
  fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t", valid_to: "2026-12-31" },
});

beforeEach(() => {
  db = memDb();
  sourceId = insertSource(db, {
    kind: "email",
    external_id: "msg-1",
    author: "rossi@supplier.example",
    occurred_at: "2026-10-12T09:00:00Z",
    raw: TEXT.replace("Hi,", "Hi,\r\n"),
  }).source_id;
});

describe("store", () => {
  it("saves a grounded claim as proposed and verifies clean", () => {
    const r = submitClaim(db, priceInput(sourceId));
    expect(r).toMatchObject({ ok: true, duplicate: false });
    const [c] = listClaims(db);
    expect(c.status).toBe("proposed");
    expect(c.evidence[0].text).toBe("durum semolina is €412 per tonne, valid until 31 December");
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("does not save a claim the gate rejects", () => {
    const bad = priceInput(sourceId);
    bad.fields.amount = 999;
    expect(submitClaim(db, bad)).toMatchObject({ ok: false });
    expect(listClaims(db)).toHaveLength(0);
  });

  it("is idempotent", () => {
    submitClaim(db, priceInput(sourceId));
    expect(submitClaim(db, priceInput(sourceId))).toMatchObject({ ok: true, duplicate: true });
    expect(listClaims(db)).toHaveLength(1);
    expect(insertSource(db, { kind: "email", external_id: "msg-1", occurred_at: "2026-10-12T09:00:00Z", raw: TEXT.replace("Hi,", "Hi,\r\n") }).created).toBe(false);
  });

  it("only allows legal status transitions", () => {
    const r = submitClaim(db, priceInput(sourceId));
    if (!r.ok) throw new Error();
    expect(reviewClaim(db, r.claim_id, "retracted", "u")).toMatchObject({ ok: false });
    expect(reviewClaim(db, r.claim_id, "approved", "u")).toMatchObject({ ok: true });
    expect(reviewClaim(db, r.claim_id, "approved", "u")).toMatchObject({ ok: false }); // already approved
    expect(listClaims(db)[0].status).toBe("approved");
    expect(reviewClaim(db, r.claim_id, "rejected", "u", "wrong")).toMatchObject({ ok: true }); // a curator can reject a trusted claim
    expect(listClaims(db)[0].status).toBe("rejected");
    expect(reviewClaim(db, r.claim_id, "approved", "u")).toMatchObject({ ok: false }); // rejection is final
    expect(verify(db).ok).toBe(true);
  });

  describe("trust by default", () => {
    const history = () => db.prepare("SELECT type, actor, reason FROM claim_events ORDER BY seq").all();

    it("approves on admission by the policy, in the same transaction, and says so", () => {
      const r = submitClaim(db, priceInput(sourceId), "agent:extractor", { trust: true });
      expect(r).toMatchObject({ ok: true, duplicate: false, trusted: true });
      expect(listClaims(db)[0].status).toBe("approved");
      expect(history()).toEqual([
        { type: "proposed", actor: "agent:extractor", reason: null },
        { type: "approved", actor: TRUST_ACTOR, reason: "trusted by default: usable without curator review" },
      ]);
      expect(verify(db)).toMatchObject({ ok: true, problems: [] });
    });

    it("without it, a claim waits for a person", () => {
      expect(submitClaim(db, priceInput(sourceId), "agent:extractor", { trust: false })).toMatchObject({ ok: true, duplicate: false });
      expect(submitClaim(db, { ...priceInput(sourceId), fields: { ...priceInput(sourceId).fields, amount: 412 } }, "agent:extractor")).toMatchObject({ duplicate: true });
      expect(listClaims(db)[0].status).toBe("proposed");
      expect(history()).toHaveLength(1);
    });

    it("a claim a curator rejected stays rejected when the same fact is read again", () => {
      const r = submitClaim(db, priceInput(sourceId), "agent:extractor", { trust: true });
      if (!r.ok) throw new Error();
      reviewClaim(db, r.claim_id, "rejected", "human:marta", "not what the email says");
      const again = submitClaim(db, priceInput(sourceId), "agent:extractor", { trust: true });
      expect(again).toMatchObject({ ok: true, duplicate: true });
      expect("trusted" in again).toBe(false);
      expect(listClaims(db)[0].status).toBe("rejected");
      expect(history().map((h) => (h as { type: string }).type)).toEqual(["proposed", "approved", "rejected"]); // no second approval
    });

    it("a gate rejection is not trusted into existence", () => {
      const bad = priceInput(sourceId);
      bad.fields.amount = 999;
      expect(submitClaim(db, bad, "agent:extractor", { trust: true })).toMatchObject({ ok: false });
      expect(listClaims(db)).toHaveLength(0);
      expect(history()).toEqual([]);
    });
  });

  it("blocks UPDATE and DELETE on every table", () => {
    submitClaim(db, priceInput(sourceId));
    for (const t of ["sources", "quotes", "claims", "claim_evidence", "claim_events", "predicates", "log", "schema_migrations"]) {
      expect(() => db.prepare(`DELETE FROM ${t}`).run(), t).toThrow(/append-only/);
      expect(() => db.prepare(`UPDATE ${t} SET rowid = rowid`).run(), t).toThrow(/append-only/);
    }
  });

  it("rejects a non-verbatim quote at the database level", () => {
    expect(() =>
      db.prepare('INSERT INTO quotes (quote_id, source_id, start, "end", text) VALUES (?, ?, ?, ?, ?)').run("x", sourceId, 0, 10, "not the text"),
    ).toThrow(/verbatim/);
  });

  it("stores code-point offsets that survive emoji", () => {
    const sid = insertSource(db, { kind: "chat", external_id: "c1", occurred_at: "2026-10-12T09:00:00Z", raw: "🍝🍝 we commit to ship pallets on 2026-11-03 ✅" }).source_id;
    const r = submitClaim(db, {
      predicate_id: "commitment",
      evidence: [{ source_id: sid, quote: "we commit to ship pallets on 2026-11-03" }],
      fields: { owner: "ent:pastaco", action: "ship pallets", due: "2026-11-03" },
    });
    expect(r.ok).toBe(true);
    expect(verify(db).ok).toBe(true);
  });
});

describe("tamper evidence", () => {
  beforeEach(() => {
    submitClaim(db, priceInput(sourceId));
  });

  it("detects an altered claim even if triggers are dropped", () => {
    db.exec("DROP TRIGGER claims_no_update");
    db.exec("UPDATE claims SET value = '{\"amount\":1}'");
    const rep = verify(db);
    expect(rep.ok).toBe(false);
    expect(rep.problems.join("\n")).toMatch(/was altered/);
  });

  it("detects an altered source and a rewritten log", () => {
    db.exec("DROP TRIGGER sources_no_update");
    db.exec("UPDATE sources SET canonical_text = replace(canonical_text, '412', '312')");
    expect(verify(db).ok).toBe(false);

    const db2 = memDb();
    const sid = insertSource(db2, { kind: "email", external_id: "a", occurred_at: "2026-10-12T09:00:00Z", raw: "hello there" }).source_id;
    expect(sid).toBeTruthy();
    db2.exec("DROP TRIGGER log_no_update");
    db2.exec("UPDATE log SET payload_hash = 'f' WHERE seq = 2");
    expect(verify(db2).problems.join("\n")).toMatch(/hash mismatch/);
  });

  it("detects a row written behind the log's back", () => {
    db.exec("DROP TRIGGER claim_events_no_update");
    db.prepare("INSERT INTO claim_events (claim_id, type, actor, created_at) SELECT claim_id, 'approved', 'attacker', 'x' FROM claims").run();
    expect(verify(db).problems.join("\n")).toMatch(/claim_events: 2 rows but 1 log entries/);
  });
});

describe("migrations", () => {
  it("refuses to run when an applied migration was edited", () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    cpSync(join(process.cwd(), "migrations"), dir, { recursive: true });
    const d = openDb(":memory:", dir);
    writeFileSync(join(dir, "001_core.sql"), "-- edited\n");
    expect(() => migrate(d, dir)).toThrow(/modified after being applied/);
  });
});
