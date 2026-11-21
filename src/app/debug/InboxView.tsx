"use client";

import { useEffect, useState } from "react";

type Ev = { seq: number; kind: string; domain: string | null; doc_type: string | null; path: string; result: string; error: string | null; created_at: string; source_id: string | null; external_id: string | null; occurred_at: string | null };
type Status = { folders: Record<string, string>; counts: { kind: string; result: string; n: number }[]; events: Ev[] };

const CHIP: Record<string, string> = { ingested: "status-approved", duplicate: "tier-resolved", conflict: "status-rejected", invalid: "status-rejected" };

export default function InboxView() {
  const [st, setSt] = useState<Status | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    fetch("/api/ingest/status").then((r) => r.json()).then((d) => { if (live) setSt(d); });
    return () => { live = false; };
  }, [tick]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 2000);
    return () => clearInterval(t);
  }, []);

  if (!st) return <p className="muted">Loading…</p>;
  return (
    <div>
      <div className="toolbar">
        {st.counts.map((c) => <span key={c.kind + c.result} className={`chip ${CHIP[c.result]}`}>{c.kind} · {c.result} {c.n}</span>)}
        <button onClick={async () => { await fetch("/api/ingest/scan", { method: "POST" }); setTick((n) => n + 1); }}>Scan now</button>
        <span className="muted small">New .md files are ingested automatically · refreshes every 2 s · formats: docs/EMAIL_CONTRACT.md, NEWS_CONTRACT.md, DOCUMENT_CONTRACT.md</span>
      </div>
      <p className="muted small" style={{ margin: "0 0 8px" }}>
        Watching {Object.entries(st.folders).map(([k, d]) => <span key={k} style={{ marginRight: 12 }}>{k}: <code className="mono">{d}</code></span>)}
      </p>
      <div className="gridwrap">
        <table className="grid">
          <thead><tr><th>#</th><th>ingested at</th><th>kind</th><th>result</th><th>file</th><th>id</th><th>domain / type</th><th>source date</th><th>reasons</th></tr></thead>
          <tbody>
            {st.events.map((e) => (
              <tr key={e.seq} style={{ cursor: "default" }}>
                <td>{e.seq}</td>
                <td>{e.created_at.replace("T", " ").slice(0, 19)}</td>
                <td>{e.kind}</td>
                <td><span className={`chip ${CHIP[e.result]}`}>{e.result}</span></td>
                <td>{e.path}</td>
                <td>{e.external_id ?? ""}</td>
                <td>{e.domain ?? e.doc_type ?? ""}</td>
                <td>{e.occurred_at?.slice(0, 16).replace("T", " ") ?? ""}</td>
                <td title={e.error ?? ""}>{e.error ? (JSON.parse(e.error) as string[]).join("; ") : ""}</td>
              </tr>
            ))}
            {st.events.length === 0 && <tr><td colSpan={9} className="muted">Nothing ingested yet. Drop a .md file into one of the folders above.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
