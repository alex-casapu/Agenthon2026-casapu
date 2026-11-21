"use client";

import { At, useStep } from "../step";
import { Caption, World } from "./World";

/* ============================ ACT I · the problem ============================ */

export function IntroStory() {
  return (
    <div className="st-full">
      <At from={0} className="sl-eyebrow">GDG Agenthon 2026 · Challenge A</At>
      <At from={0} delay={0.2}><h1 className="st-huge" style={{ margin: ".15em 0 .2em" }}>Company Brain</h1></At>
      <At from={0} delay={0.6}><p className="st-big" style={{ color: "var(--muted)", fontSize: "clamp(22px,2.8vw,44px)", maxWidth: "20em" }}>The colleague who knows, and speaks first.</p></At>
      <At from={0} delay={1}><div className="st-tag" style={{ marginTop: "1.6em" }}>Live demo · a simulated pasta company</div></At>
    </div>
  );
}

export function TitleStory() {
  return (
    <div className="st-full">
      <At from={0} className="st-kicker" style={{ position: "absolute", top: "10%" }}>21 November 2026</At>
      <div className="st-stack" style={{ minHeight: "38vh" }}>
        <At from={0} to={0}><h1 className="st-huge">Pasta is two ingredients:<br />water, and semolina.</h1></At>
        <At from={1}><h1 className="st-huge">On the 21st of November,<br />one of them got <span className="st-accent">18%</span><br />more expensive.</h1></At>
      </div>
    </div>
  );
}

