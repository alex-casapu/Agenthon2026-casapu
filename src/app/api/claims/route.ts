import { ClaimBody } from "@/lib/api";
import { trustByDefault } from "@/lib/policy-config";
import { getDb, submitClaim } from "@/lib/store";

export async function POST(req: Request) {
  const parsed = ClaimBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ ok: false, errors: parsed.error.issues.map((i) => ({ code: "bad_request", message: i.message })) }, { status: 400 });
  const res = submitClaim(getDb(), parsed.data, "human:manual", { trust: trustByDefault() });
  return Response.json(res, { status: res.ok ? 200 : 422 });
}
