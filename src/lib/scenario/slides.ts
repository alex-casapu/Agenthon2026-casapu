import type { EventName } from "./types";

export interface Slide {
  slug: string;
  title: string;
  /** Speaker prompts, toggled with N. Not for the audience. */
  notes: string[];
  /** The scenario event the presenter fires on this slide (key E). */
  event?: EventName;
}

/** The talk, in order. Drives the menu icons, arrow-key navigation and the notes. */
export const SLIDES: Slide[] = [
  {
    slug: "title",
    title: "Company Brain",
    notes: ["Hook, 15 s: everything needed to decide is already in the company, in different places.", "Three people each hold one piece. Nobody has done the maths."],
  },
  {
    slug: "world",
    title: "The company today",
    notes: ["Set the 'before': no advance order exists. Stock covers 9 days.", "We come back to this panel at the end."],
  },
  {
    slug: "channel",
    title: "It speaks first",
    event: "report",
    notes: ["Press E: the market report arrives. Nobody asked anything.", "Point at: sources, 'generated autonomously', 'nothing has been executed'.", "Toggle Slack / Morning email: this is where the team already is."],
  },
  {
    slug: "memory",
    title: "People curate the memory",
    notes: ["Approve the price and cost conclusions, reject the rumour.", "Try to approve the action first: it refuses until its conclusions are approved.", "Each proposal shows what the gate verified mechanically."],
  },
  {
    slug: "ask",
    title: "Ask it anything",
    notes: ["Ask the price question. Then show a citation: click through to the highlighted quote.", "Ask about the Canadian harvest: 'I don't know', the rumour was rejected.", "Ask about Turkey: 'I don't know'. It admits gaps."],
  },
  {
    slug: "who",
    title: "It knows who's asking",
    notes: ["Same question, two people, at once.", "Finance gets the contract price with its source. Production gets 'Not authorized': it exists, they can't see it."],
  },
  {
    slug: "correction",
    title: "Then the world changes",
    event: "correction",
    notes: ["Press E: the correction arrives. +18% was one local market.", "Nothing is rewritten. The old evidence stays, linked; everything that rested on it is flagged; lower numbers are proposed."],
  },
  {
    slug: "approvals",
    title: "It only proposes",
    notes: ["The world still shows no order. Approve the updated action: only now does PO-9120 appear.", "Savings fell from €96k to €24k: still worth it, much less so."],
  },
  {
    slug: "why",
    title: "Why did we buy?",
    notes: ["The full chain: decision, who approved when, conclusions, evidence, superseded versions.", "Close on the checklist: seven out of seven."],
  },
];

export const slideIndex = (slug: string) => SLIDES.findIndex((s) => s.slug === slug);
