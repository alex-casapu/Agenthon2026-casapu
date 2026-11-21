import { connection } from "next/server";
import { z } from "zod";
import { SOURCE_KINDS } from "@/lib/ingest/inbox";
import { defaultLlm, llmModel } from "@/lib/llm";
import { getPrincipals } from "@/lib/policy-config";
import { getDb, listEntities } from "@/lib/store";
import { generateSources } from "@/lib/sourcegen";

const Body = z.object({ prompt: z.string().trim().min(3).max(1500), kinds: z.array(z.enum(SOURCE_KINDS as [string, ...string[]])).max(3).optional() });

/** Drafts new sources from a short request. Writes nothing: the result is only a preview. */
export async function POST(req: Request) {
  await connection();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Write a short request, at least a few words." }, { status: 400 });

  const db = getDb();
  const principals = getPrincipals();
  const labels = [...new Set(["public", ...principals.flatMap((p) => p.clearances).filter((c) => c !== "*")])];
  const recent = (db.prepare("SELECT kind, raw FROM sources ORDER BY ingested_at DESC LIMIT 4").all() as { kind: string; raw: string }[]).map(
    (r) => `${r.kind}: ${r.raw.replace(/\s+/g, " ").slice(0, 160)}`,
  );
  try {
    const items = await generateSources(
      parsed.data.prompt,
      { now: new Date(), labels, people: principals.map((p) => `${p.name} (${p.role})`), entities: listEntities(db).map((e) => e.name).slice(0, 40), recent },
      { llm: defaultLlm(), model: llmModel(), kinds: parsed.data.kinds as never },
    );
    if (items.length === 0) return Response.json({ error: "The model returned nothing usable. Try rephrasing the request." }, { status: 502 });
    return Response.json({ items });
  } catch (e) {
    return Response.json({ error: `The model call failed: ${(e as Error).message}` }, { status: 502 });
  }
}
