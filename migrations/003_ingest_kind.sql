-- The ledger now covers several source kinds (email, news). A file seen in one
-- kind's folder must not shadow the same file in another's.
--
-- NOTE: adding a column to a logged table changes the payload hash of existing
-- ingest_events rows. Pre-freeze dev databases should be reset (npm run db:reset).

ALTER TABLE ingest_events ADD COLUMN kind TEXT NOT NULL DEFAULT 'email';

DROP INDEX ingest_events_file;
CREATE INDEX ingest_events_file ON ingest_events (kind, path, file_hash);
