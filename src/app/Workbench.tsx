"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PREDICATES } from "@/lib/predicates";

type Evidence = { quote_id: string; source_id: string; start: number; end: number; text: string; external_id: string; author: string | null };
type Claim = {
  claim_id: string; kind: string; predicate_id: string; predicate_version: number; status: string;
  subject: Record<string, unknown>; value: Record<string, unknown>; conditions: Record<string, unknown>;
  valid_from: string | null; valid_to: string | null;
  grounding: Record<string, { tier: string; quote_id?: string; resolver?: string }>;
  evidence: Evidence[];
};
type Source = { source_id: string; kind: string; external_id: string; author: string | null; occurred_at: string; text: string };
type State = { sources: Source[]; claims: Claim[]; verify: { ok: boolean; entries: number; problems: string[] } };
type GateErr = { code: string; field?: string; message: string };

async function post(url: string, body?: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}

function Highlighted({ text, ranges }: { text: string; ranges: { start: number; end: number }[] }) {
  const chars = Array.from(text);
  const cuts = [...ranges].sort((a, b) => a.start - b.start);
  const out: React.ReactNode[] = [];
  let pos = 0;
  cuts.forEach((r, i) => {
    out.push(chars.slice(pos, r.start).join(""));
    out.push(<mark key={i}>{chars.slice(r.start, r.end).join("")}</mark>);
    pos = r.end;
  });
  out.push(chars.slice(pos).join(""));
  return <>{out}</>;
}

function ClaimCard({ c, selected, onSelect, onReview }: { c: Claim; selected: boolean; onSelect: () => void; onReview: (t: "approved" | "rejected" | "retracted") => void }) {
  const def = PREDICATES.find((p) => p.id === c.predicate_id && p.version === c.predicate_version);
  const slotValue = (slot: string, name: string): unknown =>
    slot === "valid_to" ? c.valid_to : slot === "valid_from" ? c.valid_from : (c as unknown as Record<string, Record<string, unknown>>)[slot]?.[name];
  return (
    <div className={`card claim${selected ? " selected" : ""}`} onClick={onSelect}>
      <div className="row">
        <strong>{c.predicate_id}</strong>
        <span className={`chip status-${c.status}`}>{c.status}</span>
        <span className="muted mono">{c.claim_id.slice(0, 8)}</span>
      </div>
      <dl className="fields">
        {def?.fields.map((f) => {
          const v = slotValue(f.slot, f.name);
          if (v === undefined || v === null) return null;
          return (
            <div key={f.name}>
              <dt>{f.name}</dt>
              <dd>
                {String(v)} <span className={`chip tier-${c.grounding[f.name]?.tier}`} title={c.grounding[f.name]?.resolver}>{c.grounding[f.name]?.tier}</span>
              </dd>
            </div>
          );
        })}
      </dl>
      {c.evidence.map((e) => (
        <blockquote key={e.quote_id}>
          “{e.text}”
          <footer className="muted">
            {e.external_id}
            {e.author ? ` · ${e.author}` : ""} · chars {e.start}–{e.end}
          </footer>
        </blockquote>
      ))}
      <div className="row">
        {c.status === "proposed" && (
          <>
            <button className="ok" onClick={(ev) => { ev.stopPropagation(); onReview("approved"); }}>Approve</button>
            <button className="bad" onClick={(ev) => { ev.stopPropagation(); onReview("rejected"); }}>Reject</button>
          </>
        )}
        {c.status === "approved" && <button onClick={(ev) => { ev.stopPropagation(); onReview("retracted"); }}>Retract</button>}
      </div>
    </div>
  );
}

