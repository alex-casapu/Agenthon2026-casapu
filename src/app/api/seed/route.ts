import { loadSample } from "@/lib/sample";
import { getDb } from "@/lib/store";

export async function POST() {
  return Response.json(loadSample(getDb()));
}
