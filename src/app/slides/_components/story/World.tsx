"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { At, useStep } from "../step";

/* A company drawn as a graph. The camera flies into one dot at a time and shows what happens in that room. */

const W = 1600;
const H = 900;
/** Camera per room: zoom, and how far below the dot the camera looks (tall panels need the view lower). */
const CAM: Record<string, { z: number; dy: number }> = {
  market: { z: 2.9, dy: 30 }, finance: { z: 2.9, dy: 30 }, production: { z: 2.15, dy: 95 }, procurement: { z: 2.45, dy: 60 }, erp: { z: 2.7, dy: 45 },
};

interface Room { id: string; x: number; y: number; label: string; letter: string }
const ROOMS: Room[] = [
  { id: "market", x: 250, y: 240, label: "Market", letter: "↗" },
  { id: "finance", x: 820, y: 170, label: "Finance", letter: "L" },
  { id: "production", x: 1330, y: 290, label: "Production", letter: "S" },
  { id: "procurement", x: 470, y: 700, label: "Procurement", letter: "M" },
  { id: "erp", x: 1140, y: 730, label: "ERP", letter: "ERP" },
];
const BRAIN = { x: 800, y: 450 };

function useBox() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 1600, h: 900 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return { ref, box };
}

export const SoundContext = createContext(true);

/** The only voice in the deck is the Brain's (ElevenLabs). It speaks TO a person, never as one. Karaoke words light up with the audio. */
function Voice({ to, text, on, src, dur }: { to: string; text: string; on: boolean; src: string; dur: number }) {
  const sound = useContext(SoundContext);
  const START = 0.4; // the Voice only mounts on its own click, so the camera is already there
  const words = text.split(" ");
  const total = words.reduce((n, w) => n + w.length + 1, 0);
  const starts = words.map((_, i) => words.slice(0, i).reduce((n, w) => n + w.length + 1, 0));
  useEffect(() => {
    if (!on || !sound) return;
    const a = new Audio(src);
    const t = setTimeout(() => { a.play().catch(() => {}); }, START * 1000);
    return () => { clearTimeout(t); a.pause(); };
  }, [on, sound, src]);
  return (
    <div className="wv">
      <div className="wv-h"><span>COMPANY BRAIN · SPEAKS TO {to}</span><span className="wv-live">● live</span></div>
      <div className="wv-wave">{Array.from({ length: 28 }).map((_, i) => <i key={i} style={{ animationDelay: `${START + (i % 9) * 0.08}s`, animationDuration: `${0.7 + (i % 5) * 0.11}s` }} />)}</div>
      <p className="wv-t" key={String(on)}>{words.map((w, i) => <span key={i} className="kw" style={{ animationDelay: `${START + (starts[i] / total) * (dur - 0.3)}s` }}>{w} </span>)}</p>
    </div>
  );
}

function Panel({ room, on, children }: { room: Room; on: boolean; children: ReactNode }) {
  return <div className={`wp${on ? " on" : ""}`} style={{ left: room.x + 46, top: room.y - 100 }}>{children}</div>;
}
const Hd = ({ a, b }: { a: string; b?: string }) => <div className="wp-h"><span>{a}</span>{b && <em>{b}</em>}</div>;

function BeforePanels({ focus }: { focus: string | null }) {
  const R = (id: string) => ROOMS.find((r) => r.id === id)!;
  return (
    <>
      <Panel room={R("market")} on={focus === "market"}>
        <Hd a="Grain Market Report" b="21 Nov" />
        <svg viewBox="0 0 280 80" className="wp-chart"><polyline points="0,64 40,62 80,58 120,54 160,46 200,34 240,16 280,6" /></svg>
        <div className="wp-big">+18%</div><div className="wp-sm">502 €/t · in three weeks</div>
      </Panel>
      <Panel room={R("finance")} on={focus === "finance"}>
        <Hd a="Contract CQ-2026-031" b="finance" />
        <div className="wp-row"><span>Price</span><b>412 €/t fixed</b></div>
        <div className="wp-row"><span>Covers</span><b>60% of needs</b></div>
        <div className="wp-row"><span>Expires</span><b>31/03/2027</b></div>
        <div className="wp-sm">Locked. Until March.</div>
      </Panel>
      <Panel room={R("production")} on={focus === "production"}>
        <Hd a="WMS Parma · semolina" b="20 Nov" />
        <div className="wp-gauge">{Array.from({ length: 30 }).map((_, i) => <i key={i} className={i < 9 ? "lit" : ""} style={{ animationDelay: `${i * 0.03}s` }} />)}</div>
        <div className="wp-big">9 days</div><div className="wp-sm">of cover · 1,200 t on hand</div>
      </Panel>
      <Panel room={R("procurement")} on={focus === "procurement"}>
        <Hd a="Alta Murgia Mill" b="offer" />
        <div className="wp-row"><span>Quantity</span><b>3,000 t</b></div>
        <div className="wp-row"><span>Price</span><b>470 €/t</b></div>
        <div className="wp-row"><span>Valid until</span><b className="wp-warn">28/11</b></div>
        <div className="wp-pips">{Array.from({ length: 7 }).map((_, i) => <i key={i} className={i === 6 ? "last" : ""} />)}<span>7 days</span></div>
      </Panel>
    </>
  );
}

