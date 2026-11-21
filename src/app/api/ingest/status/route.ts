import { connection } from "next/server";
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
  return Response.json({ folders, counts, events });
}
