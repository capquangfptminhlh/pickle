ALTER TABLE divisions ADD COLUMN series_b_enabled INTEGER NOT NULL DEFAULT 0 CHECK (series_b_enabled IN (0,1));
ALTER TABLE divisions ADD COLUMN series_b_third_place_match INTEGER NOT NULL DEFAULT 0 CHECK (series_b_third_place_match IN (0,1));
ALTER TABLE matches ADD COLUMN bracket_series TEXT CHECK (bracket_series IN ('A','B'));
UPDATE matches SET bracket_series='A' WHERE bracket_slot IS NOT NULL;

CREATE TRIGGER bracket_settings_lock
BEFORE UPDATE OF format,advance_count,third_place_match,series_b_enabled,series_b_third_place_match ON divisions
WHEN (NEW.format IS NOT OLD.format OR NEW.advance_count IS NOT OLD.advance_count OR NEW.third_place_match IS NOT OLD.third_place_match OR NEW.series_b_enabled IS NOT OLD.series_b_enabled OR NEW.series_b_third_place_match IS NOT OLD.series_b_third_place_match)
  AND EXISTS (SELECT 1 FROM matches WHERE division_id=OLD.id AND bracket_slot IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'BRACKET_SETTINGS_LOCKED'); END;

-- Qualification plans and reset confirmations include branch configuration,
-- score rules and linkage, so a change during a read cannot commit stale teams.
DROP VIEW division_draw_reset_state;
CREATE VIEW division_draw_reset_state AS
SELECT d.id AS division_id, json_object(
  'division',json_array(d.id,d.tournament_id,d.name,d.format,d.advance_count,d.third_place_match,d.series_b_enabled,d.series_b_third_place_match,d.best_of,d.points_to_win,d.win_by_two,d.scoring_mode,d.relay_segment_points,d.relay_team_size,d.final_point_on_serve),
  'revision',COALESCE((SELECT revision FROM division_draw_revisions WHERE division_id=d.id),0),
  'matches',json((SELECT json_group_array(json_array(id,version,status,team_a_id,team_b_id,winner_team_id,stage,bracket_slot,bracket_series,court_id,referee_user_id,current_score_a,current_score_b,started_at,completed_at,next_match_id,next_match_side,loser_next_match_id,loser_next_match_side))
    FROM (SELECT * FROM matches WHERE division_id=d.id ORDER BY id))),
  'sets',json((SELECT json_group_array(json_array(id,match_id,set_no,score_a,score_b,completed))
    FROM (SELECT s.* FROM match_sets s JOIN matches m ON m.id=s.match_id WHERE m.division_id=d.id ORDER BY s.id))),
  'events',json((SELECT json_group_array(json_array(id,actor_user_id,undone_at))
    FROM (SELECT e.* FROM score_events e JOIN matches m ON m.id=e.match_id WHERE m.division_id=d.id ORDER BY e.id))),
  'groups',json((SELECT json_group_array(json_array(id,group_code,status))
    FROM (SELECT id,group_code,status FROM teams WHERE division_id=d.id ORDER BY id)))
) AS signature FROM divisions d;
