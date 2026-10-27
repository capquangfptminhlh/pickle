-- Independent Open Play scheduling and attendance; no writes to tournament score or bracket tables.
CREATE TABLE IF NOT EXISTS open_play_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  organizer_user_id TEXT NOT NULL REFERENCES app_users(id),
  club_id TEXT REFERENCES clubs(id),
  starts_at TEXT NOT NULL,
  court_label TEXT,
  max_players INTEGER NOT NULL CHECK(max_players BETWEEN 2 AND 256),
  max_combined_rating REAL NOT NULL CHECK(max_combined_rating >= 2 AND max_combined_rating <= 16),
  tolerance REAL NOT NULL DEFAULT 0 CHECK(tolerance >= 0 AND tolerance <= 0.5),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_open_play_organizer_time ON open_play_sessions(organizer_user_id,starts_at);

CREATE TABLE IF NOT EXISTS open_play_registrations (
  session_id TEXT NOT NULL REFERENCES open_play_sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  registered_by_user_id TEXT NOT NULL REFERENCES app_users(id),
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(session_id,player_id)
);
CREATE INDEX IF NOT EXISTS idx_open_play_registrations_status ON open_play_registrations(session_id,status);
