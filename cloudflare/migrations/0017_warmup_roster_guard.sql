-- Physical occupancy depends on the lineup as well as the match row. Freeze
-- membership while warming up, including writes racing the court-state change.
-- Existing roster history locks remain in effect; queued teams stay editable.
CREATE TRIGGER IF NOT EXISTS roster_insert_occupancy_lock
BEFORE INSERT ON team_players
WHEN EXISTS (
  SELECT 1 FROM matches m WHERE NEW.team_id IN (m.team_a_id,m.team_b_id)
    AND m.status NOT IN ('completed','walkover','cancelled')
    AND (m.status='live' OR m.court_state IN ('warming_up','live'))
)
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS roster_delete_occupancy_lock
BEFORE DELETE ON team_players
WHEN EXISTS (
  SELECT 1 FROM matches m WHERE OLD.team_id IN (m.team_a_id,m.team_b_id)
    AND m.status NOT IN ('completed','walkover','cancelled')
    AND (m.status='live' OR m.court_state IN ('warming_up','live'))
)
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;

CREATE TRIGGER IF NOT EXISTS roster_update_lineup_lock
BEFORE UPDATE OF team_id,player_id,slot_no ON team_players
WHEN (NEW.team_id IS NOT OLD.team_id OR NEW.player_id IS NOT OLD.player_id OR NEW.slot_no IS NOT OLD.slot_no)
  AND EXISTS (
    SELECT 1 FROM matches m
    WHERE (OLD.team_id IN (m.team_a_id,m.team_b_id) OR NEW.team_id IN (m.team_a_id,m.team_b_id))
      AND (m.started_at IS NOT NULL OR m.status IN ('live','completed','walkover') OR m.winner_team_id IS NOT NULL
        OR m.current_score_a<>0 OR m.current_score_b<>0 OR EXISTS (SELECT 1 FROM match_sets s WHERE s.match_id=m.id)
        OR (m.status NOT IN ('completed','walkover','cancelled') AND m.court_state IN ('warming_up','live')))
  )
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;
