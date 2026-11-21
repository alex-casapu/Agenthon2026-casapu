"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RowsResult, TableInfo } from "@/lib/store/debug";

type Row = Record<string, unknown>;
type Eq = { col: string; val: string };
type Query = { table: string; page: number; pageSize: number; sort: string | null; dir: "asc" | "desc"; q: string; eq: Eq | null; tick: number };

const PAGE_SIZES = [50, 100, 500, 1000, 5000];
const HEX64 = /^[0-9a-f]{64}$/;

/** Where an id-like column leads. */
const ID_TARGETS: Record<string, string> = { source_id: "sources", origin_source_id: "sources", quote_id: "quotes", claim_id: "claims", input_claim_id: "claims" };

function fmtCell(v: unknown): ReactNode {
  if (v === null || v === undefined) return <span className="null">null</span>;
  if (typeof v === "string" && HEX64.test(v)) return v.slice(0, 10) + "…";
  const s = String(v);
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

function pretty(v: unknown): ReactNode {
  if (typeof v === "string" && /^\s*[{[]/.test(v)) {
    try {
      return <pre>{JSON.stringify(JSON.parse(v), null, 2)}</pre>;
    } catch {
      /* not JSON */
    }
  }
  return <span className="v">{v === null ? <span className="null">null</span> : String(v)}</span>;
}

export default function TablesView() {
  const [schema, setSchema] = useState<TableInfo[] | null>(null);
  const [state, setState] = useState<Omit<Query, "tick">>({ table: "claims", page: 0, pageSize: 100, sort: null, dir: "asc", q: "", eq: null });
  const [tick, setTick] = useState(0);
  const [qInput, setQInput] = useState("");
  const [result, setResult] = useState<{ key: string; data?: RowsResult; error?: string } | null>(null);
  const [open, setOpen] = useState<Row | null>(null);

  const key = useMemo(() => JSON.stringify({ ...state, tick }), [state, tick]);

  useEffect(() => {
    let live = true;
    fetch("/api/debug/schema").then((r) => r.json()).then((d) => { if (live) setSchema(d); });
    return () => { live = false; };
  }, [tick]);

  useEffect(() => {
    let live = true;
    const s = JSON.parse(key) as Query;
    const p = new URLSearchParams({ table: s.table, limit: String(s.pageSize), offset: String(s.page * s.pageSize), dir: s.dir });
    if (s.sort) p.set("sort", s.sort);
    if (s.q) p.set("q", s.q);
    if (s.eq) { p.set("eqCol", s.eq.col); p.set("eqVal", s.eq.val); }
    fetch(`/api/debug/rows?${p}`)
      .then((r) => r.json())
      .then((d) => { if (live) setResult(d.error ? { key, error: d.error } : { key, data: d }); });
    return () => { live = false; };
  }, [key]);

  useEffect(() => {
    const t = setTimeout(() => setState((s) => (s.q === qInput ? s : { ...s, q: qInput, page: 0 })), 250);
    return () => clearTimeout(t);
  }, [qInput]);

  const table = schema?.find((t) => t.name === state.table);
  const loading = !result || result.key !== key;
  const data = result?.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / state.pageSize)) : 1;

  const pkCols = table?.columns.filter((c) => c.pk) ?? [];
  const singlePk = pkCols.length === 1 ? pkCols[0].name : null;

  function jump(tableName: string, col: string, val: string) {
    setQInput("");
    setOpen(null);
    setState({ table: tableName, page: 0, pageSize: state.pageSize, sort: null, dir: "asc", q: "", eq: { col, val } });
  }
  function pick(name: string) {
    setQInput("");
    setOpen(null);
    setState({ table: name, page: 0, pageSize: state.pageSize, sort: null, dir: "asc", q: "", eq: null });
  }
  function sortBy(col: string) {
    setState((s) => ({ ...s, page: 0, sort: col, dir: s.sort === col && s.dir === "asc" ? "desc" : "asc" }));
  }

  /** Link target for a column value, from FKs, id-like names, or the log's (tbl,row_id). */
  function target(col: string, row: Row): { table: string; col: string } | null {
    const fk = table?.fks.find((f) => f.from === col);
    if (fk) return { table: fk.table, col: fk.to };
    if (ID_TARGETS[col] && ID_TARGETS[col] !== state.table) return { table: ID_TARGETS[col], col: ID_TARGETS[col].replace(/s$/, "_id") };
    if (state.table === "log" && col === "row_id") {
      const t = String(row.tbl);
      const pk = schema?.find((x) => x.name === t)?.columns.filter((c) => c.pk);
      if (pk?.length === 1) return { table: t, col: pk[0].name };
    }
    return null;
  }

  /** Other tables that carry this table's primary key as a column. */
  const referencedBy =
    schema && singlePk
      ? schema.filter((t) => t.name !== state.table && t.columns.some((c) => c.name === singlePk)).map((t) => ({ table: t.name, col: singlePk }))
      : [];

  if (!schema) return <p className="muted">Loading schema…</p>;

  const tables = schema.filter((t) => t.type === "table");
  const views = schema.filter((t) => t.type === "view");

  return (
    <div className={`dbg${open ? " with-detail" : ""}`}>
      <aside className="tlist">
        <h4>Tables</h4>
        {tables.map((t) => (
          <button key={t.name} className={t.name === state.table ? "active" : ""} onClick={() => pick(t.name)}>
            <span>{t.name}</span>
            <span className="count">{t.count}</span>
          </button>
        ))}
        {views.length > 0 && <h4>Views</h4>}
        {views.map((t) => (
          <button key={t.name} className={t.name === state.table ? "active" : ""} onClick={() => pick(t.name)}>
            <span>{t.name}</span>
            <span className="count">{t.count}</span>
          </button>
        ))}
      </aside>

      <section>
        <div className="toolbar">
          <input placeholder="Search every column…" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          {state.eq && (
            <button className="chip filter" onClick={() => setState((s) => ({ ...s, eq: null, page: 0 }))} title="Remove filter">
              {state.eq.col} = {state.eq.val.length > 14 ? state.eq.val.slice(0, 12) + "…" : state.eq.val} ✕
            </button>
          )}
          <select value={state.pageSize} onChange={(e) => setState((s) => ({ ...s, pageSize: Number(e.target.value), page: 0 }))}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button onClick={() => setTick((t) => t + 1)}>Refresh</button>
          <span className="muted small">{data ? `${data.total} row${data.total === 1 ? "" : "s"}` : ""}{loading ? " · loading…" : ""}</span>
        </div>

        {result?.error && <p className="errors">{result.error}</p>}

        <div className="gridwrap">
          <table className="grid">
            <thead>
              <tr>
                {(table?.columns ?? []).map((c) => (
                  <th key={c.name} onClick={() => sortBy(c.name)}>
                    {c.pk && <span className="pk">● </span>}
                    {c.name}
                    <span className="ty">{c.type}</span>
                    {state.sort === c.name ? (state.dir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r, i) => (
                <tr key={i} className={open === r ? "sel" : ""} onClick={() => setOpen(open === r ? null : r)}>
                  {data.columns.map((c) => <td key={c} title={r[c] === null ? "null" : String(r[c])}>{fmtCell(r[c])}</td>)}
                </tr>
              ))}
              {data && data.rows.length === 0 && <tr><td colSpan={data.columns.length} className="muted">No rows.</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="pager">
          <button disabled={state.page === 0} onClick={() => setState((s) => ({ ...s, page: 0 }))}>«</button>
          <button disabled={state.page === 0} onClick={() => setState((s) => ({ ...s, page: s.page - 1 }))}>‹</button>
          <span className="muted small">page {state.page + 1} / {pages}</span>
          <button disabled={state.page + 1 >= pages} onClick={() => setState((s) => ({ ...s, page: s.page + 1 }))}>›</button>
          <button disabled={state.page + 1 >= pages} onClick={() => setState((s) => ({ ...s, page: pages - 1 }))}>»</button>
        </div>
      </section>

      {open && table && (
        <aside className="detail">
          <div className="row">
            <h3>{state.table}</h3>
            <span className="muted small">row detail</span>
            <button style={{ marginLeft: "auto" }} onClick={() => setOpen(null)}>✕</button>
          </div>
          <div className="kv">
            {table.columns.map((c) => {
              const v = open[c.name];
              const t = v !== null && v !== undefined ? target(c.name, open) : null;
              return (
                <div key={c.name}>
                  <div className="k">{c.name} <span className="muted">{c.type}</span></div>
                  {pretty(v)}
                  {t && <> <button className="link" onClick={() => jump(t.table, t.col, String(v))}>→ {t.table}</button></>}
                </div>
              );
            })}
          </div>
          {singlePk && referencedBy.length > 0 && (
            <>
              <div className="k">referenced by</div>
              <div className="refs">
                {referencedBy.map((r) => (
                  <button key={r.table} onClick={() => jump(r.table, r.col, String(open[singlePk]))}>{r.table}</button>
                ))}
              </div>
            </>
          )}
          <div className="k" style={{ marginTop: 10 }}>raw JSON</div>
          <pre>{JSON.stringify(open, null, 2)}</pre>
        </aside>
      )}
    </div>
  );
}
