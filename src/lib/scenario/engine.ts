import { DAY, NODES, NODE_IDS, ROLES } from "./data";
import type { Action, AskResult, EventName, LogEntry, Message, RoleId, State, Status } from "./types";

const M = (h: number, m: number) => h * 60 + m;
export const fmtClock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export const STATUS_LABEL: Record<Status, string> = {
  registered: "on record",
  approved: "approved",
  proposed: "proposed",
  rejected: "rejected",
  to_review: "to review",
  superseded: "superseded",
};

export function initialState(): State {
  const nodes: State["nodes"] = {};
  for (const n of Object.values(NODES)) {
    nodes[n.id] = n.kind === "memory" ? { status: n.initial, by: "Marta Ricci", at: "20 Nov" } : { status: n.initial };
  }
  return { nodes, events: [], messages: [], orders: [], role: "procurement", chat: [], split: [], visited: [], log: [], clock: M(8, 58), notice: null, seq: 1 };
}

// ------------------------------------------------------------------ graph helpers

export const isArrived = (s: State, id: string) => NODES[id].arrives === "start" || s.events.includes(NODES[id].arrives as EventName);

/** Every node this one rests on, directly or not. */
export function ancestors(id: string): string[] {
  const out = new Set<string>();
  const walk = (x: string) => {
    for (const b of NODES[x].basedOn) {
      if (!out.has(b)) {
        out.add(b);
        walk(b);
      }
    }
  };
  walk(id);
  return [...out];
}

export const evidenceRoots = (id: string): string[] => (NODES[id].kind === "evidence" ? [id] : ancestors(id).filter((x) => NODES[x].kind === "evidence"));

/** Nodes that rest on `id`, directly or not. */
export const dependents = (id: string): string[] => NODE_IDS.filter((x) => ancestors(x).includes(id));

/** A node is visible to a role only if the role can read ALL the evidence beneath it. */
export function canSee(role: RoleId, id: string): boolean {
  const reads = ROLES[role].reads;
  return evidenceRoots(id).every((e) => reads.includes(NODES[e].label!));
}

/** The node, what it rests on, and the older versions it replaced (and what those rested on). */
export function lineage(id: string): string[] {
  const set = new Set<string>([id, ...ancestors(id)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const x of [...set]) {
      const old = NODES[x].replaces;
      if (old && !set.has(old)) {
        set.add(old);
        for (const a of ancestors(old)) set.add(a);
        grew = true;
      }
    }
  }
  const order = ["action", "conclusion", "hypothesis", "memory", "evidence"];
  const rest = [...set].filter((x) => x !== id).sort((a, b) => order.indexOf(NODES[a].kind) - order.indexOf(NODES[b].kind) || a.localeCompare(b));
  return [id, ...rest];
}

// ------------------------------------------------------------------ reducer

function addLog(s: State, actor: string, text: string, refs: string[]): LogEntry[] {
  return [...s.log, { at: `${DAY} · ${fmtClock(s.clock)}`, actor, text, refs }];
}

const tick = (s: State, min = 1): State => ({ ...s, clock: s.clock + min });

function reportMessage(s: State): Message {
  return {
    id: "msg-report",
    at: fmtClock(s.clock),
    channel: "#procurement",
    title: "Semolina +18%: the uncovered share costs about €123,000/month more",
    lead: "A new market report just came in. I put it together with the contract, our needs and the open offer.",
    bullets: [
      { text: "The spot price rose to 502 €/t, +18% in three weeks.", ref: "PR-01" },
      { text: "The uncovered 40% will cost about €123,000/month more, about €493,000 through March.", ref: "PR-02" },
      { text: "Unverified: a fair rumour says the Canadian harvest is worse. Weak source.", ref: "PR-03" },
    ],
    action: { text: "Bring forward 3,000 t from Alta Murgia Mill at 470 €/t: saves about €96,000. The offer expires on 28/11.", ref: "AZ-01" },
    footer: [`Generated autonomously · ${fmtClock(s.clock)}`, "Nothing has been executed. Your approval is needed."],
  };
}

