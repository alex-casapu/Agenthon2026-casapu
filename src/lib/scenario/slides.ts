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
  // ---- glue ---------------------------------------------------------
  { slug: "intro", title: "Company Brain", act: "Intro", steps: 0, bg: "wheat",
    notes: ["Who you are, the tagline, and that the demo runs on a simulated pasta company. ~10 s. The problem is defined by the challenge: no problem section."] },
  // ---- the real app, five actions ---------------------------------------------------------------
  { slug: "demo", title: "Live, on the real app", act: "Live", steps: 4,
    notes: ["The real web app, in the simulated world. 1 alert, 2 reject, 3 no access, 4 with access and citations, 5 unknown. ~20 s each."] },
  // ---- the technically interesting ideas (your brother) -----------------------------------------
  { slug: "extract", title: "Facts, not summaries", act: "The ideas", steps: 2,
    notes: ["Atomic claims tied to verbatim quotes, three tiers of trust, a gate made of plain code."] },
  { slug: "access", title: "Access before the model", act: "The ideas", steps: 2,
    notes: ["Policy before any model call. A claim inherits the strictest label. For Sara's agent the rest does not exist."] },
  { slug: "recompute", title: "Distrust a source", act: "The ideas", steps: 2,
    notes: ["Derived state is a pure function of the ledger and the policy: distrust a source, only dependents recompute."] },
  { slug: "finale", title: "The colleague who knows", act: "Close", steps: 1, bg: "pasta",
    notes: ["Close slowly."] },

  // ======================================== BACKUP ========================================
  { slug: "company", title: "Rooms that don't talk", act: "Backup · problem", steps: 3, backup: true,
    notes: ["Rooms that don't talk. The usual fixes: a meeting, a chatbot on the drive. Nope. ~25 s."] },
  { slug: "reveal", title: "Company Brain", act: "Backup · problem", steps: 1, backup: true,
    notes: ["We didn't add a door; we gave the company a brain. Then straight into the app. ~8 s."] },
  { slug: "gate", title: "The gate", act: "Backup · The engine", steps: 2, backup: true, notes: ["Plain code, no model. A wrong value bounces back."] },
  { slug: "ledger", title: "The ledger", act: "Backup · The engine", steps: 2, backup: true, notes: ["Append-only, one hash chain, verify()."] },
  { slug: "ingest", title: "How a source enters", act: "Backup · The engine", steps: 2, backup: true, notes: ["A file in a folder. It only ever appends."] },
  { slug: "how", title: "Under the hood", act: "Backup", steps: 3, backup: true, notes: ["The pipeline in one slide."] },
  { slug: "tech", title: "How do you trust it?", act: "Backup · The engine", steps: 1, bg: "racks", backup: true, notes: ["You don't. You verify."] },
  // The earlier scripted mock demo (engine-driven). Kept for reference; the talk uses the real app.
  { slug: "channel", title: "It speaks first (mock)", act: "Backup · mock", demo: true, event: "report", backup: true, notes: ["Mock demo."] },
  { slug: "memory", title: "People curate (mock)", act: "Backup · mock", demo: true, backup: true, notes: ["Mock demo."] },
  { slug: "who", title: "Who's asking (mock)", act: "Backup · mock", demo: true, backup: true, notes: ["Mock demo."] },
  { slug: "correction", title: "Correction (mock)", act: "Backup · mock", demo: true, event: "correction", backup: true, notes: ["Mock demo."] },
  { slug: "approvals", title: "Only proposes (mock)", act: "Backup · mock", demo: true, backup: true, notes: ["Mock demo."] },
  { slug: "why", title: "Why did we buy (mock)", act: "Backup · mock", demo: true, backup: true, notes: ["Mock demo."] },
  { slug: "ask", title: "Ask it anything (mock)", act: "Backup · mock", demo: true, backup: true, notes: ["Mock demo."] },
  { slug: "world", title: "The world (mock)", act: "Backup · mock", demo: true, backup: true, notes: ["Mock demo."] },
  { slug: "math", title: "The maths", act: "Backup", steps: 3, backup: true, notes: ["Where the numbers come from."] },
  { slug: "rooms", title: "Rooms, with the Brain's voice", act: "Backup", steps: 4, backup: true, notes: ["The voice scene (ElevenLabs), if there is time."] },
  { slug: "impact", title: "What it is worth", act: "Backup", steps: 1, backup: true, notes: ["The numbers, from the mock story."] },
];

export const slideIndex = (slug: string) => SLIDES.findIndex((s) => s.slug === slug);
/** Slides in the talk itself (the backup ones come after). */
export const MAIN_COUNT = SLIDES.filter((s) => !s.backup).length;
