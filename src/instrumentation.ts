// Runs once when the Next server starts: begin watching every source folder.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __brainWatcher?: unknown };
  if (g.__brainWatcher) return; // survive dev hot reloads
  const { getDb } = await import("@/lib/store");
  const { KINDS, SOURCE_KINDS } = await import("@/lib/ingest/inbox");
  const { startInboxWatcher } = await import("@/lib/ingest/watcher");
  const db = getDb();
  g.__brainWatcher = SOURCE_KINDS.map((kind) => {
    const dir = KINDS[kind].dir();
    console.log(`[${kind}] watching ${dir}`);
    return startInboxWatcher(db, dir, { kind });
  });
}
