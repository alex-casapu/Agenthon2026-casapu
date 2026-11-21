import { connection } from "next/server";
import { listClaimViews } from "@/lib/claims-view";
import { getDb } from "@/lib/store";

/** Every claim with its sentence, fields, quotes in context, source details, history and extractor. */
export async function GET() {
  await connection();
  return Response.json(listClaimViews(getDb()));
}
