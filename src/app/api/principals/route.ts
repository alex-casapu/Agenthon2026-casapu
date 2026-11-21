import { connection } from "next/server";
import { getPrincipals } from "@/lib/policy-config";
import { getDb, recordPrincipals } from "@/lib/store";

/** Who can use the system in this world (one to three people), for the role switcher and the chat. */
export async function GET() {
  await connection();
  const principals = getPrincipals();
  recordPrincipals(getDb(), principals); // a changed configuration becomes a new, logged version
  return Response.json({ principals });
}
