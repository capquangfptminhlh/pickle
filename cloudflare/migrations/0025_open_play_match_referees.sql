-- Isolated Open Play match-referee assignments; no tournament table changes.
-- Explicit assignment: a global referee role alone never grants match scoring rights.
CREATE TABLE IF NOT EXISTS open_play_match_referees (
  match_id TEXT PRIMARY KEY REFERENCES open_play_matches(id) ON DELETE CASCADE,
  referee_user_id TEXT NOT NULL REFERENCES app_users(id),
  assigned_by TEXT NOT NULL REFERENCES app_users(id),
  assigned_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_op_referee_assigned ON open_play_match_referees(referee_user_id,match_id);
