import { z } from "zod";
import { extractionEnabled, getExtractionQueue } from "@/lib/extract";

const Body = z.object({ source_id: z.string().optional(), force: z.boolean().optional() });

/** Queue extraction: one source (optionally forced), or every source without an up-to-date run. */
export async function POST(req: Request) {
  const p = Body.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return Response.json({ error: "body must be {source_id?: string, force?: boolean}" }, { status: 400 });
  if (!extractionEnabled()) return Response.json({ error: "extraction is off (BRAIN_EXTRACT=off)" }, { status: 409 });
  const q = getExtractionQueue();
  const queued = p.data.source_id ? (q.enqueue(p.data.source_id, { force: p.data.force }) ? 1 : 0) : q.catchUp();
  return Response.json({ queued, stats: q.stats() });
}
