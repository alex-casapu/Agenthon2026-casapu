import { SqlBody } from "@/lib/api-debug";
import { getDb } from "@/lib/store";
import { DebugError, runReadonlySql } from "@/lib/store/debug";

export async function POST(req: Request) {
  const p = SqlBody.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "body must be {sql: string}" }, { status: 400 });
  try {
    return Response.json(runReadonlySql(getDb(), p.data.sql, p.data.max));
  } catch (e) {
    if (e instanceof DebugError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