export function MorningStory() {
  return (
    <div className="st-full">
      <div className="sl-eyebrow">Parma · 21 Nov 2026 · 08:58</div>
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4vw", alignItems: "end", marginTop: ".4em" }}>
        <At from={0}><div className="st-num">9</div></At>
        <div>
          <At from={0}><h2 className="st-big">days of semolina<br />left in stock.</h2></At>
          <div style={{ marginTop: "1.2em", maxWidth: "30em" }}>
            <At from={1}><div className="st-row" style={{ justifyContent: "flex-start", gap: "2em" }}><span className="k" style={{ minWidth: "6em" }}>Needs</span><span>4,000 t every month</span></div></At>
            <At from={1} delay={0.25}><div className="st-row" style={{ justifyContent: "flex-start", gap: "2em" }}><span className="k" style={{ minWidth: "6em" }}>Locked</span><span>60% at 412 €/t, until March</span></div></At>
            <At from={1} delay={0.5}><div className="st-row" style={{ justifyContent: "flex-start", gap: "2em" }}><span className="k" style={{ minWidth: "6em" }}>Exposed</span><span>40% bought at the market price</span></div></At>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ ACT II · the reveal ============================ */

export function RevealStory() {
  const step = useStep();
  return (
    <div className="wd-stage">
      <World mode="after" focus={null} cut={step < 1} step={step} brain={step >= 1} />
      <Caption lines={[
        ["So we didn't add a door.", "We gave the company a brain."],
        ["Company Brain.", "The colleague who knows, and speaks first.", true],
      ]} />
    </div>
  );
}

/* ============================ ACT III · the proof ============================ */

export function MathStory() {
  return (
    <div className="st-full">
      <div className="sl-eyebrow">What it calculated</div>
      <h1 style={{ margin: ".2em 0 .6em" }}>Nobody had done the maths. <span style={{ color: "var(--muted)" }}>It did.</span></h1>
      <div className="st-grid3" style={{ gridTemplateColumns: "1.1fr 1fr" }}>
        <div className="st-panel">
          <div className="hd"><span>PR-02 · what the rise costs</span><span className="st-tag acc">proposed</span></div>
          <div style={{ padding: ".2em 1.2em" }}>
            <div className="st-row"><span className="st-mono">502 − 425 = <b>77 €/t</b></span><span><span className="st-cite">EV-07</span><span className="st-cite">MEM-01</span></span></div>
            <div className="st-row"><span className="st-mono">40% × 4,000 t = <b>1,600 t/month</b></span><span><span className="st-cite">EV-03</span><span className="st-cite">EV-02</span></span></div>
            <At from={1}><div className="st-row"><span className="st-mono">77 × 1,600 = <b className="st-accent">€123,200 / month</b></span></div></At>
            <At from={1} delay={0.2}><div className="st-row"><span className="st-mono">× 4 months (Dec–Mar) = <b className="st-accent">€492,800</b></span></div></At>
          </div>
        </div>
        <At from={2}>
          <div className="st-panel">
            <div className="hd"><span>AZ-01 · what to do</span><span className="st-tag acc">proposed</span></div>
            <div style={{ padding: "1em 1.2em" }}>
              <div style={{ fontWeight: 700, fontSize: "1.15em", lineHeight: 1.3 }}>Bring forward 3,000 t from Alta Murgia Mill at 470 €/t</div>
              <div className="st-row" style={{ marginTop: ".8em" }}><span className="st-mono">(502 − 470) × 3,000</span><b className="st-mono st-accent">€96,000 saved</b></div>
              <div className="st-row"><span className="st-mono">9 + 3,000 ÷ (4,000 ÷ 30)</span><b className="st-mono st-accent">≈ 31 days of cover</b></div>
              <div className="st-row"><span className="st-mono">Offer valid until</span><b className="st-mono">28/11</b></div>
            </div>
          </div>
        </At>
      </div>
      <At from={3}><p className="st-mid" style={{ marginTop: "1.2em" }}>The action can’t be approved until the two conclusions it rests on are.</p></At>
    </div>
  );
}

export function ImpactStory() {
  const stats = [
    { n: "€339,000", t: "of exposure through March, found before anyone asked.", at: 0 },
    { n: "€24,000", t: "saved by a decision the machine proposed and a person made.", at: 0 },
    { n: "0", t: "orders executed without a person's approval.", at: 1 },
  ];
  return (
    <div className="st-full">
      <div className="sl-eyebrow">What it is worth</div>
      <div className="st-grid3" style={{ marginTop: "1em" }}>
        {stats.map((s, i) => (
          <At key={s.n} from={s.at} delay={i === 1 ? 0.25 : 0} style={{ borderTop: "2px solid var(--accent)", paddingTop: ".8em" }}>
            <div className="st-mono" style={{ fontWeight: 700, fontSize: "clamp(34px,4vw,72px)", letterSpacing: "-.04em", lineHeight: 1 }}>{s.n}</div>
            <p className="st-mid" style={{ fontSize: "clamp(15px,1.25vw,21px)", marginTop: ".6em" }}>{s.t}</p>
          </At>
        ))}
      </div>
      <At from={1} delay={0.3}>
        <h2 className="st-big" style={{ marginTop: "1.4em" }}>Every company has this problem.<br /><span style={{ color: "var(--muted)" }}>Today: semolina. Tomorrow: every decision.</span></h2>
      </At>
    </div>
  );
}

/* ============================ the technology, in one slide ============================ */

const STAGES = [
  { n: "01", t: "Sources", d: "emails · news · documents. Immutable.", at: 0, cls: "" },
  { n: "02", t: "Model", d: "proposes atomic facts, each with a verbatim quote. It can be wrong.", at: 0, cls: "warn" },
  { n: "03", t: "Gate", d: "plain code: the quote exists, the numbers match, units re-derived. No model.", at: 1, cls: "acc" },
  { n: "04", t: "A person", d: "approves or rejects. Nothing becomes memory otherwise.", at: 2, cls: "" },
  { n: "05", t: "Ledger", d: "append-only. One hash chain. Edit a row, the chain breaks.", at: 2, cls: "ok" },
];

export function HowStory() {
  const step = useStep();
  return (
    <div className="st-full">
      <div className="sl-eyebrow">Under the hood</div>
      <div className="st-stack" style={{ minHeight: "3.4em", margin: ".3em 0 .9em" }}>
        <At from={0} to={0}><h1 className="st-big">The model reads.<br /><span className="st-accent">It never decides.</span></h1></At>
        <At from={1} to={1}><h1 className="st-big">Code checks<br /><span className="st-accent">every word it claims.</span></h1></At>
        <At from={2} to={2}><h1 className="st-big">A person approves.<br /><span className="st-accent">The ledger can&rsquo;t be edited.</span></h1></At>
        <At from={3}><h1 className="st-big">And each agent only knows<br /><span className="st-accent">what its person may know.</span></h1></At>
      </div>
      <div className="st-pipe">
        {STAGES.map((g, i) => (
          <div key={g.n} className="st-pipe-cell">
            <At from={g.at} delay={g.at === 0 ? i * 0.2 : (i % 2) * 0.2}>
              <div className={`st-stage ${g.cls}`}><span className="n">{g.n}</span><b>{g.t}</b><small>{g.d}</small></div>
            </At>
            {i < STAGES.length - 1 && <span className={`st-arrow${step >= STAGES[i + 1].at ? " on" : ""}`} />}
          </div>
        ))}
        <div className={`st-token${step >= 0 ? " go" : ""}`}><span className="st-mono">502 €/t</span><i /></div>
      </div>
      <At from={3} delay={0.2}>
        <div className="st-policy"><b>Policy, before the model:</b> a claim is visible to a person only if they can see all the evidence under it.</div>
      </At>
    </div>
  );
}

/* ============================ ACT IV · the engine ============================ */

export function TechIntroStory() {
  return (
    <div className="st-full">
      <div className="sl-eyebrow">The engine</div>
      <div className="st-stack" style={{ minHeight: "30vh", marginTop: ".4em" }}>
        <At from={0} to={0}><h1 className="st-huge" style={{ fontSize: "clamp(40px,6vw,100px)" }}>How do you trust a machine with a company’s memory?</h1></At>
        <At from={1}><h1 className="st-huge">You don’t.<br /><span className="st-accent">You verify.</span></h1></At>
      </div>
    </div>
  );
}

export function Left({ eyebrow, title, body }: { eyebrow: string; title: React.ReactNode; body?: string }) {
  return (
    <div>
      <div className="sl-eyebrow">{eyebrow}</div>
      <h1 style={{ fontSize: "1.9em", margin: ".25em 0 .5em", lineHeight: 1.08 }}>{title}</h1>
      {body && <p className="st-mid" style={{ fontSize: "1em", maxWidth: "24em" }}>{body}</p>}
    </div>
  );
}

export function IngestStory() {
  return (
    <div className="st-full" style={{ gridTemplateColumns: "1fr 1.2fr", gap: "3vw", alignContent: "center", alignItems: "center" }}>
      <Left eyebrow="01 · Ingest" title="A source enters as a file in a folder." body="Email, news, documents: Markdown with a strict YAML header. It arrives now, whatever date it carries. It only ever appends." />
      <div style={{ display: "grid", gap: "1em" }}>
        <div className="st-panel">
          <div className="hd"><span>data/news/20261121-semola-502.md</span><span className="st-tag">news</span></div>
          <pre className="st-code" style={{ padding: "1em 1.2em" }}>{`---
`}<b>article_id:</b>{` news-2026-11-21-semola-502
`}<b>domain:</b>{` mercatocereali.example
`}<b>date:</b>{` 2026-11-21T08:00:00+01:00
`}<b>reliability:</b>{` high
---
The spot price of durum semolina rose to
502 €/t, +18% in three weeks.`}</pre>
        </div>
        <At from={1}>
          <div className="st-grid3" style={{ gap: ".8em" }}>
            <div className="st-panel" style={{ padding: ".9em 1em" }}><span className="st-tag acc">email</span><p style={{ margin: ".6em 0 0", fontSize: ".75em", color: "var(--muted)" }}>trust sits on the <b style={{ color: "var(--fg)" }}>sender</b>, thread and visibility labels</p></div>
            <div className="st-panel" style={{ padding: ".9em 1em" }}><span className="st-tag acc">news</span><p style={{ margin: ".6em 0 0", fontSize: ".75em", color: "var(--muted)" }}>trust sits on the <b style={{ color: "var(--fg)" }}>domain</b>: a whole site can be distrusted</p></div>
            <div className="st-panel" style={{ padding: ".9em 1em" }}><span className="st-tag acc">document</span><p style={{ margin: ".6em 0 0", fontSize: ".75em", color: "var(--muted)" }}>contracts and reports: versions that <b style={{ color: "var(--fg)" }}>supersede</b></p></div>
          </div>
        </At>
        <At from={2}>
          <div style={{ display: "flex", gap: ".6em", flexWrap: "wrap" }}>
            <span className="st-tag ok">ingested</span><span className="st-tag">duplicate · already seen</span><span className="st-tag warn">conflict · edited file, ignored</span><span className="st-tag bad">invalid · rejected with a reason</span>
          </div>
          <p className="st-mid" style={{ fontSize: ".85em" }}>A correction is never an edit. It is a new source that supersedes the old one.</p>
        </At>
      </div>
    </div>
  );
}

export function ExtractStory() {
  return (
    <div className="st-full" style={{ gridTemplateColumns: "1fr 1.15fr", gap: "3vw", alignContent: "center", alignItems: "start" }}>
      <div>
        <Left eyebrow="02 · Extract" title={<>The model reads.<br />It proposes <span className="st-hl">atomic facts</span>.</>} />
        <div className="st-panel" style={{ marginTop: "1em" }}>
          <div className="hd"><span>EV-07 · source text</span><span className="st-tag">immutable</span></div>
          <p style={{ margin: 0, padding: "1em 1.2em", fontSize: ".95em", lineHeight: 1.6 }}>The spot price of durum semolina <mark style={{ background: "var(--mark)", color: "inherit", padding: "0 2px" }}>rose to 502 €/t, +18% in three weeks</mark>, on tight supply ahead of the winter.</p>
          <At from={1}><div className="st-mono" style={{ fontSize: ".6em", padding: "0 1.2em 1em", color: "var(--accent-ink)" }}>verbatim quote · quote_id = sha256(source | start | end)</div></At>
        </div>
      </div>
      <At from={1}>
        <div className="st-panel">
          <div className="hd"><span>claim · spot_price v2</span><span className="st-tag acc">proposed</span></div>
          <div style={{ padding: ".2em 1.2em" }}>
            {[["item", "ent:durum_semolina", "interpretive", ""], ["amount", "502", "literal", "ok"], ["currency", "EUR", "derived", "acc"], ["per", "t", "derived", "acc"], ["change_pct", "18", "literal", "ok"], ["period", "three weeks", "interpretive", ""]].map(([k, v, t, c]) => (
              <div key={k} className="st-row"><span className="k">{k}</span><span className="st-mono">{v}</span><span className={`st-tag ${c}`}>{t}</span></div>
            ))}
          </div>
        </div>
        <At from={2}><p className="st-mid" style={{ fontSize: ".8em" }}><b style={{ color: "var(--fg)" }}>Literal</b>: must be readable in the quote. <b style={{ color: "var(--fg)" }}>Derived</b>: recomputed by code (dates, units, currency). <b style={{ color: "var(--fg)" }}>Interpretive</b>: judged by a person.</p></At>
      </At>
    </div>
  );
}

export function GateStory() {
  const step = useStep();
  const rows: [string, string, string][] = [
    ["01", "The quote exists", "found exactly once in the source text"],
    ["02", "Literal values", "the number can be read inside the quote"],
    ["03", "Derived values", "date, unit and currency re-derived by a resolver"],
    ["04", "The interpretation", "left to the person who curates the memory"],
  ];
  return (
    <div className="st-full" style={{ gridTemplateColumns: "1fr 1.15fr", gap: "3vw", alignContent: "center", alignItems: "start" }}>
      <Left eyebrow="03 · The gate" title={<>The model can be wrong.<br /><span className="st-hl">The gate can’t.</span></>} body="Plain code. No model, no database. Everything a claim asserts is checked against its quotes before anything is stored." />
      <div style={{ display: "grid", gap: "1em" }}>
        <div className="st-panel">
          {rows.map(([n, b, s], i) => {
            const bad = step === 2 && i === 1;
            const ok = step >= 1 && !bad;
            return (
              <div key={n} className="st-check">
                <span className="n">{n}</span>
                <div><b>{b}</b><small>{s}</small></div>
                <span className={`st-tick ${bad ? "no" : ok ? "ok" : ""}`} style={{ transitionDelay: `${i * 0.25}s` }}>{bad ? "✕" : "✓"}</span>
              </div>
            );
          })}
        </div>
        <At from={2}>
          <div className="st-panel" style={{ borderColor: "var(--bad)", padding: "1em 1.2em" }}>
            <pre className="st-code">{`the model proposes  amount: `}<b style={{ color: "var(--bad)" }}>520</b>{`
`}<span style={{ color: "var(--bad)" }}>✕ literal_not_in_quote</span>{` · 520 appears in no quote
`}<b>↻ repair loop</b>{` · the model retries with the error
`}<span style={{ color: "var(--ok)" }}>✓ amount: 502</span></pre>
          </div>
        </At>
      </div>
    </div>
  );
}

export function LedgerStory() {
  const step = useStep();
  const blocks = [["#1", "sources", "7a3f…91c2"], ["#2", "quotes", "c10e…4d77"], ["#3", "claims", "5be9…02aa"], ["#4", "events", "e88d…b310"], ["#5", "events", "2f6c…79e4"], ["#6", "events", "a01b…c5d9"]];
  return (
    <div className="st-full">
      <div className="sl-eyebrow">04 · The ledger</div>
      <h1 style={{ fontSize: "1.9em", margin: ".25em 0 .7em" }}>A memory that doesn’t forget. <span className="st-hl">And doesn’t lie.</span></h1>
      <At from={0} to={0}>
        <div className="st-grid4" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: ".8em" }}>
          {[["sources", "original text and fingerprint"], ["quotes", "verbatim slices, checked by the database"], ["claims", "atomic facts, grounded field by field"], ["claim_events", "status is an event, not a column"], ["log", "one hash chain over every row"]].map(([t, d]) => (
            <div key={t} className="st-panel" style={{ padding: ".9em 1em" }}><b className="st-mono" style={{ fontSize: ".8em" }}>{t}</b><p style={{ margin: ".4em 0 0", fontSize: ".7em", color: "var(--muted)" }}>{d}</p></div>
          ))}
        </div>
        <p className="st-mid">UPDATE and DELETE are forbidden by the database itself. Approving, rejecting, superseding are new rows.</p>
      </At>
      <At from={1}>
        <div className="st-chain">
          {blocks.map(([n, t, h], i) => <div key={n} className={`st-block ${step === 2 && i >= 2 ? "bad" : "ok"}`} style={{ transitionDelay: `${i * 0.2}s` }}><b>{n}</b>{t}<br /><em>{h}</em></div>)}
        </div>
        <div style={{ marginTop: "1.2em" }}>
          {step === 1 ? <span className="st-tag ok">verify() · 6 rows · chain intact</span> : <span className="st-tag bad">verify() · row #3 doesn’t match</span>}
          {step === 2 && <p className="st-mid">Change one row and every row after it breaks. One check is enough to notice.</p>}
        </div>
      </At>
    </div>
  );
}

type NetNode = { id: string; x: number; y: number; cls?: string; pub: boolean; lock?: boolean };
const ACCESS_NODES: NetNode[] = [
  { id: "EV-07", x: 12, y: 14, pub: true }, { id: "PR-01", x: 40, y: 14, pub: true, cls: "ok" },
  { id: "EV-03", x: 12, y: 38, pub: true }, { id: "EV-02", x: 12, y: 62, pub: false, lock: true },
  { id: "PR-02", x: 52, y: 48, pub: false, cls: "ok", lock: true }, { id: "AZ-01", x: 86, y: 48, pub: false, cls: "prop", lock: true },
  { id: "EV-04", x: 12, y: 86, pub: true }, { id: "EV-06", x: 52, y: 86, pub: false, lock: true }, { id: "PR-03", x: 86, y: 86, pub: false, cls: "prop", lock: true },
];
const ACCESS_EDGES: [string, string][] = [["EV-07", "PR-01"], ["PR-01", "PR-02"], ["EV-03", "PR-02"], ["EV-02", "PR-02"], ["PR-02", "AZ-01"], ["EV-04", "AZ-01"], ["EV-06", "PR-03"]];

export function AccessStory() {
  const step = useStep();
  const who = ["Marta · everything", "Luca · public + finance", "Sara · public"];
  const visible = (n: NetNode) => step < 2 || n.pub;
  const byId = Object.fromEntries(ACCESS_NODES.map((n) => [n.id, n]));
  return (
    <div className="st-full" style={{ gridTemplateColumns: "1fr 1.5fr", gap: "3vw", alignContent: "center", alignItems: "center" }}>
      <div>
        <Left eyebrow="05 · Access" title={<>Access is decided <span className="st-hl">before</span> the model.</>} body="Policy filters the ledger, then the agent answers. The model never sees what the asker may not see. A derived claim inherits the strictest label of its sources." />
        <div className="st-panel" style={{ padding: "1em 1.2em", marginTop: "1em" }}><pre className="st-code">label(PR-02) = max(<br />&nbsp;&nbsp;label(PR-01), <b>label(EV-02)</b>, label(EV-03))</pre></div>
      </div>
      <div>
        <div style={{ display: "flex", border: "1px solid var(--line)", width: "fit-content", marginBottom: "1em" }}>
          {who.map((w, i) => <span key={w} className="st-tag" style={{ border: 0, borderRight: "1px solid var(--line)", background: i === step ? "var(--accent)" : "transparent", color: i === step ? "#fff" : "var(--muted)" }}>{w}</span>)}
        </div>
        <div className="st-net">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {ACCESS_EDGES.map(([a, b]) => <line key={a + b} x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y} vectorEffect="non-scaling-stroke" style={{ opacity: visible(byId[a]) && visible(byId[b]) ? 0.8 : 0 }} />)}
          </svg>
          {ACCESS_NODES.map((n) => <div key={n.id} className={`nd ${n.cls ?? ""}${visible(n) ? "" : " gone"}`} style={{ left: `${n.x}%`, top: `${n.y}%` }}>{n.id}{n.lock && step < 2 && <span className="lk">◆</span>}</div>)}
        </div>
        <At from={2}><p className="st-mid" style={{ fontSize: ".9em" }}>For Sara’s agent, the rest of the graph does not exist. Not hidden: absent.</p></At>
      </div>
    </div>
  );
}

