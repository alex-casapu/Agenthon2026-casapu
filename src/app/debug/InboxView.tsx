"use client";

import { useEffect, useState } from "react";

type Ev = { seq: number; path: string; result: string; error: string | null; created_at: string; source_id: string | null; external_id: string | null; occurred_at: string | null };
type Status = { inbox: string; counts: { result: string; n: number }[]; events: Ev[] };

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
        <span>Watching <code className="mono">{st.inbox}</code></span>
        {st.counts.map((c) => <span key={c.result} className={`chip ${CHIP[c.result]}`}>{c.result} {c.n}</span>)}
        <button onClick={async () => { await fetch("/api/ingest/scan", { method: "POST" }); setTick((n) => n + 1); }}>Scan now</button>
        <span className="muted small">New .md files are ingested automatically · live, refreshes every 2 s · format: docs/EMAIL_CONTRACT.md</span>
      </div>
      <div className="gridwrap">
        <table className="grid">
          <thead><tr><th>#</th><th>ingested at</th><th>result</th><th>file</th><th>message_id</th><th>email date</th><th>reasons</th></tr></thead>
          <tbody>
            {st.events.map((e) => (
              <tr key={e.seq} style={{ cursor: "default" }}>
                <td>{e.seq}</td>
                <td>{e.created_at.replace("T", " ").slice(0, 19)}</td>
                <td><span className={`chip ${CHIP[e.result]}`}>{e.result}</span></td>
                <td>{e.path}</td>
                <td>{e.external_id ?? ""}</td>
                <td>{e.occurred_at?.slice(0, 16).replace("T", " ") ?? ""}</td>
                <td title={e.error ?? ""}>{e.error ? (JSON.parse(e.error) as string[]).join("; ") : ""}</td>
              </tr>
            ))}
            {st.events.length === 0 && <tr><td colSpan={7} className="muted">Nothing ingested yet. Drop a .md email into the inbox folder.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
