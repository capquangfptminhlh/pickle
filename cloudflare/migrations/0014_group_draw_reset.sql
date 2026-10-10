-- The same ordered signature is read for confirmation and checked inside the
-- reset batch. Include history even when a cancelled match has no current score.
CREATE VIEW IF NOT EXISTS division_draw_reset_state AS
SELECT d.id AS division_id, json_object(
  'division',json_array(d.id,d.tournament_id,d.name),
  'revision',COALESCE((SELECT revision FROM division_draw_revisions WHERE division_id=d.id),0),
  'matches',json((SELECT json_group_array(json_array(id,version,status,team_a_id,team_b_id,winner_team_id,stage,bracket_slot,court_id,referee_user_id,current_score_a,current_score_b,started_at,completed_at))
    FROM (SELECT * FROM matches WHERE division_id=d.id ORDER BY id))),
  'sets',json((SELECT json_group_array(json_array(id,match_id,set_no,score_a,score_b,completed))
    FROM (SELECT s.* FROM match_sets s JOIN matches m ON m.id=s.match_id WHERE m.division_id=d.id ORDER BY s.id))),
  -- Event payloads are immutable after insertion and can total many megabytes.
  -- Event identity, actor FK and undo state detect scoring API changes without
  -- building a signature larger than D1's string/row limit.
  'events',json((SELECT json_group_array(json_array(id,actor_user_id,undone_at))
    FROM (SELECT e.* FROM score_events e JOIN matches m ON m.id=e.match_id WHERE m.division_id=d.id ORDER BY e.id))),
  'groups',json((SELECT json_group_array(json_array(id,group_code,status))
    FROM (SELECT id,group_code,status FROM teams WHERE division_id=d.id ORDER BY id)))
) AS signature FROM divisions d;

CREATE TABLE IF NOT EXISTS division_draw_reset_guards (
  division_id TEXT PRIMARY KEY REFERENCES divisions(id) ON DELETE CASCADE,
  expected_signature TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS division_draw_reset_guard
BEFORE INSERT ON division_draw_reset_guards
WHEN NEW.expected_signature IS NOT (
  SELECT signature FROM division_draw_reset_state WHERE division_id=NEW.division_id
)
BEGIN SELECT RAISE(ABORT,'DRAW_RESET_CONFLICT'); END;
