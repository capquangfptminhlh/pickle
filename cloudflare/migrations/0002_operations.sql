PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS rating_history (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  match_id TEXT,
  before_rating REAL,
  delta REAL,
  after_rating REAL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS club_events (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL DEFAULT 'social'
    CHECK (event_type IN ('social','training','match','meeting','other')),
  venue TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT,
  max_participants INTEGER,
  fee REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','live','completed','cancelled')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS club_event_attendance (
  event_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered','attended','absent','cancelled')),
  checked_in_at TEXT,
  checked_in_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,player_id),
  FOREIGN KEY(event_id) REFERENCES club_events(id) ON DELETE CASCADE,
  FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
  FOREIGN KEY(checked_in_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS club_transactions (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('income','expense')),
  category TEXT NOT NULL DEFAULT 'other',
  amount REAL NOT NULL CHECK (amount > 0),
  note TEXT,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS court_bookings (
  id TEXT PRIMARY KEY,
  court_id TEXT NOT NULL,
  title TEXT NOT NULL,
  contact_name TEXT,
  contact_phone TEXT,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','cancelled','completed')),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(court_id) REFERENCES courts(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES app_users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_rating_history_player ON rating_history(player_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_events_club_start ON club_events(club_id,start_at DESC);
CREATE INDEX IF NOT EXISTS idx_club_attendance_player ON club_event_attendance(player_id);
CREATE INDEX IF NOT EXISTS idx_club_transactions_club_date ON club_transactions(club_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_court_time ON court_bookings(court_id,start_at,end_at);
