import { beforeEach, describe, expect, it } from "vitest";
import { loadSample } from "../sample";
import { openDb, type DB } from ".";
import { DebugError, listSchema, logCoverage, queryRows, runReadonlySql } from "./debug";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  loadSample(db);
});

describe("listSchema", () => {
  it("lists every table and view with counts, columns and foreign keys", () => {
    const s = listSchema(db);
    const names = s.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["sources", "quotes", "claims", "claim_evidence", "claim_events", "predicates", "log", "schema_migrations", "claim_status"]));
    expect(names).not.toContain("sqlite_sequence");
    expect(s.find((t) => t.name === "sources")?.count).toBe(3);
    expect(s.find((t) => t.name === "claim_status")?.type).toBe("view");
    expect(s.find((t) => t.name === "quotes")?.fks).toContainEqual({ from: "source_id", table: "sources", to: "source_id" });
    expect(s.find((t) => t.name === "quotes")?.columns.find((c) => c.name === "quote_id")?.pk).toBe(true);
  });
});

describe("queryRows", () => {
  it("pages and reports the total", () => {
    const a = queryRows(db, { table: "log", limit: 5, offset: 0 });
    expect(a.rows).toHaveLength(5);
    expect(a.total).toBeGreaterThan(5);
    const b = queryRows(db, { table: "log", limit: 5, offset: 5 });
    expect(b.rows[0]).not.toEqual(a.rows[0]);
  });
  it("sorts by a real column in both directions", () => {
    const asc = queryRows(db, { table: "log", sort: "seq", dir: "asc", limit: 1 }).rows[0].seq as number;
    const desc = queryRows(db, { table: "log", sort: "seq", dir: "desc", limit: 1 }).rows[0].seq as number;
    expect(desc).toBeGreaterThan(asc);
  });
  it("searches across all columns, treating % and _ literally", () => {
    expect(queryRows(db, { table: "sources", q: "semola" }).total).toBe(1);
    expect(queryRows(db, { table: "sources", q: "%" }).total).toBe(0);
    expect(queryRows(db, { table: "sources", q: "SEMOLA" }).total).toBe(1);
  });
  it("filters by exact column value", () => {
    const sid = queryRows(db, { table: "sources", limit: 1 }).rows[0].source_id as string;
    const r = queryRows(db, { table: "quotes", eq: { col: "source_id", val: sid } });
    expect(r.rows.every((x) => x.source_id === sid)).toBe(true);
    expect(r.total).toBeGreaterThan(0);
  });
  it("works on views", () => {
    expect(queryRows(db, { table: "claim_status" }).total).toBe(3);
  });
  it("clamps silly limits and offsets", () => {
    expect(queryRows(db, { table: "log", limit: -5, offset: -9 }).rows).toHaveLength(1);
    expect(queryRows(db, { table: "log", limit: 10 ** 9 }).limit).toBe(50_000);
  });
  it("refuses unknown tables and columns, and injection through identifiers", () => {
    expect(() => queryRows(db, { table: "nope" })).toThrow(DebugError);
    expect(() => queryRows(db, { table: 'log"; DROP TABLE log; --' })).toThrow(DebugError);
    expect(() => queryRows(db, { table: "log", sort: "seq; DROP TABLE log" })).toThrow(DebugError);
    expect(() => queryRows(db, { table: "log", eq: { col: "x", val: "1" } })).toThrow(DebugError);
    expect(queryRows(db, { table: "log", q: "'; DROP TABLE log; --" }).total).toBe(0);
    expect(queryRows(db, { table: "log" }).total).toBeGreaterThan(0);
  });
});

describe("runReadonlySql", () => {
  it("runs SELECTs and keeps duplicate column names", () => {
    const r = runReadonlySql(db, "SELECT c.claim_id, s.claim_id FROM claims c JOIN claim_status s USING (claim_id)");
    expect(r.columns).toEqual(["claim_id", "claim_id"]);
    expect(r.rowCount).toBe(3);
    expect(r.truncated).toBe(false);
  });
  it("supports CTEs and joins across tables", () => {
    const r = runReadonlySql(db, "WITH n AS (SELECT COUNT(*) AS n FROM quotes) SELECT n FROM n");
    expect(r.rows[0][0]).toBe(3);
  });
  it("truncates at the cap and says so", () => {
    const r = runReadonlySql(db, "SELECT * FROM log", 2);
    expect(r.rowCount).toBe(2);
    expect(r.truncated).toBe(true);
  });
  it("refuses writes, multiple statements, PRAGMA and junk — and changes nothing", () => {
    for (const sql of [
      "DELETE FROM claims",
      "INSERT INTO claim_events (claim_id, type, actor, created_at) VALUES ('x','approved','a','b')",
      "DROP TABLE claims",
      "SELECT 1; DROP TABLE claims",
      "PRAGMA writable_schema = 1",
      "ATTACH DATABASE ':memory:' AS x",
      "SELEC nonsense",
      "   ",
    ])
      expect(() => runReadonlySql(db, sql), sql).toThrow(DebugError);
    expect(queryRows(db, { table: "claims" }).total).toBe(3);
  });
});

describe("logCoverage", () => {
  it("shows every table fully logged", () => {
    const c = logCoverage(db);
    expect(c.length).toBeGreaterThan(0);
    for (const t of c) expect(t.logged, t.tbl).toBe(t.rows);
  });
});
