import { connection } from "next/server";
import { getDb, verify } from "@/lib/store";
import { logCoverage } from "@/lib/store/debug";

export async function GET() {
  await connection(); // read the live DB per request, never at build time
  const db = getDb();
  return Response.json({ ...verify(db), coverage: logCoverage(db) });
}
