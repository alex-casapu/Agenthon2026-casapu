import { z } from "zod";
import { principalFromRequest } from "@/lib/api-principal";
import { markSeen } from "@/lib/proactive";
import { getDb } from "@/lib/store";

const Body = z.object({ ids: z.array(z.string()).min(1).max(100) });

/** Dismiss notices. Only your own can be dismissed. */
export async function POST(req: Request) {
  const principal = principalFromRequest(req);
  if (!principal) return Response.json({ error: "Choose who you are first." }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad request" }, { status: 400 });
  return Response.json({ marked: markSeen(getDb(), principal.id, parsed.data.ids) });
}
