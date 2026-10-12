CREATE TABLE IF NOT EXISTS tournament_photos (
  id TEXT PRIMARY KEY,
  tournament_id TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tournament_photos_tour ON tournament_photos(tournament_id);

ALTER TABLE tournaments ADD COLUMN album_url TEXT;