function correctionMessage(s: State): Message {
  return {
    id: "msg-correction",
    at: fmtClock(s.clock),
    channel: "#procurement",
    title: "Correction: the +18% was one local market. The updated numbers are lower",
    lead: "The market report was corrected. I didn't rewrite anything: I added the new evidence and flagged everything that rested on the old one.",
    bullets: [
      { text: "The spot price is 478 €/t, +12.5% on October (was 502 €/t, +18%).", ref: "PR-04" },
      { text: "The uncovered share costs about €84,800/month more, about €339,000 through March (was €123,000/month).", ref: "PR-05" },
    ],
    action: { text: "Same purchase, smaller saving: about €24,000 (was €96,000). Still worth doing, much less so. The offer expires on 28/11.", ref: "AZ-02" },
    footer: [`Generated autonomously · ${fmtClock(s.clock)}`, "Three earlier items are now marked “to review”. Nothing has been executed."],
    correction: true,
  };
}

function fireEvent(s: State, name: EventName): State {
  if (s.events.includes(name)) return s;
  if (name === "report") {
    const t = { ...s, clock: Math.max(s.clock, M(9, 2)) };
    const n = { ...t, events: [...t.events, name] as EventName[] };
    return {
      ...n,
      messages: [...n.messages, reportMessage(n)],
      log: addLog(n, "Company Brain", "Market report EV-07 arrived. Proposed PR-01, PR-02, PR-03 and action AZ-01.", ["EV-07", "PR-01", "PR-02", "PR-03", "AZ-01"]),
    };
  }
  // correction: supersede EV-07, flag everything that rested on it
  const t = { ...s, clock: Math.max(s.clock + 1, M(11, 48)) };
  const n: State = { ...t, events: [...t.events, name] as EventName[], nodes: { ...t.nodes } };
  n.nodes["EV-07"] = { ...n.nodes["EV-07"], status: "superseded", replacedBy: "EV-08", reason: "Superseded by correction EV-08" };
  const flagged: string[] = [];
  for (const id of dependents("EV-07")) {
    const st = n.nodes[id];
    if (st.status === "proposed" || st.status === "approved") {
      n.nodes[id] = { ...st, status: "to_review", reason: "The evidence it rested on was superseded by EV-08." };
      flagged.push(id);
    }
  }
  for (const id of NODE_IDS) {
    const old = NODES[id].replaces;
    if (old && n.nodes[old].status !== "registered") n.nodes[old] = { ...n.nodes[old], replacedBy: id };
  }
  return {
    ...n,
    messages: [...n.messages, correctionMessage(n)],
    log: addLog(n, "Company Brain", `Correction EV-08 arrived, superseding EV-07. Flagged ${flagged.join(", ")} as to review; proposed PR-04, PR-05 and AZ-02.`, ["EV-08", "EV-07", ...flagged, "PR-04", "PR-05", "AZ-02"]),
  };
}

export function reduce(state: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return initialState();
    case "setRole":
      return { ...state, role: a.role };
    case "dismissNotice":
      return { ...state, notice: null };
    case "visit":
      return state.visited.includes(a.slug) ? state : { ...state, visited: [...state.visited, a.slug] };
    case "event":
      return fireEvent(state, a.name);
    case "ask": {
      const entry = { id: state.seq, role: a.role, q: a.q, at: fmtClock(state.clock), result: answer(state, a.role, a.q) };
      return tick({ ...state, chat: [...state.chat, entry], seq: state.seq + 1 });
    }
    case "ask_split": {
      const entry = { id: state.seq, q: a.q, at: fmtClock(state.clock), finance: answer(state, "finance", a.q), production: answer(state, "production", a.q) };
      return tick({ ...state, split: [...state.split, entry], seq: state.seq + 1 });
    }
    case "review":
      return review(state, a.id, a.decision, a.by);
  }
}

