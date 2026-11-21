import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "../hash";
import { appendLog, type DB } from "./log";

/**
 * Forward-only SQL migrations. Each applied file's checksum is stored; editing
 * an applied migration is an error. Applying a migration is itself a log entry.
 */
export function migrate(db: DB, dir: string): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TRIGGER IF NOT EXISTS schema_migrations_no_update BEFORE UPDATE ON schema_migrations BEGIN SELECT RAISE(ABORT, 'append-only'); END;
    CREATE TRIGGER IF NOT EXISTS schema_migrations_no_delete BEFORE DELETE ON schema_migrations BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  `);

  const applied = new Map(
    (db.prepare("SELECT version, checksum FROM schema_migrations").all() as { version: number; checksum: string }[]).map(
      (r) => [r.version, r.checksum],
    ),
  );

  const files = readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const version = parseInt(file, 10);
    const sql = readFileSync(join(dir, file), "utf8");
    const checksum = sha256(sql);
    const prior = applied.get(version);
    if (prior !== undefined) {
      if (prior !== checksum) throw new Error(`Migration ${file} was modified after being applied`);
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)").run(
        version,
        file,
        checksum,
        new Date().toISOString(),
      );
      appendLog(db, "schema_migrations", String(version), checksum);
    })();
  }
}
