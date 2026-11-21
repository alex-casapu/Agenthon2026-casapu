"use client";

import { useEffect, useState } from "react";
import type { ClaimView, EvidenceView } from "@/lib/claims-view";
import { Highlighted } from "../components/Highlighted";

type GroupBy = "none" | "predicate" | "source";
type Sort = "newest" | "oldest" | "predicate" | "status";

const STATUSES = ["proposed", "approved", "rejected", "superseded", "retracted"];
const short = (id: string) => id.slice(0, 8);
const when = (iso: string) => iso.replace("T", " ").slice(0, 16);

function SourceLine({ e }: { e: EvidenceView }) {
  const s = e.source;
  return (
    <div className="srcline">
      <span className="chip">{s.kind}</span>
      <strong>{s.title ?? s.external_id}</strong>
      <span className="muted">
        {[s.title ? s.external_id : null, s.author, s.domain, s.doc_type, `dated ${s.occurred_at.slice(0, 10)}`, `ingested ${when(s.ingested_at)}`].filter(Boolean).join(" · ")}
      </span>
      {s.labels.map((l) => <span key={l} className="chip">{l}</span>)}
      {s.reliability && <span className={`chip ${s.reliability === "high" ? "tier-literal" : "status-rejected"}`}>reliability {s.reliability}</span>}
    </div>
  );
}

function Evidence({ e }: { e: EvidenceView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ev">
      <blockquote>“{e.text}”</blockquote>
      <SourceLine e={e} />
      <button className="link" onClick={() => setOpen(!open)}>{open ? "hide context" : "show in context"}</button>
      <span className="muted small"> · chars {e.start}–{e.end} · quote {short(e.quote_id)}</span>
      {open && (
        <p className="ctx">
          <span className="muted">…{e.before}</span>
          <Highlighted text={e.text} ranges={[{ start: 0, end: Array.from(e.text).length }]} />
          <span className="muted">{e.after}…</span>
        </p>
      )}
    </div>
  );
}

function Card({ c }: { c: ClaimView }) {
  return (
    <article className="card cl">
      <header className="clhead">
        <span className={`chip status-${c.status}`}>{c.status}</span>
        <span className="chip">{c.predicate_id}@{c.predicate_version}</span>
        <span className="muted mono" title={c.claim_id}>{short(c.claim_id)}</span>
      </header>
      <h3 className="sentence">{c.sentence}</h3>

      <div className="fchips">
        {c.fields.map((f) => (
          <span key={f.name} className={`fchip tier-${f.tier}`} title={`${f.tier}${f.resolver ? ` · ${f.resolver}` : ""}${f.quote_id ? ` · verified against quote ${short(f.quote_id)}` : ""}`}>
            <span className="fname">{f.name}</span> {String(f.value)}
          </span>
        ))}
        {c.fields.length === 0 && <span className="muted small">no fields</span>}
      </div>

      {c.evidence.map((e) => <Evidence key={e.quote_id} e={e} />)}

      <footer className="clfoot muted small">
        {c.history.map((h) => (
          <span key={h.seq}>{h.type} by <strong>{h.actor}</strong>{h.reason ? ` (${h.reason})` : ""} · {when(h.created_at)}</span>
        ))}
        {c.extractor && c.extractor.type === "llm" && (
          <span>extracted by {String(c.extractor.model)} · {String(c.extractor.name)} · vocab {String(c.extractor.vocab_hash).slice(0, 8)}</span>
        )}
        {c.extractor && c.extractor.type === "manual" && <span>entered manually</span>}
        {(c.valid_from || c.valid_to) && <span>valid {c.valid_from ?? "…"} → {c.valid_to ?? "…"}</span>}
      </footer>
      <details>
        <summary>raw</summary>
        <pre className="rawjson">{JSON.stringify({ claim_id: c.claim_id, ...c.raw, extractor: c.extractor }, null, 2)}</pre>
      </details>
    </article>
  );
}

export default function ClaimsView() {
  const [claims, setClaims] = useState<ClaimView[] | null>(null);
  const [tick, setTick] = useState(0);
  const [live, setLive] = useState(true);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [predicate, setPredicate] = useState("");
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [group, setGroup] = useState<GroupBy>("none");

  useEffect(() => {
    let alive = true;
    fetch("/api/debug/claims").then((r) => r.json()).then((d) => { if (alive) setClaims(d); });
    return () => { alive = false; };
  }, [tick]);

  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setTick((n) => n + 1), 4000);
    return () => clearInterval(t);
  }, [live]);

  if (!claims) return <p className="muted" style={{ padding: 16 }}>Loading…</p>;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, claims.filter((c) => c.status === s).length]));
  const predicates = [...new Set(claims.map((c) => c.predicate_id))].sort();
  const kinds = [...new Set(claims.flatMap((c) => c.evidence.map((e) => e.source.kind)))].sort();

  const needle = q.trim().toLowerCase();
  const shown = claims
    .filter((c) => statuses.length === 0 || statuses.includes(c.status))
    .filter((c) => !predicate || c.predicate_id === predicate)
    .filter((c) => !kind || c.evidence.some((e) => e.source.kind === kind))
    .filter((c) => !needle || [c.sentence, c.claim_id, c.predicate_id, ...c.evidence.flatMap((e) => [e.text, e.source.external_id, e.source.title ?? "", e.source.author ?? ""])].join("\n").toLowerCase().includes(needle))
    .sort((a, b) =>
      sort === "newest" ? b.created_at.localeCompare(a.created_at)
      : sort === "oldest" ? a.created_at.localeCompare(b.created_at)
      : sort === "predicate" ? a.predicate_id.localeCompare(b.predicate_id) || b.created_at.localeCompare(a.created_at)
      : a.status.localeCompare(b.status) || b.created_at.localeCompare(a.created_at),
    );

  const groups = new Map<string, ClaimView[]>();
  for (const c of shown) {
    const key = group === "predicate" ? c.predicate_id : group === "source" ? (c.evidence[0]?.source.title ?? c.evidence[0]?.source.external_id ?? "(no source)") : "";
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }

  return (
    <div className="claimspage">
      <div className="claimbar">
        {STATUSES.map((s) => (
          <button key={s} className={`chip status-${s}${statuses.includes(s) ? " on" : ""}`} onClick={() => setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))}>
            {s} {counts[s]}
          </button>
        ))}
        <select value={predicate} onChange={(e) => setPredicate(e.target.value)}>
          <option value="">all predicates</option>
          {predicates.map((p) => <option key={p}>{p}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">all sources</option>
          {kinds.map((k) => <option key={k}>{k}</option>)}
        </select>
        <input placeholder="Search sentences, quotes, sources, ids…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">newest first</option>
          <option value="oldest">oldest first</option>
          <option value="predicate">by predicate</option>
          <option value="status">by status</option>
        </select>
        <select value={group} onChange={(e) => setGroup(e.target.value as GroupBy)}>
          <option value="none">no grouping</option>
          <option value="predicate">group by predicate</option>
          <option value="source">group by source</option>
        </select>
        <label className="small muted"><input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} style={{ width: "auto" }} /> live</label>
        <span className="muted small">{shown.length} of {claims.length}</span>
      </div>

      {[...groups.entries()].map(([key, list]) => (
        <section key={key}>
          {group !== "none" && <h2 className="grouphead">{key} <span className="muted">({list.length})</span></h2>}
          {list.map((c) => <Card key={c.claim_id} c={c} />)}
        </section>
      ))}
      {shown.length === 0 && <p className="muted">No claims match.{claims.length === 0 ? " Ingest a source or load the sample data from the Workbench." : ""}</p>}
    </div>
  );
}