function AfterPanels({ focus, step }: { focus: string | null; step: number }) {
  const R = (id: string) => ROOMS.find((r) => r.id === id)!;
  return (
    <>
      <Panel room={R("market")} on={focus === "market"}>
        <Hd a="EV-07 · new evidence" b="08:00" />
        <div className="wp-quote">“rose to 502 €/t, +18% in three weeks”</div>
        <div className="wp-checks"><span>✓ quote verbatim</span><span>✓ 502 and 18 in quote</span><span>◐ interpretation: a person</span></div>
        <div className="wp-sm">Nobody asked. It read it first.</div>
      </Panel>
      <Panel room={R("procurement")} on={focus === "procurement"}>
        <Hd a="Company Brain → Marta" b="09:02" />
        <div className="wp-title">Semolina +18%: the uncovered share costs about €123,000/month more</div>
        {step >= 2 && <Voice to="MARTA" src="/slides/a/procurement.mp3" dur={9.3} on={focus === "procurement"} text="Marta, good morning. Semolina is up eighteen percent. The uncovered share costs about a hundred and twenty-three thousand a month. I won't execute anything. I need your yes." />}
      </Panel>
      <Panel room={R("finance")} on={focus === "finance"}>
        <Hd a="Luca · Finance" b="asks" />
        <div className="wp-q">What is our framework contract price?</div>
        {step >= 4 && (
          <>
            <div className="wp-a">412 €/t, fixed. 60% of needs, until 31/03/2027. <span className="wp-cite">EV-02</span></div>
            <Voice to="LUCA" src="/slides/a/finance.mp3" dur={8.08} on={focus === "finance"} text="Four hundred twelve euros a tonne, fixed. Source: contract C Q two zero two six zero three one." />
          </>
        )}
      </Panel>
      <Panel room={R("production")} on={focus === "production"}>
        <Hd a="Sara · Production" b="asks" />
        <div className="wp-q">What is our framework contract price?</div>
        {step >= 6 && (
          <>
            <div className="wp-a wp-unk">I don&apos;t know.</div>
            <div className="wp-q" style={{ marginTop: 6 }}>How many days of stock do we have in Parma?</div>
            <div className="wp-a">9 days of cover, as of 20/11. <span className="wp-cite">EV-04</span></div>
            <Voice to="SARA" src="/slides/a/production.mp3" dur={4.8} on={focus === "production"} text="I don't know. Nine days of cover in Parma, as of the twentieth." />
          </>
        )}
      </Panel>
      <Panel room={R("erp")} on={focus === "erp"}>
        <Hd a="ERP · advance orders" b="11:48" />
        <div className="wp-big">1</div>
        <div className="wp-po"><b>PO-9120</b><span>3,000 t · Alta Murgia Mill · 470 €/t</span></div>
        <div className="wp-sm">Created because Marta approved AZ-02.<br />Bound to the evidence hash <span className="mono">#4f1a…c09e</span></div>
      </Panel>
    </>
  );
}

type Fix = "meeting" | "chat" | "nope" | null;

/** The popular fixes, drawn where the Brain will later be. A meeting. A chatbot on the shared drive. */
function FixNode({ kind }: { kind: Exclude<Fix, null> }) {
  const chat = kind !== "meeting";
  return (
    <div className={`wd-fix${kind === "nope" ? " nope" : ""}`} style={{ left: BRAIN.x, top: BRAIN.y }}>
      {!chat ? (
        <>
          <div className="wd-fix-h">WEEKLY SYNC · 1 h</div>
          <div className="wd-fix-r"><span>10:00</span>everyone attends</div>
          <div className="wd-fix-r"><span>10:55</span>“let’s take this offline”</div>
          <div className="wd-fix-f"><b>14</b> action items · <b>0</b> decided</div>
        </>
      ) : (
        <>
          <div className="wd-fix-h">SHARED DRIVE + CHATBOT</div>
          <div className="wd-fix-b">“Semolina is probably up. Probably.”</div>
          <div className="wd-fix-f">sources: <b>?</b> · tone: <b>very confident</b></div>
        </>
      )}
      {kind === "nope" && <div className="wd-nope">NOPE.</div>}
    </div>
  );
}

