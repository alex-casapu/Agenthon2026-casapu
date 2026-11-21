// Runs once when the Next server starts: watch every source folder, and extract claims from what arrives.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __brainWatcher?: unknown };
  if (g.__brainWatcher) return; // survive dev hot reloads
  const { getDb } = await import("@/lib/store");
  const { KINDS, SOURCE_KINDS } = await import("@/lib/ingest/inbox");
  const { startInboxWatcher } = await import("@/lib/ingest/watcher");
  const { enqueueExtraction, extractionEnabled, getExtractionQueue } = await import("@/lib/extract");
  const db = getDb();
  g.__brainWatcher = SOURCE_KINDS.map((kind) => {
    const dir = KINDS[kind].dir();
    console.log(`[${kind}] watching ${dir}`);
    return startInboxWatcher(db, dir, { kind, onIngested: (o) => o.source_id && enqueueExtraction(o.source_id) });
  });
  if (extractionEnabled()) {
    const n = getExtractionQueue().catchUp();
    console.log(`[extract] on; ${n} source(s) waiting for extraction`);
  } else console.log("[extract] off (BRAIN_EXTRACT=off)");
}
