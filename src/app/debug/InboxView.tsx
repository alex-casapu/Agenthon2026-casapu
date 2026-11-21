"use client";

import { useEffect, useState } from "react";

type Ev = { seq: number; kind: string; domain: string | null; doc_type: string | null; path: string; result: string; error: string | null; created_at: string; source_id: string | null; external_id: string | null; occurred_at: string | null };
type Run = { seq: number; source_id: string; kind: string; external_id: string; model: string; status: string; rounds: number; proposed: number; duplicates: number; rejected: number; error: string | null; cost_usd: number | null; duration_ms: number | null; created_at: string };
type Status = { extraction: { enabled: boolean; queue: { queued: number; running: number; done: number; failed: number; skipped: number } | null; runs: Run[] }; folders: Record<string, string>; counts: { kind: string; result: string; n: number }[]; events: Ev[] };

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
      <h2 style={{ margin: "16px 0 8px" }}>Extraction</h2>
      <div className="toolbar">
        <span className={`chip ${st.extraction.enabled ? "status-approved" : "status-rejected"}`}>{st.extraction.enabled ? "auto-extract on" : "off (BRAIN_EXTRACT=off)"}</span>
        {st.extraction.queue && <span className="muted small">queued {st.extraction.queue.queued} · running {st.extraction.queue.running} · done {st.extraction.queue.done} · failed {st.extraction.queue.failed} · skipped {st.extraction.queue.skipped}</span>}
        <button disabled={!st.extraction.enabled} onClick={async () => { await fetch("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); setTick((n) => n + 1); }}>Extract pending</button>
        <span className="muted small">one model call per source over all predicates; every claim passes the gate; rejects are repaired. Proposed claims appear in Tables / Workbench.</span>
      </div>
      <div className="gridwrap">
        <table className="grid">
          <thead><tr><th>#</th><th>at</th><th>kind</th><th>source</th><th>status</th><th>calls</th><th>new</th><th>dup</th><th>rejected</th><th>model</th><th>cost $</th><th>sec</th><th>error</th></tr></thead>
          <tbody>
            {st.extraction.runs.map((r) => (
              <tr key={r.seq} style={{ cursor: "default" }}>
                <td>{r.seq}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
                <td>{r.kind}</td>
                <td>{r.external_id}</td>
                <td><span className={`chip ${r.status === "done" ? "status-approved" : "status-rejected"}`}>{r.status}</span></td>
                <td>{r.rounds}</td>
                <td>{r.proposed}</td>
                <td>{r.duplicates}</td>
                <td className={r.rejected ? "bad-text" : ""}>{r.rejected}</td>
                <td>{r.model}</td>
                <td>{r.cost_usd?.toFixed(3) ?? ""}</td>
                <td>{r.duration_ms != null ? (r.duration_ms / 1000).toFixed(1) : ""}</td>
                <td title={r.error ?? ""}>{r.error ?? ""}</td>
              </tr>
            ))}
            {st.extraction.runs.length === 0 && <tr><td colSpan={13} className="muted">No extraction runs yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
