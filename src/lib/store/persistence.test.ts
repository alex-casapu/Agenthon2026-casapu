import { memDb } from "../testkit";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { admitEntity, recordPrincipals, getDb, insertSource, listClaims, listEntities, listSources, openDb, seedEntities, submitClaim, verify, type DB } from ".";
import { chainHash, GENESIS, rowPayloadHash } from "./log";
import { DEMO_ENTITIES } from "../demo-entities";
import { ENTITIES } from "../entities";
import { DEFAULT_PRINCIPALS } from "../policy";
import { PREDICATES } from "../predicates";

const tmpPath = () => join(mkdtempSync(join(tmpdir(), "brain-")), "sub", "brain.db");

/** An attacker with full write access who also recomputes the entire hash chain. */
function rechain(db: DB) {
  db.exec("DROP TRIGGER log_no_update");
  let prev = GENESIS;
  for (const e of db.prepare("SELECT * FROM log ORDER BY seq").all() as {
    seq: number; tbl: string; row_id: string; payload_hash: string; created_at: string;
  }[]) {
    const payload = e.tbl === "schema_migrations" ? e.payload_hash : rowPayloadHash(db, e.tbl, e.row_id)!;
    const hash = chainHash(prev, e.tbl, e.row_id, payload, e.created_at);
    db.prepare("UPDATE log SET payload_hash = ?, prev_hash = ?, hash = ? WHERE seq = ?").run(payload, prev, hash, e.seq);
    prev = hash;
  }
}