export default function Workbench() {
  const [state, setState] = useState<State | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [errors, setErrors] = useState<GateErr[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const [predId, setPredId] = useState(PREDICATES[0].id);
  const [sourceId, setSourceId] = useState("");
  const [quote, setQuote] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});

  const load = useCallback(async () => setState(await (await fetch("/api/state")).json()), []);
  useEffect(() => {
    let live = true;
    fetch("/api/state").then((r) => r.json()).then((d) => { if (live) setState(d); });
    return () => { live = false; };
  }, []);

  const pred = PREDICATES.find((p) => p.id === predId)!;
  const selectedClaim = state?.claims.find((c) => c.claim_id === selected);
  const effectiveSource = sourceId || state?.sources[0]?.source_id || "";

  const ranges = useMemo(() => {
    const m = new Map<string, { start: number; end: number }[]>();
    selectedClaim?.evidence.forEach((e) => m.set(e.source_id, [...(m.get(e.source_id) ?? []), { start: e.start, end: e.end }]));
    return m;
  }, [selectedClaim]);

  async function submitClaim() {
    setNote(null);
    const body: Record<string, unknown> = {};
    for (const f of pred.fields) {
      const raw = fields[f.name];
      if (raw === undefined || raw.trim() === "") continue;
      body[f.name] = f.type === "number" ? Number(raw.replace(",", ".")) : raw.trim();
    }
    const { data } = await post("/api/claims", { predicate_id: predId, fields: body, evidence: [{ source_id: effectiveSource, quote }] });
    if (data.ok) { setErrors(null); setNote(data.duplicate ? "Already in the memory." : "Gate passed — claim proposed."); setSelected(data.claim_id); }
    else setErrors(data.errors);
    load();
  }

  async function review(id: string, type: "approved" | "rejected" | "retracted") {
    await post(`/api/claims/${id}/review`, { type });
    load();
  }

  async function addSource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { data, status } = await post("/api/sources", {
      kind: fd.get("kind"), external_id: fd.get("external_id"), author: fd.get("author") || null,
      occurred_at: new Date(String(fd.get("occurred_at"))).toISOString(), raw: fd.get("raw"),
    });
    setNote(status === 200 ? (data.created ? "Source ingested." : "Source already ingested.") : data.error);
    if (status === 200) e.currentTarget.reset();
    load();
  }

  if (!state) return <main><p className="muted">Loading…</p></main>;

  return (
    <main>
      <header>
        <div>
          <h1>Company Brain · core</h1>
          <p className="muted">Sources → quotes → gated claims, in an append-only hash-chained store.</p>
        </div>
        <div className="row">
          <span className={`chip ${state.verify.ok ? "status-approved" : "status-rejected"}`} title={state.verify.problems.join("\n")}>
            {state.verify.ok ? `chain intact · ${state.verify.entries} entries` : `${state.verify.problems.length} integrity problems`}
          </span>
          <button onClick={async () => { const { data } = await post("/api/seed"); setNote(`Sample loaded: ${data.claims} claims proposed.`); load(); }}>Load sample data</button>
        </div>
      </header>

      {state.verify.problems.length > 0 && <pre className="errors">{state.verify.problems.join("\n")}</pre>}
      {note && <p className="note">{note}</p>}

      <div className="cols">
        <section>
          <h2>Sources <span className="muted">({state.sources.length})</span></h2>
          {state.sources.map((s) => (
            <div key={s.source_id} className="card">
              <div className="row"><strong>{s.kind}</strong><span className="muted">{s.external_id}{s.author ? ` · ${s.author}` : ""}</span><span className="muted mono">{s.occurred_at.slice(0, 10)}</span></div>
              <p className="source-text"><Highlighted text={s.text} ranges={ranges.get(s.source_id) ?? []} /></p>
            </div>
          ))}
          <details>
            <summary>Add a source</summary>
            <form onSubmit={addSource} className="form">
              <select name="kind"><option>email</option><option>chat</option><option>task</option><option>doc</option></select>
              <input name="external_id" placeholder="external id (e.g. msg-42)" required />
              <input name="author" placeholder="author" />
              <input name="occurred_at" type="datetime-local" required />
              <textarea name="raw" rows={5} placeholder="message text" required />
              <button>Ingest</button>
            </form>
          </details>
        </section>

        <section>
          <h2>Claims <span className="muted">({state.claims.length})</span></h2>
          <details open>
            <summary>Propose a claim (through the gate)</summary>
            <div className="form">
              <select value={predId} onChange={(e) => { setPredId(e.target.value); setFields({}); setErrors(null); }}>
                {PREDICATES.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
              </select>
              <p className="muted small">{pred.description}</p>
              <select value={effectiveSource} onChange={(e) => setSourceId(e.target.value)}>
                {state.sources.map((s) => <option key={s.source_id} value={s.source_id}>{s.kind} · {s.external_id}</option>)}
              </select>
              <textarea rows={3} placeholder="Quote — must appear verbatim in the source" value={quote} onChange={(e) => setQuote(e.target.value)} />
              {pred.fields.map((f) => (
                <label key={f.name}>
                  <span>{f.name}{f.required ? " *" : ""} <span className={`chip tier-${f.tier}`}>{f.tier}</span></span>
                  <input value={fields[f.name] ?? ""} placeholder={f.type} onChange={(e) => setFields({ ...fields, [f.name]: e.target.value })} />
                </label>
              ))}
              <button onClick={submitClaim} disabled={!effectiveSource || !quote.trim()}>Submit to gate</button>
              {errors && <ul className="errors">{errors.map((e, i) => <li key={i}><code>{e.code}</code>{e.field ? ` [${e.field}]` : ""}: {e.message}</li>)}</ul>}
            </div>
          </details>
          {state.claims.map((c) => (
            <ClaimCard key={c.claim_id} c={c} selected={c.claim_id === selected} onSelect={() => setSelected(c.claim_id === selected ? null : c.claim_id)} onReview={(t) => review(c.claim_id, t)} />
          ))}
          {state.claims.length === 0 && <p className="muted">No claims yet. Load the sample data or propose one.</p>}
        </section>
      </div>
    </main>
  );
}
