import { SourceBody } from "@/lib/api";
import { getDb, insertSource } from "@/lib/store";

export async function POST(req: Request) {
  const parsed = SourceBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  return Response.json(insertSource(getDb(), parsed.data));
}
