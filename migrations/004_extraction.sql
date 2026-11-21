-- One row per extraction attempt on a source. Append-only and hash-chained.
-- "Up to date" for a source = a 'done' run with the current extractor + vocabulary hash.

CREATE TABLE extraction_runs (
  seq         INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id   TEXT NOT NULL REFERENCES sources(source_id),
  extractor   TEXT NOT NULL,        -- extractor version, e.g. llm-v1
  vocab_hash  TEXT NOT NULL,        -- hash of the predicate definitions offered to the model
  model       TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,        -- hash of the first prompt (cache key material)
  status      TEXT NOT NULL CHECK (status IN ('done', 'failed')),
  rounds      INTEGER NOT NULL,     -- model calls made (1 = no repair needed)
  proposed    INTEGER NOT NULL,     -- new claims saved as proposed
  duplicates  INTEGER NOT NULL,     -- claims that already existed
  rejected    INTEGER NOT NULL,     -- claims the gate still rejected after all repair rounds
  detail      TEXT NOT NULL,        -- JSON: per-round log and the rejected claims with their errors
  error       TEXT,
  cost_usd    REAL,
  duration_ms INTEGER,
  created_at  TEXT NOT NULL
);

CREATE INDEX extraction_runs_source ON extraction_runs (source_id, extractor, vocab_hash);

CREATE TRIGGER extraction_runs_no_update BEFORE UPDATE ON extraction_runs BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER extraction_runs_no_delete BEFORE DELETE ON extraction_runs BEGIN SELECT RAISE(ABORT, 'append-only'); END;
