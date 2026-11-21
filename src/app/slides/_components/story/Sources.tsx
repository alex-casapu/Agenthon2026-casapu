"use client";

import { At } from "../step";

/** Where the Brain's information comes from: the three kinds of source of the simulated pasta company. */
const KINDS = [
  {
    tag: "Email",
    what: "Offers, replies, rumours",
    file: ["from: Molino Tavoliere", "subject: Offer, durum semolina", "3,000 t at 470 €/t, valid until 28/11"],
    trust: "Trust sits on the sender and the thread.",
    labels: ["finance"],
  },
  {
    tag: "News",
    what: "Market reports and their corrections",
    file: ["domain: mercatocereali.example", "Spot price of semolina: 502 €/t,", "+18% in three weeks"],
    trust: "Trust sits on the domain: a whole site can be distrusted.",
    labels: ["public"],
  },
  {
    tag: "Documents",
    what: "Contracts, stock exports, production plans",
    file: ["doc_type: contract · CQ-2026-031", "Price fixed at 412 €/t,", "covers 60% of the annual needs"],
    trust: "A new version supersedes the old one.",
    labels: ["finance", "public"],
  },
];

export function SourcesStory() {
  return (
    <div className="st-full">
      <At from={0} className="sl-eyebrow">Where the information comes from</At>
      <At from={0} delay={0.15}><h1 className="st-big" style={{ margin: ".2em 0 .7em" }}>What a company already has.</h1></At>
      <div className="st-grid3">
        {KINDS.map((k, i) => (
          <At key={k.tag} from={0} delay={0.3 + i * 0.2}>
            <div className="st-panel">
              <div className="hd"><span>{k.tag}</span><span>{k.what}</span></div>
              <pre className="st-code" style={{ padding: "1em 1.2em" }}>{k.file.join("\n")}</pre>
              <At from={1} delay={i * 0.15}>
                <div style={{ padding: "0 1.2em 1.1em", fontSize: ".8em", color: "var(--muted)" }}>
                  <div style={{ marginBottom: ".6em" }}>{k.trust}</div>
                  {k.labels.map((l) => <span key={l} className={`st-tag ${l === "finance" ? "acc" : ""}`} style={{ marginRight: ".4em" }}>{l}</span>)}
                </div>
              </At>
            </div>
          </At>
        ))}
      </div>
      <At from={1} delay={0.5}>
        <p className="st-mid" style={{ marginTop: "1.4em", maxWidth: "40em" }}>
          Each arrives as a file. Each says who may see it and how far to trust it. Nothing is ever edited: a correction is a new source.
        </p>
      </At>
    </div>
  );
}
