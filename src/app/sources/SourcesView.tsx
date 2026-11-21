"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BrainMark, KindIcon, PlusIcon, SendIcon } from "../chat/ui";

type Kind = "email" | "news" | "document";
type Preview = {
  kind: Kind;
  filename: string;
  content: string;
  ok: boolean;
  errors: string[];
  summary: { title: string; when: string | null; from: string | null; to: string[]; labels: string[]; reliability: string | null; body: string };
};
type Card = Preview & { id: string; keep: boolean; editing: boolean };
type Written = { filename: string; ok: boolean; error?: string };

const KIND_LABEL: Record<Kind, string> = { email: "Email", news: "News", document: "Document" };
const EXAMPLES = [
  "A supplier emails us a better offer than the market, valid for two weeks",
  "A trade newspaper reports a port strike that could delay deliveries",
  "A finance email flags a price rise we have not budgeted for",
  "The warehouse system exports an updated stock count",
];
const PHASES = ["Reading the request…", "Drafting the sources…", "Checking them against the contract…"];

const uid = () => Math.random().toString(36).slice(2, 9);
const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "no date";

export default function SourcesView() {
  const [prompt, setPrompt] = useState("");
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [busy, setBusy] = useState<"generate" | "publish" | null>(null);
  const [phase, setPhase] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [written, setWritten] = useState<Written[] | null>(null);
  const checks = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (busy !== "generate") return;
    const t = setInterval(() => setPhase((p) => p + 1), 2200);
    return () => clearInterval(t);
  }, [busy]);

  const patch = (id: string, p: Partial<Card>) => setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const toggleKind = (k: Kind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));

  async function generate() {
    if (busy || prompt.trim().length < 3) return;
    setBusy("generate");
    setPhase(0);
    setError(null);
    setWritten(null);
    try {
      const r = await fetch("/api/sources/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ prompt, kinds }) });
      const d = await r.json();
      if (!r.ok) setError(d.error ?? "Something went wrong.");
      else setCards((d.items as Preview[]).map((p) => ({ ...p, id: uid(), keep: p.ok, editing: false })));
    } catch (e) {
      setError(`Could not reach the server: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  // an edited file is re-checked against the real parser, shortly after typing stops
  function edit(c: Card, content: string) {
    patch(c.id, { content });
    clearTimeout(checks.current[c.id]);
    checks.current[c.id] = setTimeout(async () => {
      const r = await fetch("/api/sources/validate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind: c.kind, filename: c.filename, content }) });
      if (r.ok) {
        const p: Preview = await r.json();
        patch(c.id, { ...p, content, filename: c.filename, keep: p.ok ? c.keep : false });
      }
    }, 350);
  }

  const chosen = cards.filter((c) => c.keep && c.ok);

  async function publish() {
    if (busy || chosen.length === 0) return;
    setBusy("publish");
    setError(null);
    try {
      const r = await fetch("/api/sources/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: chosen.map((c) => ({ kind: c.kind, filename: c.filename, content: c.content })) }),
      });
      const d = await r.json();
      if (!d.results) setError(d.error ?? "Something went wrong.");
      else {
        const res = d.results as Written[];
        setWritten(res);
        const done = new Set(res.filter((x) => x.ok).map((x) => x.filename));
        setCards((cs) => cs.filter((c) => !(c.keep && done.has(c.filename))));
        if (res.every((x) => x.ok)) setPrompt("");
      }
    } catch (e) {
      setError(`Could not reach the server: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="newsrc">
      <aside className="compose">
        <div className="brand">
          <span className="brand-mark"><BrainMark size={20} /></span>
          <div><b>New source</b><small>Simulate something arriving</small></div>
        </div>

        <label className="side-label" htmlFor="req">What should arrive?</label>
        <textarea
          id="req"
          className="req"
          rows={6}
          value={prompt}
          placeholder="Describe it in a sentence or two. Who sends it, what it says, when it happened…"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              generate();
            }
          }}
        />

        <div className="side-label">Type</div>
        <div className="kinds">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} className={`kind${kinds.includes(k) ? " on" : ""}`} onClick={() => toggleKind(k)} aria-pressed={kinds.includes(k)}>
              <KindIcon kind={k} /> {KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <p className="fine">{kinds.length === 0 ? "Left open, Claude picks what fits." : "Only these types will be written."}</p>

        <button className="go" onClick={generate} disabled={!!busy || prompt.trim().length < 3}>
          {busy === "generate" ? "Drafting…" : cards.length ? "Draft again" : "Draft the sources"} <SendIcon />
        </button>
        <div className="fine">⌘ Enter to draft</div>

        <div className="side-label">Ideas</div>
        <div className="ideas">
          {EXAMPLES.map((x) => (
            <button key={x} onClick={() => setPrompt(x)}>{x}</button>
          ))}
        </div>
      </aside>

      <main className="stage">
        <header className="shead">
          <div>
            <h1>{cards.length ? "Review before it arrives" : "Preview"}</h1>
            <p>{cards.length ? "Nothing is written until you accept. Edit any file, or leave one out." : "Drafts appear here. You decide what gets added."}</p>
          </div>
        </header>

        <div className="scroll">
          <div className="col">
            {error && <div className="errorcard">{error}</div>}

            {written && (
              <div className="done">
                <div className="done-title">{written.every((w) => w.ok) ? "Added to the sources" : "Some files were not written"}</div>
                {written.map((w) => (
                  <div key={w.filename} className={`done-row${w.ok ? "" : " bad"}`}>
                    <span>{w.ok ? "✓" : "✕"}</span> <code>{w.filename}</code> {w.error && <em>{w.error}</em>}
                  </div>
                ))}
                {written.some((w) => w.ok) && (
                  <p>
                    The watcher picks them up within a moment and extracts their claims. Watch them land in <Link href="/claims">Claims</Link> or ask about them in{" "}
                    <Link href="/chat">Chat</Link>.
                  </p>
                )}
              </div>
            )}

            {busy === "generate" && (
              <div className="working">
                <span className="brain-avatar pulse"><BrainMark size={16} /></span>
                <div className="typing"><i /><i /><i /><span>{PHASES[phase % PHASES.length]}</span></div>
              </div>
            )}

            {busy !== "generate" && cards.length === 0 && !written && (
              <div className="empty">
                <span className="brand-mark big"><BrainMark size={26} /></span>
                <h2>Make something arrive.</h2>
                <p>Write what should happen next. Claude drafts the email, article or document, you check it, and it lands in the source folders as if it had just come in.</p>
              </div>
            )}

            {cards.map((c) => (
              <article key={c.id} className={`card${c.keep ? "" : " off"}${c.ok ? "" : " invalid"}`}>
                <header className="card-head">
                  <span className="kindtag"><KindIcon kind={c.kind} /> {KIND_LABEL[c.kind]}</span>
                  <span className="when">{when(c.summary.when)}</span>
                  <span className="grow" />
                  <button className="link" onClick={() => patch(c.id, { editing: !c.editing })}>{c.editing ? "Done editing" : "Edit file"}</button>
                  <label className="keep">
                    <input type="checkbox" checked={c.keep} disabled={!c.ok} onChange={(e) => patch(c.id, { keep: e.target.checked })} />
                    <span>{c.keep ? "Add" : "Skip"}</span>
                  </label>
                </header>

                <h3>{c.summary.title}</h3>
                {(c.summary.from || c.summary.to.length > 0) && (
                  <div className="route">
                    {c.summary.from && <span>{c.summary.from}</span>}
                    {c.summary.to.length > 0 && <span className="to">to {c.summary.to.join(", ")}</span>}
                  </div>
                )}
                <div className="tags">
                  {c.summary.labels.map((l) => <i key={l} className="chip">{l}</i>)}
                  {c.summary.reliability === "low" && <i className="chip warn">unverified</i>}
                </div>

                {c.editing ? (
                  <textarea className="raw" value={c.content} spellCheck={false} rows={Math.min(24, c.content.split("\n").length + 1)} onChange={(e) => edit(c, e.target.value)} />
                ) : (
                  c.ok && <div className="body">{c.summary.body}</div>
                )}

                {!c.ok && (
                  <ul className="errs">
                    {c.errors.map((e) => <li key={e}>{e}</li>)}
                    {!c.editing && <li><button className="link" onClick={() => patch(c.id, { editing: true })}>Edit the file to fix it</button></li>}
                  </ul>
                )}
                <div className="file"><code>{c.filename}</code></div>
              </article>
            ))}
          </div>
        </div>

        {cards.length > 0 && (
          <div className="bar-wrap">
            <div className="bar">
              <span>{chosen.length} of {cards.length} ready to add</span>
              <button className="go slim" onClick={publish} disabled={!!busy || chosen.length === 0}>
                <PlusIcon /> {busy === "publish" ? "Adding…" : `Add ${chosen.length} to the sources`}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
