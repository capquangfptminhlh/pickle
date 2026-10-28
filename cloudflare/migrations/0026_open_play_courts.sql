-- Organizer/club-scoped physical court directory, isolated from tournament courts.
-- Reservation time is UTC ISO-8601. [start,end) allows adjacent bookings.
CREATE TABLE IF NOT EXISTS open_play_venue_courts (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES app_users(id),
  club_id TEXT REFERENCES clubs(id),
  name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  UNIQUE(owner_user_id,name)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_op_club_unique_court
  ON open_play_venue_courts(club_id,name) WHERE club_id IS NOT NULL;
-- One atomic reservation header per session prevents two simultaneous plans for the same event.
CREATE TABLE IF NOT EXISTS open_play_court_reservations (
  session_id TEXT PRIMARY KEY REFERENCES open_play_sessions(id) ON DELETE CASCADE,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
  created_by TEXT NOT NULL REFERENCES app_users(id),
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS open_play_court_bookings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES open_play_court_reservations(session_id) ON DELETE CASCADE,
  court_id TEXT NOT NULL REFERENCES open_play_venue_courts(id),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','released')),
  created_by TEXT NOT NULL REFERENCES app_users(id),
  created_at TEXT NOT NULL,
  CHECK(starts_at<ends_at),
  UNIQUE(session_id,court_id)
);
CREATE INDEX IF NOT EXISTS idx_op_court_availability
  ON open_play_court_bookings(court_id,status,starts_at,ends_at);
-- Never trust a preflight availability query: enforce overlaps in SQLite so
-- concurrent confirmations cannot double-book the same internal court.
CREATE TRIGGER IF NOT EXISTS trg_op_booking_no_overlap
BEFORE INSERT ON open_play_court_bookings
WHEN NEW.status='active' AND EXISTS (
 SELECT 1 FROM open_play_court_bookings old
 WHERE old.court_id=NEW.court_id AND old.status='active'
   AND old.starts_at<NEW.ends_at AND old.ends_at>NEW.starts_at
)
BEGIN SELECT RAISE(ABORT,'OPEN_PLAY_COURT_TIME_CONFLICT'); END;
CREATE TRIGGER IF NOT EXISTS trg_op_booking_update_no_overlap
BEFORE UPDATE OF starts_at,ends_at,status,court_id ON open_play_court_bookings
WHEN NEW.status='active' AND EXISTS (
 SELECT 1 FROM open_play_court_bookings old
 WHERE old.id<>NEW.id AND old.court_id=NEW.court_id AND old.status='active'
   AND old.starts_at<NEW.ends_at AND old.ends_at>NEW.starts_at
)
BEGIN SELECT RAISE(ABORT,'OPEN_PLAY_COURT_TIME_CONFLICT'); END;
