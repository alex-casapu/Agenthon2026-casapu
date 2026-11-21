import { principalFromRequest } from "@/lib/api-principal";
import { ReviewBody } from "@/lib/api";
import { claimLabels } from "@/lib/claims-view";
import { canSee } from "@/lib/policy";
import { getDb, reviewClaim } from "@/lib/store";

/** Approve / reject / retract. Only a curator may, and the actor is the principal, never a client-supplied name. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const principal = principalFromRequest(req);
  if (!principal) return Response.json({ error: "choose a curator in the role switcher: curation needs a named person" }, { status: 403 });
  if (!principal.curator) return Response.json({ error: `${principal.name} (${principal.role}) cannot curate the memory` }, { status: 403 });

  const parsed = ReviewBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });

  const db = getDb();
  // A claim the curator is not cleared for is indistinguishable from one that does not exist.
  if (!canSee(principal, claimLabels(db, id))) return Response.json({ ok: false, error: "unknown claim" }, { status: 409 });
  const res = reviewClaim(db, id, parsed.data.type, `human:${principal.id}`, parsed.data.reason);
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
