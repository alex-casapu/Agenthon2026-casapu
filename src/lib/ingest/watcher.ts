import { mkdirSync, watch, type FSWatcher } from "node:fs";
import type { DB } from "../store";
import { scanInbox, type FileOutcome, type SourceKind } from "./inbox";

export interface InboxWatcher {
  scanNow(): void;
  stop(): void;
}

/**
 * Ingests files as they appear. fs.watch gives low latency; a slow interval
 * rescan covers platforms/filesystems where events are dropped. A file that
 * changed in the last `settleMs` is left for the next pass (it may be mid-write).
 */
export function startInboxWatcher(db: DB, root: string, opts: { settleMs?: number; pollMs?: number; kind?: SourceKind; onIngested?: (o: FileOutcome) => void } = {}): InboxWatcher {
  const settleMs = opts.settleMs ?? 300;
  const kind = opts.kind ?? "email";
  mkdirSync(root, { recursive: true });

  let timer: NodeJS.Timeout | null = null;
  const scan = () => {
    timer = null;
    try {
      const { outcomes, pending } = scanInbox(db, root, { minAgeMs: settleMs, kind });
      for (const o of outcomes) if (o.result === "ingested") opts.onIngested?.(o);
      for (const o of outcomes) console.log(`[${kind}] ${o.result.padEnd(9)} ${o.path}${o.errors ? ` — ${o.errors.join("; ")}` : ""}`);
      if (pending > 0) schedule(settleMs + 100);
    } catch (e) {
      console.error(`[${kind}] scan failed:`, e);
    }
  };
  const schedule = (ms: number) => {
    if (!timer) timer = setTimeout(scan, ms);
  };

  let fsw: FSWatcher | null = null;
  try {
    fsw = watch(root, { recursive: true }, () => schedule(settleMs));
  } catch {
    /* recursive watching unsupported: the poll below still works */
  }
  const poll = setInterval(scan, opts.pollMs ?? 5000);
  poll.unref();
  scan();

  return {
    scanNow: scan,
    stop() {
      fsw?.close();
      clearInterval(poll);
      if (timer) clearTimeout(timer);
    },
  };
}
