-- Ledger of every file-ingest attempt. Append-only and hash-chained like everything else.

CREATE TABLE ingest_events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  path       TEXT NOT NULL,        -- relative to the inbox root, posix separators
  file_hash  TEXT NOT NULL,        -- sha256 of the file bytes
  result     TEXT NOT NULL CHECK (result IN ('ingested', 'duplicate', 'conflict', 'invalid')),
  source_id  TEXT REFERENCES sources(source_id),
  error      TEXT,                 -- JSON array of reasons for invalid / conflict
  created_at TEXT NOT NULL
);

CREATE INDEX ingest_events_file ON ingest_events (path, file_hash);
CREATE INDEX sources_external ON sources (kind, external_id);

CREATE TRIGGER ingest_events_no_update BEFORE UPDATE ON ingest_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER ingest_events_no_delete BEFORE DELETE ON ingest_events BEGIN SELECT RAISE(ABORT, 'append-only'); END;
