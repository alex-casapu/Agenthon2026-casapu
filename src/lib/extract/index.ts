import { defaultLlm, llmModel } from "../llm";
import { trustByDefault } from "../policy-config";
import { enqueueProactive } from "../proactive/queue";
import { getDb } from "../store";
import { createExtractionQueue, type ExtractionQueue } from "./queue";

export { extractSource, parseClaims, type ExtractOptions, type ExtractSummary } from "./extract";
export { createExtractionQueue, type ExtractionQueue, type QueueStats } from "./queue";
export { EXTRACTOR_VERSION } from "./prompt";

/** BRAIN_EXTRACT=off disables automatic extraction (e.g. to save subscription quota while developing). */
export const extractionEnabled = (): boolean => process.env.BRAIN_EXTRACT !== "off";

/** The process-wide queue (survives Next.js dev hot reloads). */
export function getExtractionQueue(): ExtractionQueue {
  const g = globalThis as unknown as { __brainExtractQueue?: ExtractionQueue };
  g.__brainExtractQueue ??= createExtractionQueue(getDb(), {
    // `trust` is read for every extraction, so BRAIN_TRUST can change without a restart
    extract: { llm: defaultLlm(), model: llmModel(), get trust() { return trustByDefault(); } },
    concurrency: Number(process.env.BRAIN_EXTRACT_CONCURRENCY ?? 1),
    onResult: (s) => {
      // new, usable claims are offered to the people who may see them (see lib/proactive)
      if (trustByDefault()) enqueueProactive(s.source_id, s.claim_ids);
      console.log(`[extract] ${s.source_id.slice(0, 8)} ${s.status}: +${s.proposed} new, ${s.duplicates} dup, ${s.rejected} rejected, +${s.entities_created} entities, ${s.rounds} call(s)${s.error ? ` — ${s.error}` : ""}`);
    },
  });
  return g.__brainExtractQueue;
}

/** Queue a freshly ingested source, unless extraction is switched off. */
export function enqueueExtraction(sourceId: string): void {
  if (extractionEnabled()) getExtractionQueue().enqueue(sourceId);
}
