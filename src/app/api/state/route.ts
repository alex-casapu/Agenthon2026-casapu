import { connection } from "next/server";
import { getDb, listClaims, listSources, verify } from "@/lib/store";

export async function GET() {
  await connection(); // read the live DB per request, never at build time
  const db = getDb();
  return Response.json({
    sources: listSources(db),
    claims: listClaims(db),
    verify: verify(db),
  });
}