describe("file-backed database", () => {
  it("creates missing directories and survives a reopen unchanged", () => {
    const path = tmpPath();
    const a = openDb(path);
    const sid = insertSource(a, { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "price is €412 per tonne" }).source_id;
    submitClaim(a, {
      predicate_id: "statement",
      fields: { text: "A price was quoted." },
      evidence: [{ source_id: sid, quote: "price is €412 per tonne" }],
    });
    a.close();

    const b = openDb(path);
    expect(listSources(b)).toHaveLength(1);
    expect(listClaims(b)).toHaveLength(1);
    expect((b.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n).toBe(
      readdirSync(join(process.cwd(), "migrations")).filter((f) => f.endsWith(".sql")).length,
    );
    expect((b.prepare("SELECT COUNT(*) AS n FROM predicates").get() as { n: number }).n).toBe(PREDICATES.length);
    expect(verify(b).ok).toBe(true);
  });

  it("refuses to start when a predicate definition changed without a version bump", () => {
    const path = tmpPath();
    openDb(path).close();
    const original = PREDICATES[0].description;
    PREDICATES[0].description = original + " (edited)";
    try {
      expect(() => openDb(path)).toThrow(/without a version bump/);
    } finally {
      PREDICATES[0].description = original;
    }
  });

  it("getDb returns one shared instance", () => {
    const g = globalThis as unknown as { __brainDb?: DB };
    delete g.__brainDb;
    process.env.BRAIN_DB = ":memory:";
    expect(getDb()).toBe(getDb());
    delete g.__brainDb;
  });
});

describe("verify() beyond the hash chain", () => {
  it("catches a fabricated value even when the attacker rewrites the whole chain", () => {
    const db = memDb();
    const sid = insertSource(db, { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "the lot is €412 per tonne, valid until 31 December" }).source_id;
    const r = submitClaim(db, {
      predicate_id: "supplier_price",
      fields: { supplier: "ent:molino_rossi", item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t" },
      evidence: [{ source_id: sid, quote: "the lot is €412 per tonne" }],
    });
    expect(r.ok).toBe(true);

    db.exec("DROP TRIGGER claims_no_update");
    db.exec(`UPDATE claims SET value = '{"amount":999,"currency":"EUR","per":"t"}'`);
    rechain(db);

    const rep = verify(db);
    expect(rep.problems.join("\n")).not.toMatch(/was altered|hash mismatch|does not link/);
    expect(rep.problems.join("\n")).toMatch(/fails the gate/);
    expect(rep.ok).toBe(false);
  });

  it("catches a quote that no longer matches its source", () => {
    const db = memDb();
    const sid = insertSource(db, { kind: "chat", external_id: "c1", occurred_at: "2026-10-12T09:00:00Z", raw: "we ship on 2026-11-03 for sure" }).source_id;
    submitClaim(db, {
      predicate_id: "commitment",
      fields: { owner: "ent:pastaco", action: "ship", due: "2026-11-03" },
      evidence: [{ source_id: sid, quote: "we ship on 2026-11-03" }],
    });
    db.exec("DROP TRIGGER quotes_no_update");
    db.exec("DROP TRIGGER quotes_verbatim");
    db.exec("UPDATE quotes SET text = 'we ship on 2026-11-09'");
    rechain(db);
    expect(verify(db).problems.join("\n")).toMatch(/not a verbatim slice/);
  });

  it("catches a source whose text no longer matches its id", () => {
    const db = memDb();
    insertSource(db, { kind: "doc", external_id: "d1", occurred_at: "2026-10-12T09:00:00Z", raw: "original text" });
    db.exec("DROP TRIGGER sources_no_update");
    db.exec("UPDATE sources SET raw = 'forged', canonical_text = 'forged'");
    rechain(db);
    expect(verify(db).problems.join("\n")).toMatch(/id does not match content/);
  });

  it("reports a clean empty database as ok", () => {
    expect(verify(memDb())).toMatchObject({ ok: true, problems: [] });
  });
});

describe("registries", () => {
  it("records principals append-only and hash-chained, and starts with no entities", () => {
    const db = openDb(":memory:");
    expect((db.prepare("SELECT COUNT(*) AS n FROM principals").get() as { n: number }).n).toBe(DEFAULT_PRINCIPALS.length);
    expect((db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number }).n).toBe(ENTITIES.length);
    seedEntities(db, DEMO_ENTITIES);
    expect(() => db.prepare("DELETE FROM entities").run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE principals SET version = 2").run()).toThrow(/append-only/);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("a changed principal is a new, logged version, not an error and not a silent overwrite", () => {
    const db = openDb(":memory:");
    const before = (db.prepare("SELECT COUNT(*) AS n FROM principals").get() as { n: number }).n;
    const changed = DEFAULT_PRINCIPALS.map((p) => (p.id === "luca" ? { ...p, clearances: [...p.clearances, "hr"] } : p));
    recordPrincipals(db, changed);
    recordPrincipals(db, changed); // unchanged: nothing more is written
    expect((db.prepare("SELECT COUNT(*) AS n FROM principals").get() as { n: number }).n).toBe(before + 1);
    expect(db.prepare("SELECT version FROM principals WHERE principal_id = 'luca' ORDER BY version").all()).toEqual([{ version: 1 }, { version: 2 }]);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("discovered entities survive a restart and are not mistaken for tampering", () => {
    const path = tmpPath();
    const a = openDb(path);
    const sid = insertSource(a, { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "Offerta di Molino Nuovo: 412 €/t, valida fino al 31 dicembre" }).source_id;
    expect(admitEntity(a, { name: "Molino Nuovo", kind: "organization", quote: "Offerta di Molino Nuovo" }, sid)).toMatchObject({ ok: true, created: true });
    a.close();
    const b = openDb(path);
    expect(listEntities(b).map((e) => e.id)).toContain("ent:molino_nuovo");
    expect(verify(b)).toMatchObject({ ok: true, problems: [] });
  });

  it("submitClaim needs known entities; a discovered one makes the claim admissible; verify never applies the rule", () => {
    const db = openDb(":memory:");
    const sid = insertSource(db, { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "Molino Nuovo: il lotto è a 412 €/t, valido fino al 31 dicembre" }).source_id;
    const claim = (supplier: string) => ({
      predicate_id: "supplier_price",
      evidence: [{ source_id: sid, quote: "il lotto è a 412 €/t" }],
      fields: { supplier, item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t" },
    });
    const bad = submitClaim(db, claim("ent:molino_nuovo"));
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(bad.errors.map((e) => e.code)).toEqual(expect.arrayContaining(["unknown_entity"]));
    expect(listClaims(db)).toHaveLength(0);

    seedEntities(db, DEMO_ENTITIES);
    expect(admitEntity(db, { name: "Molino Nuovo", kind: "organization", quote: "Molino Nuovo: il lotto" }, sid).ok).toBe(true);
    expect(submitClaim(db, claim("ent:molino_nuovo")).ok).toBe(true);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });
});
