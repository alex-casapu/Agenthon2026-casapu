-- Proactive notices: for each new piece of knowledge and each person who may see it, what the
-- memory decided about telling them. Skips are stored too, so every decision is auditable and
-- the same question is never asked twice. Append-only and hash-chained like everything else.

CREATE TABLE notices (
  notice_id    TEXT PRIMARY KEY,         -- sha256(version|principal|source|claim ids)
  principal_id TEXT NOT NULL,
  source_id    TEXT NOT NULL REFERENCES sources(source_id),  -- the source whose claims triggered it
  claim_ids    TEXT NOT NULL,            -- JSON array: the new claims that were considered
  decision     TEXT NOT NULL CHECK (decision IN ('notify', 'skip_participant', 'skip_model', 'skip_unverified')),
  topic        TEXT,
  segments     TEXT,                     -- JSON: [{text, cites: [claim_id]}], verified like a chat answer
  urgency      TEXT,
  reason       TEXT,
  model        TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX notices_principal ON notices (principal_id, decision, created_at);

CREATE TRIGGER notices_no_update BEFORE UPDATE ON notices BEGIN SELECT RAISE(ABORT, 'append-only'); END;
CREATE TRIGGER notices_no_delete BEFORE DELETE ON notices BEGIN SELECT RAISE(ABORT, 'append-only'); END;

-- Which notices a person has dismissed. A view preference, not knowledge: not logged.
CREATE TABLE notice_seen (
  notice_id TEXT PRIMARY KEY REFERENCES notices(notice_id),
  seen_at   TEXT NOT NULL
);
