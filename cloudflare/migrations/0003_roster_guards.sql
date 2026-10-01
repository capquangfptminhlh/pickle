-- Enforce membership during the write, including requests whose prechecks overlapped.
-- Existing records are preserved; no destructive cleanup is performed.
CREATE INDEX IF NOT EXISTS idx_team_players_player ON team_players(player_id,team_id);

CREATE TRIGGER IF NOT EXISTS roster_insert_conflict
BEFORE INSERT ON team_players
WHEN EXISTS (
  SELECT 1 FROM teams target JOIN teams other ON other.division_id=target.division_id
  JOIN team_players membership ON membership.team_id=other.id
  WHERE target.id=NEW.team_id AND target.status<>'withdrawn' AND other.status<>'withdrawn'
    AND other.id<>target.id AND membership.player_id=NEW.player_id
)
BEGIN SELECT RAISE(ABORT,'PLAYER_ALREADY_IN_DIVISION'); END;

CREATE TRIGGER IF NOT EXISTS roster_reactivate_conflict
BEFORE UPDATE OF status,division_id ON teams
WHEN NEW.status<>'withdrawn' AND (OLD.status='withdrawn' OR NEW.division_id<>OLD.division_id)
  AND EXISTS (
    SELECT 1 FROM team_players own JOIN team_players other ON other.player_id=own.player_id
    JOIN teams other_team ON other_team.id=other.team_id
    WHERE own.team_id=NEW.id AND other_team.id<>NEW.id
      AND other_team.division_id=NEW.division_id AND other_team.status<>'withdrawn'
  )
BEGIN SELECT RAISE(ABORT,'PLAYER_ALREADY_IN_DIVISION'); END;

CREATE TRIGGER IF NOT EXISTS roster_insert_count
BEFORE INSERT ON team_players
WHEN (SELECT COUNT(*) FROM team_players WHERE team_id=NEW.team_id)>=
  (SELECT CASE d.event_type WHEN 'singles' THEN 1 WHEN 'team' THEN 4 ELSE 2 END
   FROM teams t JOIN divisions d ON d.id=t.division_id WHERE t.id=NEW.team_id)
BEGIN SELECT RAISE(ABORT,'INVALID_PLAYER_COUNT'); END;

CREATE TRIGGER IF NOT EXISTS roster_insert_history_lock
BEFORE INSERT ON team_players
WHEN EXISTS (
  SELECT 1 FROM matches m WHERE (m.team_a_id=NEW.team_id OR m.team_b_id=NEW.team_id)
    AND (m.started_at IS NOT NULL OR m.status IN ('live','completed','walkover') OR m.winner_team_id IS NOT NULL
      OR m.current_score_a<>0 OR m.current_score_b<>0 OR EXISTS (SELECT 1 FROM match_sets s WHERE s.match_id=m.id))
)
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS roster_delete_history_lock
BEFORE DELETE ON team_players
WHEN EXISTS (
  SELECT 1 FROM matches m WHERE (m.team_a_id=OLD.team_id OR m.team_b_id=OLD.team_id)
    AND (m.started_at IS NOT NULL OR m.status IN ('live','completed','walkover') OR m.winner_team_id IS NOT NULL
      OR m.current_score_a<>0 OR m.current_score_b<>0 OR EXISTS (SELECT 1 FROM match_sets s WHERE s.match_id=m.id))
)
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;
