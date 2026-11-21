-- Who may see what, and what claims are about. Both are versioned definitions,
-- recorded append-only and hash-chained so changes to policy or the registry are auditable.

CREATE TABLE principals (
  principal_id    TEXT NOT NULL,
  version         INTEGER NOT NULL,
  definition      TEXT NOT NULL,       -- JSON: name, role, clearances, curator
  definition_hash TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (principal_id, version)
);

CREATE TABLE entities (
  entity_id       TEXT NOT NULL,
  version         INTEGER NOT NULL,
  definition      TEXT NOT NULL,       -- JSON: name, kind, aliases
  definition_hash TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (entity_id, version)
);

CREATE TRIGGER principals_no_update BEFORE UPDATE ON principals BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER principals_no_delete BEFORE DELETE ON principals BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER entities_no_update   BEFORE UPDATE ON entities   BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER entities_no_delete   BEFORE DELETE ON entities   BEGIN SELECT RAISE(ABORT, 'append-only'); END;
