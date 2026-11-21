import { RowsParams } from "@/lib/api-debug";
import { getDb } from "@/lib/store";
import { DebugError, queryRows } from "@/lib/store/debug";

export async function GET(req: Request) {
  const p = RowsParams.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!p.success) return Response.json({ error: p.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const { eqCol, eqVal, ...rest } = p.data;
  try {
    return Response.json(queryRows(getDb(), { ...rest, eq: eqCol !== undefined && eqVal !== undefined ? { col: eqCol, val: eqVal } : null }));
  } catch (e) {
    if (e instanceof DebugError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}
