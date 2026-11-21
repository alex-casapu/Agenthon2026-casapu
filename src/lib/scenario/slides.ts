import type { EventName } from "./types";

export interface Slide {
  slug: string;
  title: string;
  /** Speaker prompts, toggled with N. Not for the audience. */
  notes: string[];
  /** The scenario event the presenter fires on this slide (key E). */
  event?: EventName;
  /** Extra beats inside the slide: the arrow keys walk through them before moving on. */
  steps?: number;
  /** Background video key (see videos.ts). */
  bg?: string;
  /** The interactive part of the demo: shows the role switch. Story slides are cinematic. */
  demo?: boolean;
  /** Chapter label, shown top left. */
  act?: string;
  /** Not part of the 3-minute talk: kept for questions. Reached with the B key or the menu, never by walking forward. */
  backup?: boolean;
}

/**
 * The 3-minute talk, in order: the problem, the reveal, the proof (live), the close. Then the BACKUP slides
 * (engine, maths, extras): reached with B or the menu, never by walking forward from the end.
 */
export const SLIDES: Slide[] = [
  { slug: "intro", title: "Company Brain", act: "Intro", steps: 0, bg: "wheat",
    notes: ["A calm start. Say who you are, and that the story is built on the processes of a pasta company. ~20 s."] },
  // ---- the problem ------------------------------------------------------------------------------
  { slug: "title", title: "Two ingredients", act: "I · The problem", steps: 1, bg: "wheat",
    notes: ["Don't start with the product. Pasta: water and semolina. Pause. Then the +18%.", "~15 s."] },
  { slug: "morning", title: "Parma, 08:58", act: "I · The problem", steps: 1, bg: "mill",
    notes: ["Nine days left. Then the three facts at once. ~10 s."] },
  { slug: "company", title: "Four rooms", act: "I · The problem", steps: 7,
    notes: ["Fly into finance, production, procurement. Then the two popular fixes: a meeting, a chatbot on the drive. Then: Nope. ~40 s."] },
  // ---- the reveal -------------------------------------------------------------------------------
  { slug: "reveal", title: "Company Brain", act: "II · The reveal", steps: 1,
    notes: ["What if the pieces found each other? Then the name and the line. ~10 s."] },
  // ---- the proof (live) -------------------------------------------------------------------------
  { slug: "channel", title: "It speaks first", act: "III · The proof", demo: true, event: "report",
    notes: ["Press E. Nobody asked. Point at: sources, 'nothing has been executed'. ~15 s."] },
  { slug: "memory", title: "People curate the memory", act: "III · The proof", demo: true,
    notes: ["Approve the price and the cost, reject the rumour. ~15 s."] },
  { slug: "who", title: "It knows who's asking", act: "III · The proof", demo: true,
    notes: ["Same question, Luca and Sara. Luca: price and source. Sara: 'I don't know'. ~15 s."] },
  { slug: "correction", title: "Then the world changes", act: "III · The proof", demo: true, event: "correction",
    notes: ["Press E. Nothing is rewritten; what rested on the old evidence is flagged. ~12 s."] },
  { slug: "approvals", title: "It only proposes", act: "III · The proof", demo: true,
    notes: ["Approve the updated conclusions and the action: only now does PO-9120 exist. ~12 s."] },
  { slug: "why", title: "Why did we buy?", act: "III · The proof", demo: true,
    notes: ["One click: decision, approver, evidence, superseded versions. ~8 s."] },
  { slug: "rooms", title: "One brain, four rooms", act: "III · The proof", steps: 4,
    notes: ["The same brain in the rooms, with one voice: the Brain's. Input first, voice on the click. ~20 s."] },
  // ---- the close --------------------------------------------------------------------------------
  { slug: "impact", title: "What it is worth", act: "IV · What it is worth", steps: 1,
    notes: ["Numbers from the demo you just saw. Then: every company has this problem. ~12 s."] },
  { slug: "extract", title: "Facts, not summaries", act: "V · Under the hood", steps: 2, notes: ["Atomic claims tied to verbatim quotes. Literal, derived, interpretive."] },
  { slug: "access", title: "Access before the model", act: "V · Under the hood", steps: 2, notes: ["Policy before any model call. For Sara's agent the rest does not exist."] },
  { slug: "recompute", title: "Distrust a source", act: "V · Under the hood", steps: 2, notes: ["A pure function of ledger and policy: only dependents recompute."] },
  { slug: "finale", title: "The colleague who knows", act: "VI · The close", steps: 1, bg: "pasta",
    notes: ["Back to pasta. Close slowly. ~10 s."] },

  // ======================================== BACKUP ========================================
  { slug: "world", title: "The world, this morning", act: "Backup", demo: true, backup: true,
    notes: ["The 'before' panel: no order exists. Stock covers 9 days."] },
  { slug: "math", title: "Nobody had done the maths", act: "Backup", steps: 3, backup: true,
    notes: ["Where 123,200 comes from: 77 × 1,600. Then the action: €96k saved, 9 → 31 days."] },
  { slug: "ask", title: "Ask it anything", act: "Backup", demo: true, backup: true,
    notes: ["Cites, and admits gaps: Canada rejected, Turkey unknown."] },
  { slug: "how", title: "Under the hood", act: "Backup", steps: 3, backup: true,
    notes: ["HANDOVER: your brother speaks. The model proposes, code verifies, a person decides, the ledger remembers. Press B for the details if asked."] },
  { slug: "tech", title: "How do you trust it?", act: "Backup · The engine", steps: 1, bg: "racks", backup: true,
    notes: ["You don't. You verify."] },
  { slug: "ingest", title: "How a source enters", act: "Backup · The engine", steps: 2, backup: true, notes: ["A file in a folder. It only ever appends."] },
  { slug: "gate", title: "The gate", act: "Backup · The engine", steps: 2, backup: true, notes: ["Plain code, no model. A wrong value bounces back."] },
  { slug: "ledger", title: "The ledger", act: "Backup · The engine", steps: 2, backup: true, notes: ["Append-only, one hash chain, verify()."] },
  { slug: "ideas", title: "Six ideas, all running", act: "Backup · Ideas", steps: 1, backup: true,
    notes: ["For questions on the technology. Walk the six: quote-checked claims, the hash chain, access before the model, verified answers, automatic entities, proactive per person. Then the trust-by-default line."] },
  { slug: "scope", title: "Real, staged, missing", act: "Backup · Scope", steps: 2, backup: true,
    notes: ["Be straight about it. Green: the live app. Amber: slides 6-11 are a scripted engine. Red: derived claims, real proposals, recompute, connectors, login."] },
];

export const slideIndex = (slug: string) => SLIDES.findIndex((s) => s.slug === slug);
/** Slides in the talk itself (the backup ones come after). */
export const MAIN_COUNT = SLIDES.filter((s) => !s.backup).length;
