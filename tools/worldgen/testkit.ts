import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compile, type Compiled } from "./compile";
import type { Llm, LlmRequest } from "./llm";
import { parseSpec, type ScenarioSpec } from "./spec";
import { pieceId } from "./types";

/** Shared helpers for the tests. Not matched by the test glob. */

export const FIXTURES = ["semola", "supplier-delay"] as const;
export type FixtureName = (typeof FIXTURES)[number];

export const fixtureJson = (name: FixtureName): unknown => JSON.parse(readFileSync(join(__dirname, "fixtures", `${name}.json`), "utf8"));

export function fixtureSpec(name: FixtureName): ScenarioSpec {
  const r = parseSpec(fixtureJson(name));
  if (!r.ok) throw new Error(`fixture ${name} is invalid:\n${r.errors.join("\n")}`);
  return r.spec;
}
export const fixtureCompiled = (name: FixtureName): Compiled => compile(fixtureSpec(name));
export const clone = <T>(x: T): T => structuredClone(x);

/** Id of the piece a writer prompt is about, read from its context lines. */
export const pieceIdInPrompt = (user: string): string | undefined => /^- (?:message_id|article_id|doc_id): (.+)$/m.exec(user)?.[1];

/**
 * A fake model for the piece writer: answers with the `example` of the piece named in the prompt.
 * `failFirstFor` makes the first answer for that piece useless, to exercise the repair loop.
 */
export function fakeWriterLlm(c: Compiled, opts: { failFirstFor?: string; delayMs?: number } = {}): { llm: Llm; calls: LlmRequest[] } {
  const calls: LlmRequest[] = [];
  const failed = new Set<string>();
  const llm: Llm = {
    async complete(req) {
      calls.push(req);
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
      const id = pieceIdInPrompt(req.user);
      const example = c.world.pieces.find((p) => pieceId(p) === id)?.example;
      if (!id || !example) throw new Error(`fake model: no example for ${id}`);
      if (opts.failFirstFor === id && !failed.has(id)) {
        failed.add(id);
        return "Un testo senza i fatti richiesti.";
      }
      return example;
    },
  };
  return { llm, calls };
}
