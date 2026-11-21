import { ReviewBody } from "@/lib/api";
import { getDb, reviewClaim } from "@/lib/store";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = ReviewBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const res = reviewClaim(getDb(), id, parsed.data.type, parsed.data.actor, parsed.data.reason);
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
