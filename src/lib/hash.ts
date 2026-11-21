import { createHash } from "node:crypto";

export const sha256 = (s: string): string =>
  createHash("sha256").update(s, "utf8").digest("hex");

export const sha256Bytes = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

/** Deterministic JSON: sorted keys, no whitespace, undefined dropped. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") + "}";
}
