import { getDb, listClaims, listSources, verify } from "@/lib/store";

export async function GET() {
  const db = getDb();
  return Response.json({
    sources: listSources(db),
    claims: listClaims(db),
    verify: verify(db),
  });
}
