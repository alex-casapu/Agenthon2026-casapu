import { connection } from "next/server";
import { getDb } from "@/lib/store";
import { listSchema } from "@/lib/store/debug";

export async function GET() {
  await connection(); // read the live DB per request, never at build time
  return Response.json(listSchema(getDb()));
}
