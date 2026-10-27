-- Additive, independent waitlist for Open Play. Contact details are never copied.
-- A waitlist is not a confirmed booking or a paid reservation.
CREATE TABLE IF NOT EXISTS open_play_waitlist (
  session_id TEXT NOT NULL REFERENCES open_play_sessions(id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  requested_by_user_id TEXT NOT NULL REFERENCES app_users(id),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','promoted','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(session_id,player_id)
);
CREATE INDEX IF NOT EXISTS idx_op_waitlist_order ON open_play_waitlist(session_id,status,created_at,player_id);
