import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, sha256 } from "../hash";
import type { Llm, LlmRequest, LlmResponse } from "./types";

/**
 * auto   : use a recorded response if there is one, otherwise call and record.
 * live   : always call (and record), ignoring recordings.
 * replay : only recorded responses; a miss is an error. For offline, deterministic demos.
 */
export type LlmMode = "auto" | "live" | "replay";

export class LlmCacheMiss extends Error {}

export const cacheKey = (req: LlmRequest): string => sha256(canonicalJson({ model: req.model, system: req.system, prompt: req.prompt, schema: req.schema ?? null }));

export function cached(inner: Llm, opts: { dir: string; mode?: LlmMode }): Llm {
  const mode = opts.mode ?? "auto";
  return async (req) => {
    const key = cacheKey(req);
    const file = join(opts.dir, `${key}.json`);
    if (mode !== "live" && existsSync(file)) return (JSON.parse(readFileSync(file, "utf8")) as { response: LlmResponse }).response;
    if (mode === "replay") throw new LlmCacheMiss(`no recorded LLM response for ${key.slice(0, 12)} (replay mode)`);
    const response = await inner(req);
    mkdirSync(opts.dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ model: req.model, recorded_at: new Date().toISOString(), prompt_preview: req.prompt.slice(0, 200), response }, null, 2));
    return response;
  };
}
