import { enqueueExtraction } from "@/lib/extract";
import { KINDS, SOURCE_KINDS, scanInbox } from "@/lib/ingest/inbox";
import { getDb } from "@/lib/store";

/** Ingest anything new in every source folder right now (the watchers do this automatically). */
export async function POST() {
  const db = getDb();
  const results = SOURCE_KINDS.map((kind) => scanInbox(db, KINDS[kind].dir(), { kind }));
  const outcomes = results.flatMap((r) => r.outcomes);
  for (const o of outcomes) if (o.result === "ingested" && o.source_id) enqueueExtraction(o.source_id);
  return Response.json({ outcomes, pending: results.reduce((n, r) => n + r.pending, 0) });
}
