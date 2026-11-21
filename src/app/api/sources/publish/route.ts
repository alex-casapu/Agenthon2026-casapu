import { z } from "zod";
import { SOURCE_KINDS } from "@/lib/ingest/inbox";
import { writeSource } from "@/lib/sourcegen";

const Body = z.object({
  items: z.array(z.object({ kind: z.enum(SOURCE_KINDS as [string, ...string[]]), filename: z.string().max(200), content: z.string().max(200_000) })).min(1).max(5),
});

/**
 * Writes accepted drafts into the source folders. The watcher ingests them like any file dropped there,
 * so a source created here arrives exactly as a real one would.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  const results = parsed.data.items.map((i) => ({ filename: i.filename, ...writeSource(i as never) }));
  return Response.json({ results }, { status: results.every((r) => r.ok) ? 200 : 207 });
}