export function World({ mode, focus, cut, step, fix = null, brain = mode === "after" }: { mode: "before" | "after"; focus: string | null; cut: boolean; step: number; fix?: Fix; brain?: boolean }) {
  const { ref, box } = useBox();
  const k = Math.min(box.w / W, box.h / H);
  const room = ROOMS.find((r) => r.id === focus);
  const cam = room ? CAM[room.id] : null;
  const z = cam ? cam.z : 1;
  const cx = room ? room.x + 190 : W / 2;
  const cy = room && cam ? room.y + cam.dy : H / 2;
  const tx = W / 2 - z * cx;
  const ty = H / 2 - z * cy;
  const transform = `translate(${(box.w - W * k) / 2}px, ${(box.h - H * k) / 2}px) scale(${k}) translate(${tx}px, ${ty}px) scale(${z})`;
  return (
    <div className="wd-view" ref={ref}>
      <div className="wd-world" style={{ transform, width: W, height: H }}>
        <svg className="wd-lines" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
          {ROOMS.map((r) => {
            if (brain) return <line key={r.id} className={`wd-line${r.id === "erp" ? " gated" : " live"}`} x1={BRAIN.x} y1={BRAIN.y} x2={r.x} y2={r.y} />;
            if (fix) return <line key={r.id} className="wd-line fix" x1={r.x} y1={r.y} x2={BRAIN.x} y2={BRAIN.y} />;
            const ex = r.x + (BRAIN.x - r.x) * 0.38, ey = r.y + (BRAIN.y - r.y) * 0.38;
            return (
              <g key={r.id} className={`wd-cut${cut ? " on" : ""}`}>
                <line className="wd-line" x1={r.x} y1={r.y} x2={ex} y2={ey} />
                <text x={ex} y={ey + 6} textAnchor="middle">×</text>
              </g>
            );
          })}
        </svg>
        {fix && <FixNode kind={fix} />}
        {brain && <div className="wd-brain" style={{ left: BRAIN.x, top: BRAIN.y }}><svg width="34" height="34" viewBox="-30 -30 60 60" fill="#fff" stroke="#fff" strokeWidth="2.4"><path d="M-22 -18L22 -8L-2 20Z" fill="none" /><circle cx="-22" cy="-18" r="6" /><circle cx="22" cy="-8" r="6" /><circle cx="-2" cy="20" r="6" /></svg></div>}
        {ROOMS.map((r) => (
          <div key={r.id} className={`wd-room${focus === r.id ? " focus" : ""}`} style={{ left: r.x, top: r.y }}>
            <span className="wd-dot">{r.letter}</span>
            <span className="wd-name">{r.label}</span>
          </div>
        ))}
        {mode === "before" ? <BeforePanels focus={focus} /> : <AfterPanels focus={focus} step={step} />}
      </div>
    </div>
  );
}

export function Caption({ lines }: { lines: [string, string, boolean?][] }) {
  return (
    <div className="wd-cap st-stack" style={{ minHeight: "8.5em" }}>
      {lines.map(([a, b, big], i) => (
        <At key={i} from={i} to={i}><div className="st-big" style={{ fontSize: big ? "clamp(40px,6vw,96px)" : "clamp(26px,3.2vw,52px)" }}>{a}</div><div className="st-mid" style={{ marginTop: ".3em", fontSize: "clamp(15px,1.5vw,24px)" }}>{b}</div></At>
      ))}
    </div>
  );
}

const BEFORE_FOCUS: (string | null)[] = [null, "finance", "production", "procurement", null, null, null, null];
const AFTER_FOCUS: (string | null)[] = [null, "procurement", "procurement", "finance", "finance"];

export function CompanyStory() {
  const step = useStep();
  return (
    <div className="wd-stage">
      <World mode="before" focus={BEFORE_FOCUS[step] ?? null} cut={step === 4} step={step} fix={step === 5 ? "meeting" : step === 6 ? "chat" : step >= 7 ? "nope" : null} />
      <Caption lines={[
        ["Every company is a graph.", "Each dot is a room where something is known."],
        ["Finance holds the contract.", "412 €/t, locked until March."],
        ["Production holds the clock.", "9 days of semolina in stock."],
        ["Procurement holds an offer.", "3,000 t at 470 €/t. It expires on the 28th."],
        ["Four rooms. No door between them.", "Nobody has done the maths."],
        ["The usual fix: a door.", "A weekly meeting. Everyone nods. Nothing is decided."],
        ["The popular fix: a chatbot on the shared drive.", "It reads everything, trusts everything, and never says it is guessing."],
        ["Nope.", "Nobody wants another meeting. Nobody trusts a bot that never says “I don't know”.", true],
      ]} />
    </div>
  );
}

export function RoomsStory() {
  const step = useStep();
  const [sound, setSound] = useState(true);
  return (
    <SoundContext.Provider value={sound}>
    <div className="wd-stage">
      <button className="wd-sound" onClick={() => setSound((v) => !v)} aria-pressed={sound}>{sound ? "● Sound on" : "○ Sound off"}</button>
      <World mode="after" focus={AFTER_FOCUS[step] ?? null} cut={false} step={step} />
      <Caption lines={[
        ["The same brain, in the rooms.", "One voice: the Brain's."],
        ["Procurement: it writes first.", "A message lands in Marta's channel."],
        ["Then it tells her.", "The yes stays human."],
        ["Finance: Luca asks.", "Typed, like any colleague would."],
        ["The Brain answers, and says it.", "With its source. One voice: the Brain's."],
      ]} />
    </div>
    </SoundContext.Provider>
  );
}
