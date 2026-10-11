-- Reserve physical court/player occupancy inside the same transaction as the
-- score or assignment write. Called/on-deck matches are waiting queues; live
-- and warming-up matches occupy the court. Completed archival results do not.
-- Additive triggers preserve existing rows, including historical duplicates.
CREATE TRIGGER IF NOT EXISTS match_occupancy_insert_guard
BEFORE INSERT ON matches
WHEN NEW.status NOT IN ('completed','walkover','cancelled')
  AND (NEW.status='live' OR NEW.court_state IN ('warming_up','live'))
BEGIN
  SELECT RAISE(ABORT,'COURT_BUSY')
  WHERE NEW.court_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM matches occupied
    WHERE occupied.id<>NEW.id AND occupied.court_id=NEW.court_id
      AND occupied.status NOT IN ('completed','walkover','cancelled')
      AND (occupied.status='live' OR occupied.court_state IN ('warming_up','live'))
  );
  SELECT RAISE(ABORT,'PLAYER_BUSY')
  WHERE EXISTS (
    SELECT 1 FROM matches occupied
    WHERE occupied.id<>NEW.id
      AND occupied.status NOT IN ('completed','walkover','cancelled')
      AND (occupied.status='live' OR occupied.court_state IN ('warming_up','live'))
      AND (
        occupied.team_a_id IN (NEW.team_a_id,NEW.team_b_id)
        OR occupied.team_b_id IN (NEW.team_a_id,NEW.team_b_id)
        OR EXISTS (
          SELECT 1 FROM team_players requested
          JOIN team_players competing ON competing.player_id=requested.player_id
          WHERE requested.team_id IN (NEW.team_a_id,NEW.team_b_id)
            AND competing.team_id IN (occupied.team_a_id,occupied.team_b_id)
        )
      )
  );
END;

CREATE TRIGGER IF NOT EXISTS match_occupancy_update_guard
BEFORE UPDATE OF status,court_state,court_id,team_a_id,team_b_id ON matches
WHEN NEW.status NOT IN ('completed','walkover','cancelled')
  AND (NEW.status='live' OR NEW.court_state IN ('warming_up','live'))
  AND (
    OLD.status IN ('completed','walkover','cancelled')
    OR NOT (OLD.status='live' OR OLD.court_state IN ('warming_up','live'))
    OR (NEW.status='live' AND OLD.status<>'live')
    OR NEW.court_id IS NOT OLD.court_id
    OR NEW.team_a_id IS NOT OLD.team_a_id
    OR NEW.team_b_id IS NOT OLD.team_b_id
  )
BEGIN
  SELECT RAISE(ABORT,'COURT_BUSY')
  WHERE NEW.court_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM matches occupied
    WHERE occupied.id<>NEW.id AND occupied.court_id=NEW.court_id
      AND occupied.status NOT IN ('completed','walkover','cancelled')
      AND (occupied.status='live' OR occupied.court_state IN ('warming_up','live'))
  );
  SELECT RAISE(ABORT,'PLAYER_BUSY')
  WHERE EXISTS (
    SELECT 1 FROM matches occupied
    WHERE occupied.id<>NEW.id
      AND occupied.status NOT IN ('completed','walkover','cancelled')
      AND (occupied.status='live' OR occupied.court_state IN ('warming_up','live'))
      AND (
        occupied.team_a_id IN (NEW.team_a_id,NEW.team_b_id)
        OR occupied.team_b_id IN (NEW.team_a_id,NEW.team_b_id)
        OR EXISTS (
          SELECT 1 FROM team_players requested
          JOIN team_players competing ON competing.player_id=requested.player_id
          WHERE requested.team_id IN (NEW.team_a_id,NEW.team_b_id)
            AND competing.team_id IN (occupied.team_a_id,occupied.team_b_id)
        )
      )
  );
END;
