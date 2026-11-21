import { defaultLlm, llmModel } from "../llm";
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
    extract: { llm: defaultLlm(), model: llmModel() },
    concurrency: Number(process.env.BRAIN_EXTRACT_CONCURRENCY ?? 2),
    onResult: (s) =>
      console.log(`[extract] ${s.source_id.slice(0, 8)} ${s.status}: +${s.proposed} proposed, ${s.duplicates} dup, ${s.rejected} rejected, ${s.rounds} call(s)${s.error ? ` — ${s.error}` : ""}`),
  });
  return g.__brainExtractQueue;
}

/** Queue a freshly ingested source, unless extraction is switched off. */
export function enqueueExtraction(sourceId: string): void {
  if (extractionEnabled()) getExtractionQueue().enqueue(sourceId);
}
