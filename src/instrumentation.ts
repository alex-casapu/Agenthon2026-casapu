// Runs once when the Next server starts: begin watching the email inbox.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as unknown as { __brainWatcher?: unknown };
  if (g.__brainWatcher) return; // survive dev hot reloads
  const { getDb } = await import("@/lib/store");
  const { inboxDir } = await import("@/lib/ingest/inbox");
  const { startInboxWatcher } = await import("@/lib/ingest/watcher");
  g.__brainWatcher = startInboxWatcher(getDb(), inboxDir());
  console.log(`[inbox] watching ${inboxDir()}`);
}
