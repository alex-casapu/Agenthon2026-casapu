import { z } from "zod";

/**
 * The scenario spec: everything the generator needs, as pure data (JSON).
 * A planner (AI) writes it from a free-text scenario; a person can edit it; the engine reads it.
 * Facts are written once, in a ledger; pieces refer to them by id.
 */

const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase letters, digits and hyphens");
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, "letters, digits, . _ -  (no spaces)");
const ident = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "identifier: letters, digits, underscore");
const label = z.string().regex(/^[a-z0-9_-]+$/, "label: a-z 0-9 _ -");
const when = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(Z|[+-]\d{2}:\d{2}))?$/, "ISO date, or datetime with a timezone offset");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const reliability = z.enum(["high", "low"]);
const labels = z.array(label);

const Person = z
  .object({
    key: ident,
    name: z.string().min(1),
    /** Must end in `.example`. */
    email: z.string().regex(/^[^\s@]+@[^\s@]+\.example$/, "address ending in .example"),
    role: z.string().min(1),
    /**
     * The access role this person acts as in the system (a key of `roles`). Internal staff who use the
     * system have one, exactly one per role; outside people (suppliers, journalists) have none.
     */
    access: ident.optional(),
    /** How this person writes: tone, habits, level of detail. The writer plays this person. */
    persona: z.string().optional(),
  })
  .strict();

const Fact = z
  .object({
    id: ident,
    /** The literal exactly as it appears in the sources, in the language of the world (e.g. "412 €/t"). */
    text: z.string().min(1),
    /** Numeric value, when formulas use it. */
    value: z.number().optional(),
  })
  .strict();

const Derived = z
  .object({
    id: ident,
    label: z.string().min(1),
    /** Over fact ids (with a value) and other derived ids. + - * / ^ ( ) round floor ceil abs min max */
    formula: z.string().min(1),
    decimals: z.number().int().min(0).max(4).default(0),
    unit: z.string().optional(),
  })
  .strict();

const pieceBase = {
  tier: ident,
  slug,
  /** Ids of the facts this piece states. */
  facts: z.array(ident).default([]),
  brief: z.string().min(10),
  example: z.string().optional(),
  allowNumbers: z.array(z.string()).optional(),
  allowDates: z.array(z.string()).optional(),
};

const EmailPiece = z
  .object({
    ...pieceBase,
    kind: z.literal("email"),
    quoteParent: z.boolean().optional(),
    header: z
      .object({
        message_id: id,
        date: when,
        /** Person keys. */
        from: ident,
        to: z.array(ident).min(1),
        cc: z.array(ident).optional(),
        subject: z.string().min(1),
        thread_id: id.optional(),
        in_reply_to: id.optional(),
        labels: labels.optional(),
        reliability: reliability.optional(),
      })
      .strict(),
  })
  .strict();

const NewsPiece = z
  .object({
    ...pieceBase,
    kind: z.literal("news"),
    header: z
      .object({
        article_id: id,
        /** Bare hostname ending in .example. */
        domain: z.string().regex(/^[a-z0-9.-]+\.example$/, "hostname ending in .example"),
        date: when,
        title: z.string().min(1),
        url: z.string().optional(),
        author: z.string().optional(),
        corrects: id.optional(),
        labels: labels.optional(),
        reliability: reliability.optional(),
      })
      .strict(),
  })
  .strict();

const DocPiece = z
  .object({
    ...pieceBase,
    kind: z.literal("doc"),
    header: z
      .object({
        doc_id: id,
        doc_type: z.string().regex(/^[a-z0-9_-]+$/),
        title: z.string().min(1),
        date: when,
        /** A person's name, when the document has a human author. */
        author: z.string().optional(),
        reference: z.string().optional(),
        parties: z.array(z.string()).optional(),
        version: z.string().optional(),
        supersedes: id.optional(),
        origin: z.string().optional(),
        labels: labels.optional(),
        reliability: reliability.optional(),
      })
      .strict(),
  })
  .strict();

const Question = z
  .object({
    id: id,
    when: z.string().min(1),
    role: ident,
    question: z.string().min(1),
    /** answer: a cited answer; unknown: "I don't know"; denied: "not authorized". */
    expect: z.enum(["answer", "unknown", "denied"]),
    /** Values the answer must contain: `fact:<id>` or `derived:<id>`, or a literal. */
    include: z.array(z.string()).optional(),
    /** Piece ids (message_id, article_id, doc_id) the answer must cite. */
    cites: z.array(z.string()).optional(),
    note: z.string().optional(),
  })
  .strict();

const Adversarial = z
  .object({
    role: ident,
    question: z.string().min(1),
    expect: z.enum(["answer", "unknown", "denied", "refuse"]),
    note: z.string().optional(),
  })
  .strict();

export const Spec = z
  .object({
    slug,
    title: z.string().min(1),
    /** The scenario in a few lines. */
    description: z.string().min(1),
    /** BCP 47 language of the texts, e.g. `it`. */
    language: z.string().regex(/^[a-z]{2}(-[A-Za-z]{2})?$/),
    company: z
      .object({
        name: z.string().min(1),
        /** Bare hostname ending in .example. */
        domain: z.string().regex(/^[a-z0-9.-]+\.example$/),
        /** What the company does, one line. */
        description: z.string().min(1),
      })
      .strict(),
    today: day,
    /** Moments of the story, in time order. */
    tiers: z.array(z.object({ id: ident, label: z.string().min(1) }).strict()).min(1),
    /** Which labels each role may see. The label `public` is visible to everyone. */
    roles: z.record(ident, z.object({ sees: labels, curator: z.boolean().optional() }).strict()),
    people: z.array(Person).min(1),
    facts: z.array(Fact).min(1),
    derived: z.array(Derived).default([]),
    banned: z.array(z.string()).default([]),
    pieces: z.array(z.discriminatedUnion("kind", [EmailPiece, NewsPiece, DocPiece])).min(1),
    questions: z.array(Question).min(1),
    adversarial: z.array(Adversarial).default([]),
  })
  .strict();

export type ScenarioSpec = z.infer<typeof Spec>;
export type SpecPiece = ScenarioSpec["pieces"][number];
export type SpecQuestion = ScenarioSpec["questions"][number];

export type SpecResult = { ok: true; spec: ScenarioSpec } | { ok: false; errors: string[] };

/** Validates a parsed JSON value against the schema, with readable messages. */
export function parseSpec(value: unknown): SpecResult {
  const r = Spec.safeParse(value);
  if (r.success) return { ok: true, spec: r.data };
  return {
    ok: false,
    errors: r.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}
