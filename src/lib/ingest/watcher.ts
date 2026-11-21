import { mkdirSync, watch, type FSWatcher } from "node:fs";
import type { DB } from "../store";
import { scanInbox } from "./inbox";

export interface InboxWatcher {
  scanNow(): void;
  stop(): void;
}

/**
 * Ingests files as they appear. fs.watch gives low latency; a slow interval
 * rescan covers platforms/filesystems where events are dropped. A file that
 * changed in the last `settleMs` is left for the next pass (it may be mid-write).
 */
export function startInboxWatcher(db: DB, root: string, opts: { settleMs?: number; pollMs?: number } = {}): InboxWatcher {
  const settleMs = opts.settleMs ?? 300;
  mkdirSync(root, { recursive: true });

  let timer: NodeJS.Timeout | null = null;
  const scan = () => {
    timer = null;
    try {
      const { outcomes, pending } = scanInbox(db, root, { minAgeMs: settleMs });
      for (const o of outcomes) console.log(`[inbox] ${o.result.padEnd(9)} ${o.path}${o.errors ? ` — ${o.errors.join("; ")}` : ""}`);
      if (pending > 0) schedule(settleMs + 100);
    } catch (e) {
      console.error("[inbox] scan failed:", e);
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
