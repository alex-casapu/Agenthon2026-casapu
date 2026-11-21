"use client";

import { useState } from "react";
import type { SqlResult } from "@/lib/store/debug";

const EXAMPLES: [string, string][] = [
  ["Claims with status", "SELECT c.predicate_id, s.status, c.value, c.valid_to, c.claim_id\nFROM claims c JOIN claim_status s USING (claim_id)\nORDER BY c.rowid DESC"],
  ["Claim → quote → source", "SELECT c.claim_id, q.text AS quote, s.external_id, s.author, s.occurred_at\nFROM claims c\nJOIN claim_evidence e USING (claim_id)\nJOIN quotes q USING (quote_id)\nJOIN sources s ON s.source_id = q.source_id"],
  ["Event history", "SELECT seq, claim_id, type, actor, reason, created_at FROM claim_events ORDER BY seq"],
  ["Hash chain", "SELECT seq, tbl, row_id, substr(prev_hash,1,8) AS prev, substr(hash,1,8) AS hash FROM log ORDER BY seq"],
  ["Log coverage", "SELECT tbl, COUNT(*) AS entries FROM log GROUP BY tbl"],
  ["Schema", "SELECT type, name, sql FROM sqlite_master WHERE substr(name,1,7) != 'sqlite_'"],
];

function cell(v: unknown) {
  if (v === null) return <span className="null">null</span>;
  const s = typeof v === "string" ? v : String(v);
  return s.length > 200 ? s.slice(0, 200) + "…" : s;
}

export default function SqlView() {
  const [sql, setSql] = useState(EXAMPLES[0][1]);
  const [max, setMax] = useState(1000);
  const [res, setRes] = useState<SqlResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const r = await fetch("/api/debug/sql", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sql, max }) });
    const d = await r.json();
    if (d.error) { setError(d.error); setRes(null); } else { setError(null); setRes(d); }
  }

  return (
    <div className="sqlbox">
      <div className="examples">
        {EXAMPLES.map(([label, q]) => <button key={label} onClick={() => setSql(q)}>{label}</button>)}
      </div>
      <textarea
        value={sql}
        spellCheck={false}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run(); }}
      />
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button onClick={run}>Run (⌘/Ctrl + Enter)</button>
        <select value={max} onChange={(e) => setMax(Number(e.target.value))}>
          {[100, 1000, 10000, 50000].map((n) => <option key={n} value={n}>max {n} rows</option>)}
        </select>
        <span className="muted small">Read-only: SELECT / WITH only. Writes, PRAGMA and multiple statements are refused.</span>
      </div>
      {error && <p className="errors">{error}</p>}
      {res && (
        <>
          <p className="muted small">{res.rowCount} row{res.rowCount === 1 ? "" : "s"}{res.truncated ? " (truncated)" : ""} · {res.ms} ms</p>
          <div className="gridwrap">
            <table className="grid">
              <thead><tr>{res.columns.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
              <tbody>
                {res.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j} title={v === null ? "null" : String(v)}>{cell(v)}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
