import { connection } from "next/server";
import { inboxDir } from "@/lib/ingest/inbox";
import { getDb } from "@/lib/store";

export async function GET() {
  await connection();
  const db = getDb();
  const events = db
    .prepare(
      `SELECT e.seq, e.path, e.result, e.error, e.created_at, e.source_id, s.external_id, s.occurred_at
       FROM ingest_events e LEFT JOIN sources s USING (source_id) ORDER BY e.seq DESC LIMIT 200`,
    )
    .all();
  const counts = db.prepare("SELECT result, COUNT(*) AS n FROM ingest_events GROUP BY result").all();
  return Response.json({ inbox: inboxDir(), counts, events });
}