function review(s: State, id: string, decision: "approve" | "reject", by: RoleId): State {
  const def = NODES[id];
  const st = s.nodes[id];
  const role = ROLES[by];
  if (!def || !st || !isArrived(s, id)) return s;
  if (!role.curator) return { ...s, notice: `${role.name} (${role.title}) can't curate the memory. Only Procurement approves and rejects.` };
  if (!["conclusion", "hypothesis", "action"].includes(def.kind) || st.status !== "proposed")
    return { ...s, notice: `${id} is ${STATUS_LABEL[st.status]}; only open proposals can be reviewed.` };

  if (decision === "approve") {
    const blockers = def.basedOn.filter((b) => (NODES[b].kind === "evidence" ? s.nodes[b].status === "superseded" : s.nodes[b].status !== "approved"));
    if (blockers.length)
      return { ...s, notice: `${id} can't be approved yet: ${blockers.join(" and ")} must be approved first.` };
  }

  const n = tick({ ...s, nodes: { ...s.nodes }, notice: null });
  n.nodes[id] = { ...st, status: decision === "approve" ? "approved" : "rejected", by: role.name, at: fmtClock(s.clock) };
  n.log = addLog(n, role.name, `${decision === "approve" ? "Approved" : "Rejected"} ${id}: ${def.short}.`, [id]);
  if (decision === "approve" && def.kind === "action") {
    n.orders = [...n.orders, { id: "PO-9120", tonnes: 3000, supplier: "Alta Murgia Mill", price: 470, fromAction: id, at: fmtClock(s.clock) }];
    n.log = addLog(n, "ERP", `Purchase order PO-9120 created from ${id}: 3,000 t at 470 €/t.`, [id]);
  }
  return n;
}

// ------------------------------------------------------------------ answering

const cites = (role: RoleId, id: string) => evidenceRoots(id).filter((e) => canSee(role, e));

const unknown = (note?: string): AskResult => ({ kind: "unknown", text: "I don't know.", note, citations: [] });
/**
 * Missing, not yet arrived and not visible to the asker all give this exact answer. The agent of a
 * person only knows what that person may know, so it never confirms that something they can't see exists.
 */
const nothing = (): AskResult => unknown("There is no evidence about this.");

type Intent = "inject" | "why" | "approve_it" | "foreign" | "canada" | "contract" | "stock" | "cost" | "price" | "other";

export function intent(q: string): Intent {
  if (/ignore (all |the |your )?(previous|prior|above) (instructions|rules)|reveal (your )?(system )?prompt|show (me )?all (the )?evidence/i.test(q)) return "inject";
  if (/\bwhy\b.*\b(buy|bought|purchase|purchased|order|ordered)\b/i.test(q)) return "why";
  if (/\b(approve|authori[sz]e|place|confirm)\b.*\b(purchase|order|buy|action|it)\b|\bbuy (it|them) for me\b/i.test(q)) return "approve_it";
  if (/turkey|china|egypt|india|russia|ukraine/i.test(q)) return "foreign";
  if (/canad|harvest/i.test(q)) return "canada";
  if (/framework|contract/i.test(q)) return "contract";
  if (/\bstock\b|days of cover|\bcoverage\b/i.test(q)) return "stock";
  if (/\bcosts?\b/i.test(q) && /(rise|risen|increase|more|extra|uncovered|price)/i.test(q)) return "cost";
  if (/\bprices?\b|semolina.*(up|risen|rise|increase)/i.test(q)) return "price";
  return "other";
}

