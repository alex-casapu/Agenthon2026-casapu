import { defaultLlm, llmModel } from "../llm";
import { getDb } from "../store";
import { considerClaims, proactiveEnabled } from ".";

/**
 * Runs the proactive pass one source at a time, off the extraction path, so a slow or failing model
 * call never holds up ingestion. Survives dev hot reloads; never throws into the caller.
 */
export function enqueueProactive(sourceId: string, claimIds: string[]): void {
  if (!proactiveEnabled() || claimIds.length === 0) return;
  const g = globalThis as unknown as { __brainProactive?: Promise<void> };
  g.__brainProactive = (g.__brainProactive ?? Promise.resolve()).then(async () => {
    try {
      const s = await considerClaims(getDb(), sourceId, claimIds, { llm: defaultLlm(), model: llmModel() });
      console.log(`[proactive] ${sourceId.slice(0, 8)}: told ${s.notified.length}, skipped ${s.skipped.length}${s.failed.length ? `, failed ${s.failed.join(",")}` : ""}`);
    } catch (e) {
      console.error("[proactive] crashed:", e);
    }
  });
}