const TREE: { id: string; x: number; y: number; lvl: number; hot?: boolean; keep?: boolean }[] = [
  { id: "SRC", x: 8, y: 50, lvl: 0, hot: true }, { id: "SRC·2", x: 8, y: 88, lvl: 0, keep: true },
  { id: "C1", x: 30, y: 30, lvl: 1 }, { id: "C2", x: 30, y: 58, lvl: 1 }, { id: "C3", x: 30, y: 88, lvl: 1, keep: true },
  { id: "D1", x: 54, y: 16, lvl: 2 }, { id: "D2", x: 54, y: 42, lvl: 2 }, { id: "D3", x: 54, y: 68, lvl: 2 }, { id: "D4", x: 54, y: 90, lvl: 2, keep: true },
  { id: "ACTION", x: 78, y: 40, lvl: 3 }, { id: "ACTION·2", x: 78, y: 82, lvl: 3, keep: true }, { id: "BRIEF", x: 94, y: 56, lvl: 4 },
];
const TREE_EDGES: [string, string][] = [["SRC", "C1"], ["SRC", "C2"], ["C1", "D1"], ["C1", "D2"], ["C2", "D2"], ["C2", "D3"], ["D1", "ACTION"], ["D2", "ACTION"], ["D3", "ACTION"], ["SRC·2", "C3"], ["C3", "D4"], ["D4", "ACTION·2"], ["ACTION", "BRIEF"], ["ACTION·2", "BRIEF"]];

