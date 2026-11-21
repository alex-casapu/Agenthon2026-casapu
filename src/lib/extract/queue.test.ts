import { memDb } from "../testkit";
import { beforeEach, describe, expect, it } from "vitest";
import { insertSource, listClaims, type DB } from "../store";
import { reply, scriptedLlm } from "./fake-llm";
import { createExtractionQueue } from "./queue";
import { extractSource } from "./extract";

const text = (n: number) => `Il prezzo della semola numero ${n} è 41${n} €/t, valida fino al 31 dicembre.\n`;
let db: DB;
let ids: string[];
beforeEach(() => {
  db = memDb();
  ids = [1, 2, 3, 4].map((n) => insertSource(db, { kind: "email", external_id: `m${n}`, occurred_at: "2026-10-12T07:15:00Z", raw: text(n) }).source_id);
});

const stmt = (n: number) => reply([{ predicate: "statement", fields: { text: `Prezzo ${n}` }, quotes: [`semola numero ${n} è 41${n} €/t`] }]);

describe("extraction queue", () => {
  it("extracts what is enqueued, off the caller's path, and reports results", async () => {
    const results: string[] = [];
    const { llm } = scriptedLlm([(req) => stmt(Number(/semola numero (\d)/.exec(req.prompt)![1]))]);
    const q = createExtractionQueue(db, { extract: { llm, model: "m" }, onResult: (s) => results.push(s.status) });
    expect(q.enqueue(ids[0])).toBe(true);
    expect(q.enqueue(ids[1])).toBe(true);
    await q.idle();
    expect(results).toEqual(["done", "done"]);
    expect(listClaims(db)).toHaveLength(2);
    expect(q.stats()).toMatchObject({ queued: 0, running: 0, done: 2, failed: 0 });
  });

  it("ignores a source that is already queued or running", async () => {
    const { llm } = scriptedLlm([async () => stmt(1)]);
    const q = createExtractionQueue(db, { extract: { llm, model: "m" } });
    expect(q.enqueue(ids[0])).toBe(true);
    expect(q.enqueue(ids[0])).toBe(false);
    await q.idle();
    expect(q.enqueue(ids[0])).toBe(true); // finished: can be queued again (will be skipped as up to date)
    await q.idle();
    expect(q.stats().skipped).toBe(1);
  });

  it("never runs more than `concurrency` extractions at once", async () => {
    let running = 0;
    let max = 0;
    const { llm } = scriptedLlm([
      async () => {
        max = Math.max(max, ++running);
        await new Promise((r) => setTimeout(r, 20));
        running--;
        return reply([]);
      },
    ]);
    const q = createExtractionQueue(db, { extract: { llm, model: "m" }, concurrency: 2 });
    ids.forEach((id) => q.enqueue(id));
    expect(q.stats().running).toBe(2);
    expect(q.stats().queued).toBe(2);
    await q.idle();
    expect(max).toBe(2);
    expect(q.stats().done).toBe(4);
  });

  it("catches up only on sources without an up-to-date run", async () => {
    const { llm, calls } = scriptedLlm([reply([])]);
    await extractSource(db, ids[0], { llm, model: "m" });
    await extractSource(db, ids[1], { llm, model: "m" });
    calls.length = 0;
    const q = createExtractionQueue(db, { extract: { llm, model: "m" } });
    expect(q.catchUp()).toBe(2);
    await q.idle();
    expect(calls).toHaveLength(2);
    expect(q.catchUp()).toBe(0);
  });

  it("a failed run is retried by the next catch-up, but not in a loop", async () => {
    const { llm, calls } = scriptedLlm([new Error("offline"), reply([])]);
    const q = createExtractionQueue(db, { extract: { llm, model: "m" } });
    q.enqueue(ids[0]);
    await q.idle();
    expect(q.stats().failed).toBe(1);
    expect(calls).toHaveLength(1);
    expect(q.catchUp()).toBeGreaterThanOrEqual(1);
    await q.idle();
    expect(db.prepare("SELECT status FROM extraction_runs WHERE source_id = ? ORDER BY seq").all(ids[0])).toEqual([{ status: "failed" }, { status: "done" }]);
  });

  it("survives a crash inside an extraction", async () => {
    const q = createExtractionQueue(db, { extract: { llm: scriptedLlm([reply([])]).llm, model: "m" } });
    q.enqueue("does-not-exist");
    await q.idle();
    expect(q.stats().failed).toBe(1);
    q.enqueue(ids[0]);
    await q.idle();
    expect(q.stats().done).toBe(1);
  });

  it("idle resolves immediately when there is nothing to do", async () => {
    const q = createExtractionQueue(db, { extract: { llm: scriptedLlm([reply([])]).llm, model: "m" } });
    await q.idle();
    expect(q.stats()).toMatchObject({ queued: 0, running: 0 });
  });
});
