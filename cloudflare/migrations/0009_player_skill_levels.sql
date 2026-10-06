ALTER TABLE players ADD COLUMN skill_level TEXT NOT NULL DEFAULT 'B'
  CHECK (skill_level IN ('A+','A','B+','B','C+','C'));

CREATE INDEX IF NOT EXISTS idx_players_skill_level ON players(skill_level,full_name);