export function RecomputeStory() {
  const step = useStep();
  const byId = Object.fromEntries(TREE.map((n) => [n.id, n]));
  return (
    <div className="st-full">
      <div className="sl-eyebrow">06 · Recompute</div>
      <div className="st-stack" style={{ minHeight: "4.6em" }}>
        <At from={0} to={0}><h1 style={{ fontSize: "1.9em", margin: ".25em 0" }}>Every fact has a parent.</h1></At>
        <At from={1}><h1 style={{ fontSize: "1.9em", margin: ".25em 0" }}>Distrust a source. <span className="st-hl">The rest recomputes.</span></h1></At>
      </div>
      <div className="st-net" style={{ marginTop: "1em" }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {TREE_EDGES.map(([a, b]) => <line key={a + b} x1={byId[a].x} y1={byId[a].y} x2={byId[b].x} y2={byId[b].y} vectorEffect="non-scaling-stroke" />)}
        </svg>
        {TREE.map((n) => {
          const hit = step >= 1 && !n.keep;
          const cls = hit ? (n.hot ? "hot" : "rev") : "ok";
          return <div key={n.id} className={`nd ${cls}`} style={{ left: `${n.x}%`, top: `${n.y}%`, transitionDelay: hit ? `${n.lvl * 0.55}s` : "0s" }}>{n.id.split("·")[0]}</div>;
        })}
      </div>
      <At from={2}>
        <div className="st-mono" style={{ fontWeight: 700, color: "var(--warn)", fontSize: "1.1em" }}>5 conclusions and 1 action to review</div>
        <p className="st-mid" style={{ fontSize: ".85em", marginTop: ".3em" }}>3 nodes untouched. The brief is rewritten. The blast radius is visible.</p>
      </At>
    </div>
  );
}

/* ============================ ACT V · one more thing ============================ */

export function FinaleStory() {
  return (
    <div className="st-full">
      <div className="st-stack" style={{ minHeight: "46vh" }}>
        <At from={0} to={0}><h1 className="st-huge">A company is what it remembers.<br /><span style={{ color: "var(--muted)" }}>Almost none of it is shared.</span></h1></At>
        <At from={1}>
          <div>
            <h1 className="st-huge">Company Brain.</h1>
            <p className="st-big" style={{ color: "var(--muted)", marginTop: ".3em", fontSize: "clamp(22px,2.8vw,44px)" }}>The colleague who knows, and speaks first.</p>
            <div className="sl-eyebrow" style={{ marginTop: "2em" }}>GDG Agenthon 2026</div>
          </div>
        </At>
      </div>
    </div>
  );
}
