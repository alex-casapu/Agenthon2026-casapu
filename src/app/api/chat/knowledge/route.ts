import { connection } from "next/server";
import { knowledgeFor } from "@/lib/answer/answer";
import { principalFromRequest } from "@/lib/api-principal";
import { getDb } from "@/lib/store";

/**
 * What the acting role has to work with: its own approved claims and how many are
 * still awaiting approval. Never says how much exists that it cannot see.
 */
export async function GET(req: Request) {
  await connection();
  const principal = principalFromRequest(req);
  if (!principal) return Response.json({ error: "Choose who you are first." }, { status: 403 });
  const { approved, pending } = knowledgeFor(getDb(), principal);
  return Response.json({
    principal,
    approved: approved.map((c) => ({ claim_id: c.claim_id, sentence: c.sentence, labels: c.labels })),
    pending,
    suggestions: principal.suggestions ?? [],
  });
}
