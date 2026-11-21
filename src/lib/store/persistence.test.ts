import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getDb, insertSource, listClaims, listSources, openDb, submitClaim, verify, type DB } from ".";
import { chainHash, GENESIS, rowPayloadHash } from "./log";
import { ENTITIES } from "../entities";
import { PRINCIPALS } from "../policy";
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
    const db = openDb(":memory:");
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
    const db = openDb(":memory:");
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
    const db = openDb(":memory:");
    insertSource(db, { kind: "doc", external_id: "d1", occurred_at: "2026-10-12T09:00:00Z", raw: "original text" });
    db.exec("DROP TRIGGER sources_no_update");
    db.exec("UPDATE sources SET raw = 'forged', canonical_text = 'forged'");
    rechain(db);
    expect(verify(db).problems.join("\n")).toMatch(/id does not match content/);
  });

  it("reports a clean empty database as ok", () => {
    expect(verify(openDb(":memory:"))).toMatchObject({ ok: true, problems: [] });
  });
});

describe("registries", () => {
  it("records principals and entities append-only and hash-chained", () => {
    const db = openDb(":memory:");
    expect((db.prepare("SELECT COUNT(*) AS n FROM principals").get() as { n: number }).n).toBe(PRINCIPALS.length);
    expect((db.prepare("SELECT COUNT(*) AS n FROM entities").get() as { n: number }).n).toBe(ENTITIES.length);
    expect(() => db.prepare("DELETE FROM entities").run()).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE principals SET version = 2").run()).toThrow(/append-only/);
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });

  it("refuses to start when a principal or an entity changed without a version bump", () => {
    const path = tmpPath();
    openDb(path).close();
    const p = PRINCIPALS[1];
    const was = p.clearances;
    p.clearances = [...was, "hr"];
    try {
      expect(() => openDb(path)).toThrow(/Principal luca v1 changed without a version bump/);
    } finally {
      p.clearances = was;
    }
    const e = ENTITIES[0];
    const name = e.name;
    e.name = name + " (renamed)";
    try {
      expect(() => openDb(path)).toThrow(/Entity ent:pastaco v1 changed without a version bump/);
    } finally {
      e.name = name;
    }
  });

  it("submitClaim enforces the registry; verify tolerates claims admitted before an entity was removed", () => {
    const db = openDb(":memory:");
    const sid = insertSource(db, { kind: "email", external_id: "m1", occurred_at: "2026-10-12T09:00:00Z", raw: "il lotto è a 412 €/t, valido fino al 31 dicembre" }).source_id;
    const claim = (supplier: string) => ({
      predicate_id: "supplier_price",
      evidence: [{ source_id: sid, quote: "è a 412 €/t" }],
      fields: { supplier, item: "ent:durum_semolina", amount: 412, currency: "EUR", per: "t" },
    });
    const bad = submitClaim(db, claim("ent:nobody"));
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(bad.errors[0].code).toBe("unknown_entity");
    expect(listClaims(db)).toHaveLength(0);

    // admit a claim for an entity that is later dropped from the registry
    ENTITIES.push({ id: "ent:temporary", version: 1, name: "Temporary", kind: "organization", aliases: [] });
    try {
      expect(submitClaim(db, claim("ent:temporary")).ok).toBe(true);
    } finally {
      ENTITIES.pop();
    }
    expect(verify(db)).toMatchObject({ ok: true, problems: [] });
  });
});
