import { checkBody, checkParse, checkWorld } from "./check";
import { composeBody, parentInfoFrom, relPath, renderFile, type ParentInfo } from "./render";
import { pieceId, type Brief, type Piece, type World, type Writer } from "./types";

export interface Generated {
  piece: Piece;
  id: string;
  /** What the writer produced (without the deterministic quote). */
  written: string;
  /** Final body, as in the file. */
  body: string;
  /** The full file content. */
  text: string;
  /** Path inside the world folder, e.g. `t0/emails/20261110-0915-richiesta.md`. */
  path: string;
  attempts: number;
}

export interface GenerateOptions {
  writer: Writer;
  /** Writer attempts per piece, feedback included. Default 3. */
  maxAttempts?: number;
  /** Pieces written at the same time (a reply waits for its parent). Default 1. */
  concurrency?: number;
  /** Called after every attempt, with the check errors (empty when the piece is accepted). */
  onAttempt?: (id: string, attempt: number, errors: string[]) => void;
}

export class GenerationError extends Error {
  constructor(public readonly pieceId: string, public readonly errors: string[]) {
    super(`${pieceId}: ${errors.join("; ")}`);
  }
}

/** What the writer is allowed to know about a piece: the header facts, not its labels or reliability. */
function briefFor(world: World, piece: Piece, parent: ParentInfo | undefined, feedback?: string[]): Brief {
  const context: Record<string, unknown> = { ...piece.header };
  delete context.labels;
  delete context.reliability;
  return {
    pieceId: pieceId(piece),
    kind: piece.kind,
    context,
    brief: piece.brief,
    mustContain: piece.mustContain,
    example: piece.example,
    feedback,
    style: { company: world.company, description: world.description, language: world.language },
    author: piece.author,
    parent: parent ? { from: parent.fromName, date: parent.date, text: parent.written } : undefined,
  };
}

/** Generates every piece: write, check, repair with feedback, then check the world as a whole. */
export async function generateWorld(world: World, opts: GenerateOptions): Promise<Generated[]> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const done = new Map<string, Generated>();
  const pending = [...world.pieces];
  const inFlight = new Set<Promise<void>>();
  let failure: unknown;

  const isReady = (p: Piece) => p.kind !== "email" || !p.header.in_reply_to || done.has(p.header.in_reply_to);

  const run = async (piece: Piece): Promise<void> => {
    const id = pieceId(piece);
    let parent: ParentInfo | undefined;
    if (piece.kind === "email" && piece.header.in_reply_to) {
      const p = done.get(piece.header.in_reply_to)!;
      parent = parentInfoFrom(p.piece, p.written);
    }
    let feedback: string[] | undefined;
    for (let attempt = 1; ; attempt++) {
      const written = await opts.writer.write(briefFor(world, piece, parent, feedback));
      const body = composeBody(piece, written, parent, world.language);
      const text = renderFile(piece, body);
      const errors = [...checkBody(piece, body, { forbidden: world.forbidden, banned: world.banned, lang: world.language }), ...checkParse(piece, text)];
      opts.onAttempt?.(id, attempt, errors);
      if (errors.length === 0) {
        done.set(id, { piece, id, written, body, text, path: relPath(piece), attempts: attempt });
        return;
      }
      if (attempt >= maxAttempts) throw new GenerationError(id, errors);
      feedback = errors;
    }
  };

  while (!failure && (pending.length || inFlight.size)) {
    for (let i = 0; i < pending.length && inFlight.size < concurrency; ) {
      if (!isReady(pending[i])) {
        i++;
        continue;
      }
      const piece = pending.splice(i, 1)[0];
      const pr: Promise<void> = run(piece)
        .catch((e) => {
          failure ??= e;
        })
        .finally(() => inFlight.delete(pr));
      inFlight.add(pr);
    }
    if (inFlight.size === 0) {
      if (pending.length) throw new Error("replies with an unknown or circular parent");
      break;
    }
    await Promise.race(inFlight);
  }
  await Promise.all(inFlight);
  if (failure) throw failure;

  const worldErrors = checkWorld(world.pieces, world.tiers);
  if (worldErrors.length) throw new GenerationError("world", worldErrors);
  return world.pieces.map((p) => done.get(pieceId(p))!);
}
