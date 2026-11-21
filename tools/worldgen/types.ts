/** Types of the simulated-world generator. See tools/worldgen/README.md. */

export type Reliability = "high" | "low";

export interface Person {
  key: string;
  name: string;
  email: string;
  role: string;
}

/** What the writer (AI or example-based) must produce for a piece, and how it is checked. */
export interface WritingSpec {
  /** Instructions for the AI writer: what the body must say, tone, length. */
  brief: string;
  /** Optional reference body. Shows register and length; used by the example writer. */
  example?: string;
  /** Literals that must appear verbatim in the body (case-insensitive). Rendered from the facts ledger. */
  mustContain: string[];
  /** Numbers allowed in the body besides those found in `mustContain`. */
  allowNumbers?: string[];
  /** Dates allowed in the body besides those found in `mustContain`. */
  allowDates?: string[];
  /** Literals that must never appear (extra, besides the world's derived values). */
  forbid?: string[];
}

/** Who writes a piece, as the writer sees them: a persona that only knows what that person would know. */
export interface AuthorInfo {
  name: string;
  role: string;
  /** How this person writes: tone, habits, level of detail. */
  persona?: string;
  /** Facts the author already knows from their own earlier messages and documents. */
  knows: string[];
}

interface PieceBase extends WritingSpec {
  /** Id of the tier (moment of the story) the piece belongs to. */
  tier: string;
  /** Short name used in the file name. */
  slug: string;
  /** The person who writes it, when it has one. */
  author?: AuthorInfo;
}

export interface EmailPiece extends PieceBase {
  kind: "email";
  /** Append the parent message as a `>` quote (needs `in_reply_to`). */
  quoteParent?: boolean;
  header: {
    message_id: string;
    date: string;
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    thread_id?: string;
    in_reply_to?: string;
    labels?: string[];
    reliability?: Reliability;
  };
}

export interface NewsPiece extends PieceBase {
  kind: "news";
  header: {
    article_id: string;
    domain: string;
    date: string;
    title: string;
    url?: string;
    author?: string;
    language?: string;
    corrects?: string;
    labels?: string[];
    reliability?: Reliability;
  };
}

export interface DocPiece extends PieceBase {
  kind: "doc";
  header: {
    doc_id: string;
    doc_type: string;
    title: string;
    date: string;
    author?: string;
    reference?: string;
    parties?: string[];
    version?: string;
    supersedes?: string;
    origin?: string;
    language?: string;
    labels?: string[];
    reliability?: Reliability;
  };
}

export type Piece = EmailPiece | NewsPiece | DocPiece;
export type PieceKind = Piece["kind"];

/** The compiled world: what the generation engine works on. */
export interface World {
  slug: string;
  title: string;
  company: string;
  /** What the company does: used in the writer's prompt. */
  description: string;
  /** BCP 47 language of the texts, e.g. `it`. */
  language: string;
  today: string;
  /** Tier ids in time order. */
  tiers: string[];
  people: Person[];
  /** Words that must never appear in any generated text (case-sensitive): wrong spellings, real brands. */
  banned: string[];
  /** Literals of derived values: the system must compute them, they never appear in a source. */
  forbidden: string[];
  pieces: Piece[];
}

/** What the writer knows about the world, besides the piece. */
export interface WorldStyle {
  company: string;
  description: string;
  language: string;
}

/** The unit the writer sees. */
export interface Brief {
  pieceId: string;
  kind: PieceKind;
  /** Header fields the writer may rely on (sender, recipients, dates, title...). */
  context: Record<string, unknown>;
  brief: string;
  mustContain: string[];
  /** A reference body: shows register and length, not meant to be copied word for word. */
  example?: string;
  /** Previous failure messages, when this is a repair attempt. */
  feedback?: string[];
  style: WorldStyle;
  /** The person writing: the writer plays them. */
  author?: AuthorInfo;
  /** For a reply: the message being answered. */
  parent?: { from: string; date: string; text: string };
}

export interface Writer {
  write(brief: Brief): Promise<string>;
}

export const pieceId = (p: Piece): string =>
  p.kind === "email" ? p.header.message_id : p.kind === "news" ? p.header.article_id : p.header.doc_id;

/** Folder used for a kind under <world>/<tier>/ */
export const KIND_DIR: Record<PieceKind, string> = { email: "emails", news: "news", doc: "docs" };
export const KINDS = Object.keys(KIND_DIR) as PieceKind[];
