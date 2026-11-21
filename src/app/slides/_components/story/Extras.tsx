"use client";

import { At } from "../step";
import { Left } from "./Story";

/* ============================ BACKUP · the ideas, and the honest scope ============================ */

const IDEAS: [string, string, string, string][] = [
  ["01", "The model proposes. Code disposes.", "Every claim carries a verbatim quote. The database itself refuses a quote that is not a slice of its source, and a plain-code gate re-checks every literal value against it.", "gate · DB trigger"],
  ["02", "A memory with a hash chain.", "Append-only tables, status as events, one chain over every row. verify() re-reads the quotes and re-runs the gate on all claims: one altered row breaks the rest.", "verify()"],
  ["03", "Access before the model.", "A claim’s labels are the union of its sources’. Whoever may not see it never has it in the prompt, and the answer is always the same: “I don’t know”. A non-interference test pins it down.", "policy · labels"],
  ["04", "Answers on a leash.", "Every sentence cites claims, every citation must exist and be visible to the asker, every figure must appear in what it cites. One repair round, then “I don’t know”.", "answer verifier"],
  ["05", "Entities found, not typed.", "Suppliers, products and people are admitted by the system when a quote or the source header grounds them. Ids are derived by code, so the same name is the same thing.", "entity registry"],
  ["06", "It speaks first, per person.", "For each new claim, each person who may see it is considered on their own knowledge base. Senders and thread members are never told, by code. Every decision, silences included, is stored.", "proactive notices"],
];

export function IdeasStory() {
  return (
    <div className="st-full" style={{ alignContent: "center" }}>
      <div className="sl-eyebrow">Backup · Ideas worth stealing</div>
      <h1 style={{ fontSize: "1.9em", margin: ".25em 0 .8em", lineHeight: 1.08 }}>
        Six ideas under the hood, <span className="st-hl">all of them running.</span>
      </h1>
      <div className="st-grid3" style={{ gap: "1em" }}>
        {IDEAS.map(([n, t, d, tag], i) => (
          <At key={n} from={i < 3 ? 0 : 1} delay={(i % 3) * 0.15}>
            <div className="st-panel" style={{ padding: "1em 1.2em", height: "100%" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="st-mono" style={{ color: "var(--accent-ink)", fontWeight: 700, fontSize: ".7em" }}>{n}</span>
                <span className="st-tag acc">{tag}</span>
              </div>
              <b style={{ display: "block", fontSize: "1.05em", margin: ".6em 0 .4em", lineHeight: 1.2 }}>{t}</b>
              <p style={{ margin: 0, fontSize: ".72em", lineHeight: 1.55, color: "var(--muted)" }}>{d}</p>
            </div>
          </At>
        ))}
      </div>
      <At from={1} delay={0.5}>
        <p className="st-mid" style={{ fontSize: ".85em", maxWidth: "none" }}>
          Claims are trusted by default and curated by rejection. A rejected claim strikes the notices built on it, as cancelled or updated, never silently deleted.
        </p>
      </At>
    </div>
  );
}

const REAL = [
  "Email, news and documents as files in folders, parsed against strict contracts",
  "Extraction with Claude: atomic claims, quotes checked by the gate",
  "Entities admitted automatically, grounded in the text",
  "Chat as three roles, with citations and “I don’t know”",
  "Curation: trusted by default, a curator can reject",
  "Heads-up: the memory tells each person what they should hear",
  "New source page: draft, preview, add, live",
  "Worlds generated from a scenario, replayable",
];
const SCRIPTED = [
  "The story slides run on a scripted scenario engine, not on the real backend",
  "The purchase order and its approval flow (PO-9120)",
  "“Why did we buy?”: the decision trace",
  "The recompute animation when a source is distrusted",
];
const MISSING = [
  "Derived claims: cover days, price gaps, savings are not computed or stored",
  "Proposals as real objects with approval and execution",
  "Recompute when a source is corrected or distrusted",
  "Real connectors (mail, drive) and real login",
  "More than three people, or more than one machine",
];

function Column({ title, tag, cls, items, at }: { title: string; tag: string; cls: string; items: string[]; at: number }) {
  const color = cls === "ok" ? "var(--ok)" : cls === "warn" ? "var(--warn)" : "var(--bad)";
  return (
    <At from={at}>
      <div className="st-panel" style={{ height: "100%" }}>
        <div className="hd"><span>{title}</span><span className={`st-tag ${cls}`}>{tag}</span></div>
        <ul style={{ listStyle: "none", margin: 0, padding: ".4em 1.1em .8em" }}>
          {items.map((t) => (
            <li key={t} className="st-row" style={{ justifyContent: "flex-start", gap: ".8em", fontSize: ".78em", lineHeight: 1.4 }}>
              <span className="st-mono" style={{ color, flex: "none" }}>{cls === "ok" ? "✓" : cls === "warn" ? "◐" : "✕"}</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </div>
    </At>
  );
}

export function ScopeStory() {
  return (
    <div className="st-full" style={{ alignContent: "center" }}>
      <Left eyebrow="Backup · Scope" title={<>What is real, what is staged, <span className="st-hl">what is missing.</span></>} />
      <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr 1fr", gap: "1em", marginTop: ".4em", alignItems: "stretch" }}>
        <Column title="Built and running" tag="the live app" cls="ok" items={REAL} at={0} />
        <Column title="Staged in the slides" tag="scripted" cls="warn" items={SCRIPTED} at={1} />
        <Column title="Not built yet" tag="honest gaps" cls="bad" items={MISSING} at={2} />
      </div>
      <At from={2} delay={0.3}>
        <p className="st-mid" style={{ fontSize: ".8em", maxWidth: "none" }}>
          The live app is the chat, the claims, the new-source page and the Heads-up notices. The staged slides show where it is going; 451 automated tests cover what runs.
        </p>
      </At>
    </div>
  );
}
