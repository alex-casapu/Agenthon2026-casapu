/** Mock scenario engine for the presentation UI. Pure data and logic, no React. */

export type RoleId = "procurement" | "finance" | "production";
export type Label = "public" | "finance";
export type Kind = "evidence" | "memory" | "conclusion" | "hypothesis" | "action";
export type Status = "registered" | "approved" | "proposed" | "rejected" | "to_review" | "superseded";
export type Arrives = "start" | "report" | "correction";

export interface Role {
  id: RoleId;
  name: string;
  title: string;
  curator: boolean;
  /** Labels this role can read directly. Procurement reads everything. */
  reads: Label[];
}

export interface SourceDoc {
  /** e.g. "Grain Market Report" */
  name: string;
  /** e.g. "21 Nov 2026" */
  date: string;
  kind: "report" | "contract" | "email" | "export" | "plan";
  text: string;
  /** Verbatim passages of `text` that the evidence rests on. */
  quotes: string[];
}

export interface NodeDef {
  id: string;
  kind: Kind;
  /** Full statement shown on cards. */
  text: string;
  /** A few words for graph nodes. */
  short: string;
  basedOn: string[];
  arrives: Arrives;
  initial: Status;
  /** Evidence only. */
  label?: Label;
  reliability?: "high" | "low";
  source?: SourceDoc;
  /** The older node this one replaces. */
  replaces?: string;
  /** Mock gate results shown as chips on proposals. */
  verify?: { ok: boolean; text: string }[];
}

export interface NodeState {
  status: Status;
  by?: string;
  at?: string;
  reason?: string;
  replacedBy?: string;
}

export interface Message {
  id: string;
  at: string;
  channel: string;
  title: string;
  lead: string;
  bullets: { text: string; ref?: string }[];
  action?: { text: string; ref: string };
  footer: string[];
  correction?: boolean;
}

export type AskKind = "answer" | "unknown" | "unauthorized" | "refusal";

export interface AskResult {
  kind: AskKind;
  text: string;
  note?: string;
  /** Evidence ids the answer rests on. */
  citations: string[];
  approvedBy?: string;
  approvedAt?: string;
  /** Set when the question is about a decision: link target for the full chain. */
  chainFor?: string;
}

export interface ChatEntry {
  id: number;
  role: RoleId;
  q: string;
  at: string;
  result: AskResult;
}

export interface SplitEntry {
  id: number;
  q: string;
  at: string;
  finance: AskResult;
  production: AskResult;
}

export interface Order {
  id: string;
  tonnes: number;
  supplier: string;
  price: number;
  fromAction: string;
  at: string;
}

export interface LogEntry {
  at: string;
  actor: string;
  text: string;
  /** Node ids this entry concerns. */
  refs: string[];
}

export type EventName = "report" | "correction";

export interface State {
  nodes: Record<string, NodeState>;
  events: EventName[];
  messages: Message[];
  orders: Order[];
  role: RoleId;
  chat: ChatEntry[];
  split: SplitEntry[];
  visited: string[];
  log: LogEntry[];
  /** Minutes since midnight on the simulated day. */
  clock: number;
  notice: string | null;
  seq: number;
}

export type Action =
  | { type: "event"; name: EventName }
  | { type: "review"; id: string; decision: "approve" | "reject"; by: RoleId }
  | { type: "ask"; q: string; role: RoleId }
  | { type: "ask_split"; q: string }
  | { type: "setRole"; role: RoleId }
  | { type: "visit"; slug: string }
  | { type: "dismissNotice" }
  | { type: "reset" };
