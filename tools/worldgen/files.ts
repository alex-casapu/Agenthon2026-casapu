import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { splitFrontMatter } from "../../src/lib/ingest/common";
import type { Principal } from "../../src/lib/policy";
import { writePrincipals } from "../../src/lib/policy-config";
import { buildAnswerKey } from "./answers";
import { checkBody, parseFile } from "./check";
import type { Compiled } from "./compile";
import { parseSpec, type ScenarioSpec } from "./spec";
import type { Generated } from "./generate";
import { principalsOf } from "./principals";
import { buildSummary } from "./summary";
import { KIND_DIR, KINDS, pieceId, type Piece, type World } from "./types";

const mdFiles = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_") && !f.startsWith(".")).sort() : [];

export const SPEC_FILE = "scenario.json";
export const PRINCIPALS_FILE = "principals.json";

/** Reads and validates `<dir>/scenario.json`. */
export function readSpec(file: string): ScenarioSpec {
  const parsed = parseSpec(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.ok) throw new Error(`${file} is not a valid scenario:\n  ${parsed.errors.join("\n  ")}`);
  return parsed.spec;
}

/**
 * Writes the generated files under `outDir/<tier>/...`, plus the scenario, the answer key and the summary.
 * Only the tier folders are cleaned; recordings and anything else in `outDir` are left alone.
 */
export function writeWorld(c: Compiled, files: Generated[], outDir: string, meta: { writer: string }): void {
  for (const tier of c.world.tiers) rmSync(join(outDir, tier), { recursive: true, force: true });
  for (const f of files) {
    const abs = join(outDir, f.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, f.text);
  }
  writeFileSync(join(outDir, SPEC_FILE), JSON.stringify(c.spec, null, 2) + "\n");
  writeFileSync(join(outDir, PRINCIPALS_FILE), JSON.stringify(principalsOf(c.spec), null, 2) + "\n");
  writeFileSync(join(outDir, "ANSWERS.json"), JSON.stringify(buildAnswerKey(c), null, 2) + "\n");
  writeFileSync(join(outDir, "SUMMARY.md"), buildSummary(c, { writer: meta.writer, attempts: Object.fromEntries(files.map((f) => [f.id, f.attempts])) }));
}

/**
 * Checks the files on disk: each one satisfies its contract and its spec, every piece of the scenario
 * has a file, and no file is unknown. This is what keeps a committed world valid.
 */
export function checkDir(world: World, dir: string): string[] {
  const errors: string[] = [];
  const seen = new Set<Piece>();

  for (const tier of world.tiers) {
    for (const kind of KINDS) {
      const folder = join(dir, tier, KIND_DIR[kind]);
      for (const name of mdFiles(folder)) {
        const abs = join(folder, name);
        const rel = relative(dir, abs);
        const text = readFileSync(abs, "utf8");
        const r = parseFile(kind, text);
        if (!r.ok) {
          errors.push(...r.errors.map((e) => `${rel}: contract: ${e}`));
          continue;
        }
        const piece = world.pieces.find((p) => p.kind === kind && p.tier === tier && pieceId(p) === r.parsed.external_id);
        if (!piece) {
          errors.push(`${rel}: ${r.parsed.external_id} is not in the scenario for ${tier}`);
          continue;
        }
        seen.add(piece);
        if (Date.parse(r.parsed.occurred_at) !== Date.parse(piece.header.date)) errors.push(`${rel}: date differs from the scenario`);
        const split = splitFrontMatter(text);
        if (split.ok) {
          errors.push(...checkBody(piece, split.body, { forbidden: world.forbidden, banned: world.banned, lang: world.language }).map((e) => `${rel}: ${e}`));
        }
      }
    }
  }
  for (const p of world.pieces) if (!seen.has(p)) errors.push(`missing file for ${p.kind} ${pieceId(p)} (${p.tier})`);
  return errors;
}

export interface PlayTargets {
  email: string;
  news: string;
  doc: string;
}

/** Where the system reads its sources (same variables and defaults as src/lib/ingest/inbox.ts). */
export const defaultTargets = (cwd = process.cwd()): PlayTargets => ({
  email: process.env.BRAIN_INBOX ?? join(cwd, "data", "inbox"),
  news: process.env.BRAIN_NEWS ?? join(cwd, "data", "news"),
  doc: process.env.BRAIN_DOCS ?? join(cwd, "data", "docs"),
});

/**
 * Releases a tier into the system's folders. Each file is written as `_name.md` and then renamed,
 * so a watcher never sees a half-written file. Returns the destination paths.
 */
export function playTier(tier: string, worldDir: string, targets: PlayTargets): string[] {
  const out: string[] = [];
  for (const kind of KINDS) {
    const src = join(worldDir, tier, KIND_DIR[kind]);
    for (const name of mdFiles(src)) {
      mkdirSync(targets[kind], { recursive: true });
      const tmp = join(targets[kind], `_${name}`);
      writeFileSync(tmp, readFileSync(join(src, name)));
      const dest = join(targets[kind], name);
      renameSync(tmp, dest);
      out.push(dest);
    }
  }
  return out;
}

/** Writes `principals.json` from an existing scenario (for worlds generated before it was exported). */
export function writeWorldPrincipals(dir: string): Principal[] {
  const list = principalsOf(readSpec(join(dir, SPEC_FILE)));
  writeFileSync(join(dir, PRINCIPALS_FILE), JSON.stringify(list, null, 2) + "\n");
  return list;
}

/** The exported principals must exist and match what the scenario says. */
export function checkPrincipals(spec: ScenarioSpec, dir: string): string[] {
  const file = join(dir, PRINCIPALS_FILE);
  if (!existsSync(file)) return [`${PRINCIPALS_FILE} is missing (run: world:principals ${relative(process.cwd(), dir) || dir})`];
  let expected: Principal[];
  try {
    expected = principalsOf(spec);
  } catch (e) {
    return [(e as Error).message];
  }
  let actual: unknown;
  try {
    actual = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return [`${PRINCIPALS_FILE} is not valid JSON`];
  }
  return JSON.stringify(actual) === JSON.stringify(expected) ? [] : [`${PRINCIPALS_FILE} does not match the scenario (regenerate it with world:principals)`];
}

/** Makes this world's people the system's principals: validates and writes the app's configuration. */
export function loadPrincipals(dir: string): Principal[] {
  const file = join(dir, PRINCIPALS_FILE);
  const list: unknown = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : principalsOf(readSpec(join(dir, SPEC_FILE)));
  return writePrincipals(list);
}
