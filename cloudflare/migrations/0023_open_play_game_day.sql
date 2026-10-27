-- Open Play game-day workflow only. This does not modify tournaments, matches or score_events.
-- Check-in is per existing registration; no public contact data is copied.
CREATE TABLE IF NOT EXISTS open_play_checkins (
  session_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  checked_in_at TEXT NOT NULL,
  checked_in_by TEXT NOT NULL REFERENCES app_users(id),
  PRIMARY KEY(session_id,player_id),
  FOREIGN KEY(session_id,player_id) REFERENCES open_play_registrations(session_id,player_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_op_checkin_session ON open_play_checkins(session_id);

-- One confirmed schedule per session; immutable after creation to keep results stable.
CREATE TABLE IF NOT EXISTS open_play_plans (
  session_id TEXT PRIMARY KEY REFERENCES open_play_sessions(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES app_users(id),
  round_count INTEGER NOT NULL CHECK(round_count BETWEEN 1 AND 12),
  court_count INTEGER NOT NULL CHECK(court_count BETWEEN 1 AND 32),
  point_target INTEGER NOT NULL CHECK(point_target IN (11,15,21)),
  win_by INTEGER NOT NULL CHECK(win_by IN (1,2)),
  CHECK(round_count*court_count<=384)
);
CREATE TABLE IF NOT EXISTS open_play_matches (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES open_play_plans(session_id) ON DELETE CASCADE,
  round_no INTEGER NOT NULL CHECK(round_no BETWEEN 1 AND 12),
  court_no INTEGER NOT NULL CHECK(court_no BETWEEN 1 AND 32),
  team_a_json TEXT NOT NULL,
  team_b_json TEXT NOT NULL,
  score_a INTEGER NOT NULL DEFAULT 0 CHECK(score_a BETWEEN 0 AND 99),
  score_b INTEGER NOT NULL DEFAULT 0 CHECK(score_b BETWEEN 0 AND 99),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','completed')),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version>=0),
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(session_id,round_no,court_no)
);
CREATE INDEX IF NOT EXISTS idx_op_match_session ON open_play_matches(session_id,round_no,court_no);
