import { pieceId, type Brief, type Piece, type Writer } from "./types";

/**
 * Deterministic writer: returns the `example` body of each piece. Needs no model; used for tests,
 * offline runs and hand-written scenarios. The AI writer implements the same interface.
 */
export class ExampleWriter implements Writer {
  private readonly byId: Map<string, Piece>;
  constructor(pieces: Piece[]) {
    this.byId = new Map(pieces.map((p) => [pieceId(p), p]));
  }
  async write(brief: Brief): Promise<string> {
    const piece = this.byId.get(brief.pieceId);
    if (!piece) throw new Error(`ExampleWriter: unknown piece ${brief.pieceId}`);
    if (piece.example === undefined) throw new Error(`ExampleWriter: ${brief.pieceId} has no example body`);
    return piece.example;
  }
}
