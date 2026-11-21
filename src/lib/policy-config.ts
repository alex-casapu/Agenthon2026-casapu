import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_PRINCIPALS, principalIdFromCookieHeader, validatePrincipals, type Principal } from "./policy";

/**
 * Where the principals come from (server side). A world exports `principals.json`; loading a world
 * writes it here. With no file, the default demo cast is used. A malformed file is an error, never a
 * silent fallback: a wrong access policy must be noticed.
 */
export const principalsFile = (): string => process.env.BRAIN_PRINCIPALS ?? join(process.cwd(), "data", "principals.json");

let cache: { file: string; mtime: number; list: Principal[] } | null = null;

export function getPrincipals(): Principal[] {
  const file = principalsFile();
  if (!existsSync(file)) {
    cache = null;
    return DEFAULT_PRINCIPALS;
  }
  const mtime = statSync(file).mtimeMs;
  if (cache && cache.file === file && cache.mtime === mtime) return cache.list;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} is not valid JSON: ${(e as Error).message}`);
  }
  const r = validatePrincipals(Array.isArray(parsed) ? parsed : (parsed as { principals?: unknown })?.principals);
  if (!r.ok) throw new Error(`${file} is not a valid principals configuration:\n  ${r.errors.join("\n  ")}`);
  cache = { file, mtime, list: r.principals };
  return r.principals;
}

export const getPrincipal = (id: string | null | undefined): Principal | null => (id ? getPrincipals().find((p) => p.id === id) ?? null : null);

/** The acting principal named by a Cookie header; null means god mode. */
export const principalFromCookieHeader = (header: string | null | undefined): Principal | null => getPrincipal(principalIdFromCookieHeader(header));

/** Validate and write a principals configuration (atomically). */
export function writePrincipals(value: unknown, file = principalsFile()): Principal[] {
  const r = validatePrincipals(value);
  if (!r.ok) throw new Error(`invalid principals:\n  ${r.errors.join("\n  ")}`);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(r.principals, null, 2) + "\n");
  renameSync(tmp, file);
  cache = null;
  return r.principals;
}

/**
 * Are new claims trusted by default? On unless BRAIN_TRUST=off. When on, a claim that passes the gate is
 * usable at once (approved by the policy, recorded as such) and curation means rejecting what is wrong.
 * When off, claims wait for a curator to approve them.
 */
export const trustByDefault = (): boolean => process.env.BRAIN_TRUST !== "off";
