import { extractSource, type ExtractOptions, type ExtractSummary } from "./extract";
import { EXTRACTOR_VERSION, vocabHash } from "./prompt";
import { pendingSources } from "./runs";
import { latestPredicates } from "../predicates";
import type { DB } from "../store";

export interface QueueStats {
  queued: number;
  running: number;
  done: number;
  failed: number;
  skipped: number;
}

export interface ExtractionQueue {
  /** Queue a source (ignored if already queued or running). */
  enqueue(sourceId: string, opts?: { force?: boolean }): boolean;
  /** Queue every source without an up-to-date run. Returns how many were added. */
  catchUp(): number;
  /** Resolves when nothing is queued or running. */
  idle(): Promise<void>;
  stats(): QueueStats;
}

/**
 * In-process queue that runs extraction off the ingest path, `concurrency`
 * at a time. It never throws into the caller; failures are recorded as runs.
 */
export function createExtractionQueue(
  db: DB,
  opts: { extract: Omit<ExtractOptions, "force" | "predicates">; concurrency?: number; onResult?: (s: ExtractSummary) => void },
): ExtractionQueue {
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const waiting: { id: string; force: boolean }[] = [];
  const active = new Set<string>();
  const stats: QueueStats = { queued: 0, running: 0, done: 0, failed: 0, skipped: 0 };
  let idleWaiters: (() => void)[] = [];

  const settle = () => {
    if (waiting.length === 0 && active.size === 0) {
      idleWaiters.forEach((r) => r());
      idleWaiters = [];
    }
  };

  const pump = () => {
    while (active.size < concurrency && waiting.length > 0) {
      const job = waiting.shift()!;
      active.add(job.id);
      stats.queued = waiting.length;
      stats.running = active.size;
      extractSource(db, job.id, { ...opts.extract, force: job.force })
        .then((s) => {
          stats[s.status]++;
          opts.onResult?.(s);
        })
        .catch((e) => {
          stats.failed++;
          console.error(`[extract] ${job.id.slice(0, 8)} crashed:`, e);
        })
        .finally(() => {
          active.delete(job.id);
          stats.running = active.size;
          pump();
          settle();
        });
    }
  };

  return {
    enqueue(sourceId, o) {
      if (active.has(sourceId) || waiting.some((w) => w.id === sourceId)) return false;
      waiting.push({ id: sourceId, force: !!o?.force });
      stats.queued = waiting.length;
      pump();
      return true;
    },
    catchUp() {
      const vocab = vocabHash(latestPredicates());
      let n = 0;
      for (const id of pendingSources(db, EXTRACTOR_VERSION, vocab)) if (this.enqueue(id)) n++;
      return n;
    },
    idle: () => (waiting.length === 0 && active.size === 0 ? Promise.resolve() : new Promise<void>((r) => idleWaiters.push(r))),
    stats: () => ({ ...stats, queued: waiting.length, running: active.size }),
  };
}
