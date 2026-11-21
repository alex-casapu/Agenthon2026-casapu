import { z } from "zod";
import { SOURCE_KINDS } from "@/lib/ingest/inbox";
import { previewOf } from "@/lib/sourcegen";

const Body = z.object({ kind: z.enum(SOURCE_KINDS as [string, ...string[]]), filename: z.string().max(200), content: z.string().max(200_000) });

/** Checks an edited draft against the real source contract. Pure: reads and writes nothing. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  return Response.json(previewOf(parsed.data as never));
}
