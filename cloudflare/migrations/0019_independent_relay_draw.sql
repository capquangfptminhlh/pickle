ALTER TABLE matches ADD COLUMN relay_order_a TEXT;
ALTER TABLE matches ADD COLUMN relay_order_b TEXT;
ALTER TABLE matches ADD COLUMN relay_drawn_at TEXT;

CREATE TABLE relay_draw_guards (
  match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  expected_version INTEGER NOT NULL,
  expected_lineup TEXT NOT NULL
);
CREATE TRIGGER relay_draw_guard_version BEFORE INSERT ON relay_draw_guards
BEGIN
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM matches WHERE id=NEW.match_id AND version=NEW.expected_version)
    THEN RAISE(ABORT,'VERSION_CONFLICT') END;
  SELECT CASE WHEN NEW.expected_lineup IS NOT (SELECT json_group_array(json_array(team_id,player_id,slot_no,full_name,skill_level,active,team_name)) FROM
    (SELECT tp.team_id,tp.player_id,tp.slot_no,p.full_name,p.skill_level,p.active,t.name AS team_name FROM team_players tp JOIN players p ON p.id=tp.player_id JOIN teams t ON t.id=tp.team_id
     WHERE tp.team_id IN (SELECT team_a_id FROM matches WHERE id=NEW.match_id UNION SELECT team_b_id FROM matches WHERE id=NEW.match_id) ORDER BY tp.team_id,tp.player_id))
    THEN RAISE(ABORT,'VERSION_CONFLICT') END;
  SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.id=NEW.match_id AND d.relay_team_size=3 AND d.relay_segment_points>0)
    THEN RAISE(ABORT,'RELAY_DRAW_UNSUPPORTED') END;
  SELECT CASE WHEN (SELECT count(*) FROM teams t JOIN matches m ON t.id IN (m.team_a_id,m.team_b_id) AND t.division_id=m.division_id
    WHERE m.id=NEW.match_id AND m.team_a_id<>m.team_b_id AND t.status='active'
    AND (SELECT count(*) FROM team_players tp WHERE tp.team_id=t.id)=3
    AND (SELECT count(*) FROM team_players tp JOIN players p ON p.id=tp.player_id WHERE tp.team_id=t.id AND p.active=1)=3)<>2
    THEN RAISE(ABORT,'RELAY_PARTICIPANTS_REQUIRED') END;
  SELECT CASE WHEN EXISTS (SELECT 1 FROM matches WHERE id=NEW.match_id AND
    (started_at IS NOT NULL OR status IN ('live','completed','walkover','cancelled') OR winner_team_id IS NOT NULL OR current_score_a<>0 OR current_score_b<>0))
    OR EXISTS (SELECT 1 FROM match_sets WHERE match_id=NEW.match_id)
    OR EXISTS (SELECT 1 FROM score_events WHERE match_id=NEW.match_id)
    THEN RAISE(ABORT,'RELAY_DRAW_LOCKED') END;
END;

CREATE TRIGGER relay_draw_participant_change AFTER UPDATE OF team_a_id,team_b_id ON matches
WHEN NEW.team_a_id IS NOT OLD.team_a_id OR NEW.team_b_id IS NOT OLD.team_b_id
BEGIN UPDATE matches SET relay_order_a=NULL,relay_order_b=NULL,relay_drawn_at=NULL WHERE id=NEW.id; END;

CREATE TRIGGER relay_draw_roster_insert AFTER INSERT ON team_players
BEGIN UPDATE matches SET relay_order_a=NULL,relay_order_b=NULL,relay_drawn_at=NULL,version=version+1
 WHERE (team_a_id=NEW.team_id OR team_b_id=NEW.team_id) AND (relay_order_a IS NOT NULL OR relay_order_b IS NOT NULL); END;
CREATE TRIGGER relay_draw_roster_delete AFTER DELETE ON team_players
BEGIN UPDATE matches SET relay_order_a=NULL,relay_order_b=NULL,relay_drawn_at=NULL,version=version+1
 WHERE (team_a_id=OLD.team_id OR team_b_id=OLD.team_id) AND (relay_order_a IS NOT NULL OR relay_order_b IS NOT NULL); END;
CREATE TRIGGER relay_draw_roster_update AFTER UPDATE OF player_id,slot_no,team_id ON team_players
WHEN NEW.player_id IS NOT OLD.player_id OR NEW.slot_no IS NOT OLD.slot_no OR NEW.team_id IS NOT OLD.team_id
BEGIN UPDATE matches SET relay_order_a=NULL,relay_order_b=NULL,relay_drawn_at=NULL,version=version+1
 WHERE (team_a_id IN (OLD.team_id,NEW.team_id) OR team_b_id IN (OLD.team_id,NEW.team_id)) AND (relay_order_a IS NOT NULL OR relay_order_b IS NOT NULL); END;

-- Service/timeout actions at 0–0 are history too, including undone events.
CREATE TRIGGER relay_roster_insert_history BEFORE INSERT ON team_players
WHEN EXISTS (SELECT 1 FROM matches m JOIN score_events e ON e.match_id=m.id WHERE NEW.team_id IN (m.team_a_id,m.team_b_id))
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;
CREATE TRIGGER relay_roster_delete_history BEFORE DELETE ON team_players
WHEN EXISTS (SELECT 1 FROM matches m JOIN score_events e ON e.match_id=m.id WHERE OLD.team_id IN (m.team_a_id,m.team_b_id))
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;
CREATE TRIGGER relay_roster_update_history BEFORE UPDATE OF team_id,player_id,slot_no ON team_players
WHEN (NEW.team_id IS NOT OLD.team_id OR NEW.player_id IS NOT OLD.player_id OR NEW.slot_no IS NOT OLD.slot_no)
 AND EXISTS (SELECT 1 FROM matches m JOIN score_events e ON e.match_id=m.id WHERE OLD.team_id IN (m.team_a_id,m.team_b_id) OR NEW.team_id IN (m.team_a_id,m.team_b_id))
BEGIN SELECT RAISE(ABORT,'TEAM_ROSTER_LOCKED'); END;
