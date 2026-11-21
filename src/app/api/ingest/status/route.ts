import { connection } from "next/server";
import { extractionEnabled, getExtractionQueue } from "@/lib/extract";
import { KINDS, SOURCE_KINDS } from "@/lib/ingest/inbox";
import { getDb } from "@/lib/store";

export async function GET() {
  await connection();
  const db = getDb();
  const events = db
    .prepare(
      `SELECT e.seq, e.kind, e.path, e.result, e.error, e.created_at, e.source_id, s.external_id, s.occurred_at,
              json_extract(s.meta, '$.domain') AS domain, json_extract(s.meta, '$.doc_type') AS doc_type
       FROM ingest_events e LEFT JOIN sources s USING (source_id) ORDER BY e.seq DESC LIMIT 200`,
    )
    .all();
  const counts = db.prepare("SELECT kind, result, COUNT(*) AS n FROM ingest_events GROUP BY kind, result").all();
  const folders = Object.fromEntries(SOURCE_KINDS.map((k) => [k, KINDS[k].dir()]));
  const runs = db
    .prepare(
      `SELECT r.seq, r.source_id, s.kind, s.external_id, r.model, r.status, r.rounds, r.proposed, r.duplicates, r.rejected,
              r.error, r.cost_usd, r.duration_ms, r.created_at
       FROM extraction_runs r JOIN sources s USING (source_id) ORDER BY r.seq DESC LIMIT 100`,
    )
    .all();
  const enabled = extractionEnabled();
  return Response.json({ folders, counts, events, extraction: { enabled, queue: enabled ? getExtractionQueue().stats() : null, runs } });
}
