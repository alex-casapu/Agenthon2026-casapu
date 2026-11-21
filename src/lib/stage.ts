import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import { KINDS, type SourceKind } from "./ingest/inbox";

/**
 * Stage events: pieces of the simulated world released on demand, for the live demo.
 * Releasing one is exactly what dropping the file in the folder is: the watcher ingests it,
 * extraction runs, the claims appear. Nothing else is special-cased.
 */
export interface StageEvent {
  id: string;
  label: string;
  /** One line for the presenter. */
  hint: string;
  kind: SourceKind;
  /** The file to release, relative to the project root. */
  file: string;
}

export const STAGE_EVENTS: StageEvent[] = [
  { id: "alert", label: "Alert: a message from the fair", hint: "A weak source (reliability low). Something to reject.", kind: "email", file: "examples/inbox/20261119-1730-voce-fiera.md" },
  { id: "report", label: "Market report arrives", hint: "Spot price 502 €/t, +18%.", kind: "news", file: "examples/news/20261121-semola-502.md" },
  { id: "correction", label: "Correction arrives", hint: "The +18% was one market.", kind: "news", file: "examples/news/20261121-rettifica.md" },
];

export interface ReleaseResult {
  ok: boolean;
  file?: string;
  already?: boolean;
  error?: string;
}

/** Copy the event's file into its source folder, atomically (written as _name, then renamed). */
export function releaseStageEvent(id: string, root = process.cwd()): ReleaseResult {
  const ev = STAGE_EVENTS.find((e) => e.id === id);
  if (!ev) return { ok: false, error: `unknown event ${id}` };
  const src = join(root, ev.file);
  if (!existsSync(src)) return { ok: false, error: `missing ${ev.file}` };
  const dir = KINDS[ev.kind].dir();
  mkdirSync(dir, { recursive: true });
  const name = basename(ev.file);
  const dest = join(dir, name);
  if (existsSync(dest)) return { ok: true, file: name, already: true };
  const tmp = join(dir, `_${name}`);
  copyFileSync(src, tmp);
  renameSync(tmp, dest);
  return { ok: true, file: name };
}
