ALTER TABLE team_players ADD COLUMN slot_no INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_players_team_slot
ON team_players(team_id,slot_no)
WHERE slot_no IS NOT NULL;
