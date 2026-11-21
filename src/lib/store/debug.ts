import type { DB } from "./log";

/** Introspection for the god-mode debug GUI. Read-only by construction. */

export class DebugError extends Error {}

export interface ColumnInfo {
  name: string;
  type: string;
  pk: boolean;
  notnull: boolean;
}
export interface ForeignKey {
  from: string;
  table: string;
  to: string;
}
export interface TableInfo {
  name: string;
  type: "table" | "view";
  count: number;
  columns: ColumnInfo[];
  fks: ForeignKey[];
}

const q = (ident: string) => `"${ident.replace(/"/g, '""')}"`;

function objects(db: DB): { name: string; type: "table" | "view" }[] {
  return db
    .prepare("SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND substr(name, 1, 7) != 'sqlite_' ORDER BY type, name")
    .all() as { name: string; type: "table" | "view" }[];
}

function columnsOf(db: DB, table: string): ColumnInfo[] {
  return (db.prepare(`PRAGMA table_info(${q(table)})`).all() as { name: string; type: string; pk: number; notnull: number }[]).map(
    (c) => ({ name: c.name, type: c.type, pk: c.pk > 0, notnull: c.notnull === 1 }),
  );
}

export function listSchema(db: DB): TableInfo[] {
  return objects(db).map(({ name, type }) => ({
    name,
    type,
    count: (db.prepare(`SELECT COUNT(*) AS n FROM ${q(name)}`).get() as { n: number }).n,
    columns: columnsOf(db, name),
    fks:
      type === "table"
        ? (db.prepare(`PRAGMA foreign_key_list(${q(name)})`).all() as { from: string; table: string; to: string }[]).map((f) => ({
            from: f.from,
            table: f.table,
            to: f.to,
          }))
        : [],
  }));
}

export interface RowsQuery {
  table: string;
  limit?: number;
  offset?: number;
  sort?: string | null;
  dir?: "asc" | "desc";
  /** Substring match across every column. */
  q?: string;
  /** Exact match on one column. */
  eq?: { col: string; val: string } | null;
}

export interface RowsResult {
  columns: string[];
  rows: Record<string, unknown>[];
  total: number;
  limit: number;
  offset: number;
}

export const MAX_ROWS = 50_000;

export function queryRows(db: DB, o: RowsQuery): RowsResult {
  const obj = objects(db).find((x) => x.name === o.table);
  if (!obj) throw new DebugError(`unknown table ${o.table}`);
  const cols = columnsOf(db, obj.name).map((c) => c.name);

  const where: string[] = [];
  const params: unknown[] = [];
  if (o.eq) {
    if (!cols.includes(o.eq.col)) throw new DebugError(`unknown column ${o.eq.col}`);
    where.push(`CAST(${q(o.eq.col)} AS TEXT) = ?`);
    params.push(o.eq.val);
  }
  if (o.q) {
    where.push("(" + cols.map((c) => `CAST(${q(c)} AS TEXT) LIKE ? ESCAPE '\\'`).join(" OR ") + ")");
    const like = "%" + o.q.replace(/[\\%_]/g, "\\$&") + "%";
    for (let i = 0; i < cols.length; i++) params.push(like);
  }
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";

  let order = obj.type === "table" ? "ORDER BY rowid" : "";
  if (o.sort) {
    if (!cols.includes(o.sort)) throw new DebugError(`unknown column ${o.sort}`);
    order = `ORDER BY ${q(o.sort)} ${o.dir === "desc" ? "DESC" : "ASC"}`;
  }

  const limit = Math.min(Math.max(Math.trunc(o.limit ?? 100), 1), MAX_ROWS);
  const offset = Math.max(Math.trunc(o.offset ?? 0), 0);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM ${q(obj.name)} ${w}`).get(...params) as { n: number }).n;
  const rows = db
    .prepare(`SELECT * FROM ${q(obj.name)} ${w} ${order} LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as Record<string, unknown>[];
  return { columns: cols, rows, total, limit, offset };
}

export interface SqlResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
  truncated: boolean;
  ms: number;
}

/** Arbitrary read-only SQL. Writes, multiple statements and PRAGMAs are refused. */
export function runReadonlySql(db: DB, sql: string, max = 10_000): SqlResult {
  if (!sql.trim()) throw new DebugError("empty query");
  if (/^\s*pragma\b/i.test(sql)) throw new DebugError("PRAGMA is not allowed");
  let stmt;
  try {
    stmt = db.prepare(sql);
  } catch (e) {
    throw new DebugError((e as Error).message);
  }
  if (!stmt.reader || !stmt.readonly) throw new DebugError("only read-only SELECT statements are allowed");

  const t0 = performance.now();
  const columns = stmt.columns().map((c) => c.name);
  const cap = Math.min(Math.max(Math.trunc(max), 1), MAX_ROWS);
  const rows: unknown[][] = [];
  let truncated = false;
  for (const r of stmt.raw(true).iterate() as Iterable<unknown[]>) {
    if (rows.length >= cap) {
      truncated = true;
      break;
    }
    rows.push(r);
  }
  return { columns, rows, rowCount: rows.length, truncated, ms: Math.round((performance.now() - t0) * 10) / 10 };
}

/** Row counts per table next to their number of log entries (should match). */
export function logCoverage(db: DB): { tbl: string; rows: number; logged: number }[] {
  const logged = new Map(
    (db.prepare("SELECT tbl, COUNT(*) AS n FROM log GROUP BY tbl").all() as { tbl: string; n: number }[]).map((r) => [r.tbl, r.n]),
  );
  return objects(db)
    .filter((o) => o.type === "table" && o.name !== "log")
    .map((o) => ({
      tbl: o.name,
      rows: (db.prepare(`SELECT COUNT(*) AS n FROM ${q(o.name)}`).get() as { n: number }).n,
      logged: logged.get(o.name) ?? 0,
    }));
}
