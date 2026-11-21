import { canonicalJson, sha256 } from "../hash";
import type { Principal } from "../policy";
import { recordRow, type DB } from "./log";

/**
 * Record the principals in force. Each distinct definition is stored once per id as a new version, so a
 * change of access policy (a new world, an edited clearance) is a logged, hash-chained event, not a mutation.
 */
export function recordPrincipals(db: DB, list: Principal[]): void {
  db.transaction(() => {
    for (const p of list) {
      const hash = sha256(canonicalJson(p));
      const latest = db
        .prepare("SELECT version, definition_hash FROM principals WHERE principal_id = ? ORDER BY version DESC LIMIT 1")
        .get(p.id) as { version: number; definition_hash: string } | undefined;
      if (latest?.definition_hash === hash) continue;
      const version = (latest?.version ?? 0) + 1;
      db.prepare("INSERT INTO principals (principal_id, version, definition, definition_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
        p.id,
        version,
        canonicalJson(p),
        hash,
        new Date().toISOString(),
      );
      recordRow(db, "principals", `${p.id}:${version}`);
    }
  })();
}
