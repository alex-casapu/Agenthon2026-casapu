import { join } from "node:path";
import { cached, type LlmMode } from "./cache";
import { claudeCli } from "./cli";
import type { Llm } from "./types";

export * from "./types";
export { cached, cacheKey, LlmCacheMiss, type LlmMode } from "./cache";
export { claudeCli, cliArgs, type Runner } from "./cli";

export const llmModel = (): string => process.env.BRAIN_LLM_MODEL ?? "sonnet";
export const llmMode = (): LlmMode => {
  const m = process.env.BRAIN_LLM_MODE;
  return m === "live" || m === "replay" ? m : "auto";
};

/** The app's LLM: Claude CLI behind a record/replay cache (data/llm-cache). */
export function defaultLlm(): Llm {
  return cached(claudeCli(), { dir: process.env.BRAIN_LLM_CACHE ?? join(process.cwd(), "data", "llm-cache"), mode: llmMode() });
}
