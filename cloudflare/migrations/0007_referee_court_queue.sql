ALTER TABLE matches ADD COLUMN court_state TEXT NOT NULL DEFAULT 'scheduled'
  CHECK (court_state IN ('scheduled','called','on_deck','warming_up','live','done'));

ALTER TABLE matches ADD COLUMN serving_side TEXT
  CHECK (serving_side IN ('A','B'));

ALTER TABLE matches ADD COLUMN server_number INTEGER NOT NULL DEFAULT 2
  CHECK (server_number IN (1,2));

ALTER TABLE matches ADD COLUMN timeout_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN timeout_b INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN medical_timeout_a INTEGER NOT NULL DEFAULT 0;
ALTER TABLE matches ADD COLUMN medical_timeout_b INTEGER NOT NULL DEFAULT 0;

ALTER TABLE matches ADD COLUMN called_at TEXT;
ALTER TABLE matches ADD COLUMN on_deck_at TEXT;
ALTER TABLE matches ADD COLUMN warmup_at TEXT;

CREATE INDEX IF NOT EXISTS idx_matches_court_state ON matches(court_id,court_state,scheduled_at);

CREATE TRIGGER IF NOT EXISTS court_state_version_guard
BEFORE INSERT ON audit_logs
WHEN NEW.entity_type='match' AND NEW.action IN ('COURT_STATE','AUTO_CALL_NEXT')
  AND NEW.before_data IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM matches
    WHERE id=NEW.entity_id
      AND version=json_extract(NEW.before_data,'$.version')
  )
BEGIN SELECT RAISE(ABORT,'VERSION_CONFLICT'); END;