/** Look up the newest approved memory among `ids`; otherwise say why there is none. */
function fromMemory(s: State, role: RoleId, ids: string[]): AskResult {
  const arrived = ids.filter((id) => isArrived(s, id));
  const visible = arrived.filter((id) => canSee(role, id));
  if (visible.length === 0) return nothing();

  const ok = visible.find((id) => s.nodes[id].status === "approved");
  if (ok) {
    const st = s.nodes[ok];
    return {
      kind: "answer",
      text: NODES[ok].text + (ok === "MEM-04" ? " (as of 20/11)" : ""),
      citations: cites(role, ok),
      approvedBy: st.by,
      approvedAt: st.at,
    };
  }
  const statuses = visible.map((id) => s.nodes[id].status);
  const proposed = statuses.includes("proposed");
  const review = statuses.includes("to_review");
  if (proposed && review) return unknown("The earlier conclusion is under review because its evidence was superseded. An updated version is awaiting approval.");
  if (proposed) return unknown("A proposal is awaiting validation.");
  if (review) return unknown("The earlier conclusion is under review because its evidence was superseded.");
  const rej = visible.find((id) => s.nodes[id].status === "rejected");
  if (rej) return unknown(`Hypothesis rejected by ${s.nodes[rej].by}. The evidence stays on record.`);
  return unknown();
}

function whyBought(s: State, role: RoleId): AskResult {
  const ids = ["AZ-02", "AZ-01"];
  const arrived = ids.filter((id) => isArrived(s, id));
  const visible = arrived.filter((id) => canSee(role, id));
  if (visible.length === 0) return nothing();
  const done = visible.find((id) => s.nodes[id].status === "approved");
  if (!done) return unknown("No purchase has been made yet. An action is awaiting approval.");
  const st = s.nodes[done];
  return {
    kind: "answer",
    text: `Because ${st.by} approved ${done} at ${st.at}: bring forward 3,000 t from Alta Murgia Mill at 470 €/t. ${done === "AZ-02" ? "It saves about €24,000 against spot" : "It saves about €96,000 against spot"} and lifts Parma stock cover from 9 to about 31 days.`,
    citations: cites(role, done),
    approvedBy: st.by,
    approvedAt: st.at,
    chainFor: done,
  };
}

/** The mock agent. Only ever answers from approved memory the asker may see. */
export function answer(s: State, role: RoleId, q: string): AskResult {
  switch (intent(q)) {
    case "inject":
      return unknown("I only answer from approved, cited memory.");
    case "approve_it":
      return { kind: "refusal", text: "I can't do that.", note: "I only propose actions. A person with the right authority has to approve them.", citations: [] };
    case "why":
      return whyBought(s, role);
    case "foreign":
      return nothing();
    case "canada":
      return fromMemory(s, role, ["PR-03"]);
    case "contract":
      return fromMemory(s, role, ["MEM-02"]);
    case "stock":
      return fromMemory(s, role, ["MEM-04"]);
    case "cost":
      return fromMemory(s, role, ["PR-05", "PR-02"]);
    case "price":
      return fromMemory(s, role, ["PR-04", "PR-01"]);
    default:
      return unknown();
  }
}

// ------------------------------------------------------------------ the seven checks

export const CHECKS = [
  { n: 1, label: "Speaks first" },
  { n: 2, label: "People curate" },
  { n: 3, label: "Knows who's asking" },
  { n: 4, label: "Cites" },
  { n: 5, label: "Admits gaps" },
  { n: 6, label: "Only proposes" },
  { n: 7, label: "Fits the day" },
] as const;

/** Which of the seven jury checks the demo has shown so far. Lit by doing, not by visiting. */
export function checks(s: State): Record<number, boolean> {
  const results = [...s.chat.map((c) => c.result), ...s.split.flatMap((e) => [e.finance, e.production])];
  // Curation is read from the history, not from current statuses: a correction can later move an
  // approved item to "to review", but the jury already saw a person approve one and reject another.
  const people = s.log.filter((e) => e.actor !== "Company Brain" && e.actor !== "ERP");
  return {
    1: s.events.includes("report"),
    2: people.some((e) => e.text.startsWith("Approved")) && people.some((e) => e.text.startsWith("Rejected")),
    3: s.split.some((e) => e.finance.kind === "answer" && e.production.kind === "unknown"),
    4: results.some((r) => r.kind === "answer" && r.citations.length > 0),
    5: results.some((r) => r.kind === "unknown"),
    6: s.orders.length > 0,
    7: s.visited.includes("channel"),
  };
}
