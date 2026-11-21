/**
 * Live evaluation of the extractor against fixtures/extraction-truth.json on the
 * example sources. Not part of `npm test` (calls the model). Run: npm run eval:extract
 * Recorded responses are reused (BRAIN_LLM_MODE=live to force fresh calls).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { defaultLlm, llmMode, llmModel } from "../llm";
import { scanInbox, type SourceKind } from "../ingest/inbox";
import { listClaims, openDb } from "../store";
import { extractSource } from "./extract";
import { flattenClaim, scoreSource, type SourceTruth } from "./eval";

const truth = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "extraction-truth.json"), "utf8")).sources as Record<string, SourceTruth>;
const DIRS: [SourceKind, string][] = [["email", "inbox"], ["news", "news"], ["document", "docs"]];

describe("extraction eval", () => {
  it("scores the extractor on the example sources", async () => {
    const db = openDb(":memory:");
    for (const [kind, dir] of DIRS) scanInbox(db, join(process.cwd(), "examples", dir), { kind });
    const sources = db.prepare("SELECT source_id, external_id FROM sources ORDER BY rowid").all() as { source_id: string; external_id: string }[];

    const llm = defaultLlm();
    const model = llmModel();
    const summaries = new Map<string, Awaited<ReturnType<typeof extractSource>>>();
    const queue = [...sources];
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        for (let s = queue.shift(); s; s = queue.shift()) summaries.set(s.external_id, await extractSource(db, s.source_id, { llm, model }));
      }),
    );

    const rows: Record<string, unknown>[] = [];
    const detail: Record<string, unknown> = {};
    let expected = 0, found = 0, extras = 0, forbidden = 0, rejected = 0, calls = 0, cost = 0, failed = 0;
    const all = listClaims(db);
    for (const src of sources) {
      const t = truth[src.external_id];
      const sum = summaries.get(src.external_id)!;
      const claims = all.filter((c) => c.evidence.some((e) => e.source_id === src.source_id));
      const sc = t ? scoreSource(claims, t) : { expected: 0, found: 0, missing: [], extras: claims, forbiddenHits: [] };
      expected += sc.expected; found += sc.found; extras += sc.extras.length; forbidden += sc.forbiddenHits.length;
      rejected += sum.rejected; calls += sum.rounds; cost += sum.cost_usd ?? 0; failed += sum.status === "failed" ? 1 : 0;
      rows.push({ source: src.external_id, status: sum.status, calls: sum.rounds, claims: claims.length, recall: `${sc.found}/${sc.expected}`, extras: sc.extras.length, forbidden: sc.forbiddenHits.length, gateRejected: sum.rejected, sec: ((sum.duration_ms ?? 0) / 1000).toFixed(1) });
      detail[src.external_id] = {
        summary: sum,
        missing: sc.missing,
        extras: sc.extras.map((c) => ({ predicate: c.predicate_id, fields: flattenClaim(c), quotes: c.evidence.map((e) => e.text) })),
        forbiddenHits: sc.forbiddenHits.map((c) => ({ predicate: c.predicate_id, fields: flattenClaim(c) })),
      };
    }

    console.log(`\nExtraction eval · model ${model} · mode ${llmMode()}`);
    console.table(rows);
    console.log(`recall ${found}/${expected} (${((100 * found) / Math.max(1, expected)).toFixed(0)}%) · extra claims ${extras} · forbidden hits ${forbidden} · gate-rejected ${rejected} · failed runs ${failed} · model calls ${calls} · cost $${cost.toFixed(3)}`);
    for (const [id, d] of Object.entries(detail) as [string, { missing: unknown[]; extras: unknown[]; forbiddenHits: unknown[] }][]) {
      if (d.missing.length) console.log(`\nMISSING in ${id}:`, JSON.stringify(d.missing));
      if (d.forbiddenHits.length) console.log(`\nFORBIDDEN in ${id}:`, JSON.stringify(d.forbiddenHits));
      if (d.extras.length) console.log(`\nEXTRA in ${id}:`, JSON.stringify(d.extras, null, 1));
    }
    mkdirSync(join(process.cwd(), "data", "eval"), { recursive: true });
    writeFileSync(join(process.cwd(), "data", "eval", `extraction-${new Date().toISOString().replace(/[:.]/g, "-")}.json`), JSON.stringify({ model, found, expected, extras, forbidden, rejected, failed, cost, rows, detail }, null, 2));
  }, 900_000);
});
