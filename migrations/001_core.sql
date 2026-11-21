-- Core schema: sources, quotes, predicates, claims, claim events, global hash chain.
-- Every table is append-only (see triggers at the bottom).

CREATE TABLE sources (
  source_id        TEXT PRIMARY KEY,   -- sha256(canon_version|kind|external_id|canonical_text)
  kind             TEXT NOT NULL,      -- email | chat | task | doc
  external_id      TEXT NOT NULL,
  thread_id        TEXT,
  author           TEXT,
  recipients       TEXT NOT NULL DEFAULT '[]',   -- JSON array
  occurred_at      TEXT NOT NULL,      -- ISO 8601
  ingested_at      TEXT NOT NULL,
  raw              TEXT NOT NULL,
  canonical_text   TEXT NOT NULL,
  canon_version    INTEGER NOT NULL,
  acl_labels       TEXT NOT NULL DEFAULT '[]',   -- JSON array, imported from the source system
  meta             TEXT NOT NULL DEFAULT '{}',   -- JSON object
  origin_source_id TEXT REFERENCES sources(source_id)  -- original message when this one quotes it
);

-- Offsets are Unicode code points into sources.canonical_text; end is exclusive.
CREATE TABLE quotes (
  quote_id  TEXT PRIMARY KEY,          -- sha256(source_id|start|end)
  source_id TEXT NOT NULL REFERENCES sources(source_id),
  start     INTEGER NOT NULL CHECK (start >= 0),
  "end"     INTEGER NOT NULL CHECK ("end" > start),
  text      TEXT NOT NULL
);

-- A quote must be a verbatim slice of its source. Enforced by the database itself.
CREATE TRIGGER quotes_verbatim BEFORE INSERT ON quotes
BEGIN
  SELECT RAISE(ABORT, 'quote is not a verbatim slice of its source')
  WHERE NEW.text IS NOT (
    SELECT substr(canonical_text, NEW.start + 1, NEW."end" - NEW.start)
    FROM sources WHERE source_id = NEW.source_id
  );
END;

CREATE TABLE predicates (
  predicate_id    TEXT NOT NULL,
  version         INTEGER NOT NULL,
  definition      TEXT NOT NULL,       -- JSON
  definition_hash TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (predicate_id, version)
);

CREATE TABLE claims (
  claim_id          TEXT PRIMARY KEY,  -- sha256 of canonical claim content
  kind              TEXT NOT NULL CHECK (kind IN ('structured', 'statement')),
  predicate_id      TEXT NOT NULL,
  predicate_version INTEGER NOT NULL,
  subject           TEXT NOT NULL,     -- JSON object
  value             TEXT NOT NULL,     -- JSON object
  conditions        TEXT NOT NULL,     -- JSON object
  valid_from        TEXT,              -- ISO date
  valid_to          TEXT,              -- ISO date
  grounding         TEXT NOT NULL,     -- JSON: per field {tier, quote_id | resolver}
  extractor         TEXT NOT NULL,     -- JSON: who/what proposed it
  created_at        TEXT NOT NULL,
  FOREIGN KEY (predicate_id, predicate_version) REFERENCES predicates(predicate_id, version)
);

CREATE TABLE claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims(claim_id),
  quote_id TEXT NOT NULL REFERENCES quotes(quote_id),
  PRIMARY KEY (claim_id, quote_id)
);

-- Status is an event, not a column.
CREATE TABLE claim_events (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id       TEXT NOT NULL REFERENCES claims(claim_id),
  type           TEXT NOT NULL CHECK (type IN ('proposed', 'approved', 'rejected', 'superseded', 'retracted')),
  actor          TEXT NOT NULL,
  reason         TEXT,
  policy_version INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL
);

CREATE VIEW claim_status AS
SELECT c.claim_id,
       (SELECT e.type FROM claim_events e WHERE e.claim_id = c.claim_id ORDER BY e.seq DESC LIMIT 1) AS status
FROM claims c;

-- One global hash chain over every row written to every table.
CREATE TABLE log (
  seq          INTEGER PRIMARY KEY AUTOINCREMENT,
  tbl          TEXT NOT NULL,
  row_id       TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  prev_hash    TEXT NOT NULL,
  hash         TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

-- Append-only enforcement.
CREATE TRIGGER sources_no_update        BEFORE UPDATE ON sources        BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER sources_no_delete        BEFORE DELETE ON sources        BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER quotes_no_update         BEFORE UPDATE ON quotes         BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER quotes_no_delete         BEFORE DELETE ON quotes         BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER predicates_no_update     BEFORE UPDATE ON predicates     BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER predicates_no_delete     BEFORE DELETE ON predicates     BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER claims_no_update         BEFORE UPDATE ON claims         BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER claims_no_delete         BEFORE DELETE ON claims         BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER claim_evidence_no_update BEFORE UPDATE ON claim_evidence BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER claim_evidence_no_delete BEFORE DELETE ON claim_evidence BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER claim_events_no_update   BEFORE UPDATE ON claim_events   BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER claim_events_no_delete   BEFORE DELETE ON claim_events   BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER log_no_update            BEFORE UPDATE ON log            BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER log_no_delete            BEFORE DELETE ON log            BEGIN SELECT RAISE(ABORT, 'append-only'); END;
