import { connection } from "next/server";
import { principalFromRequest } from "@/lib/api-principal";
import { listClaimViews, visibleTo } from "@/lib/claims-view";
import { getDb } from "@/lib/store";

/**
 * Claims as the acting role may see them (no cookie = god mode, everything):
 * sentence, fields, quotes in context, source details, history, extractor.
 */
export async function GET(req: Request) {
  await connection();
  const principal = principalFromRequest(req);
  const all = listClaimViews(getDb());
  return Response.json({ principal, total: all.length, claims: visibleTo(all, principal) });
}
