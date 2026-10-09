-- A draw batch first advances this revision, then replaces its schedule and audit.
-- The trigger makes a stale plan abort the entire D1 batch before any deletion.
CREATE TABLE IF NOT EXISTS division_draw_revisions (
  division_id TEXT PRIMARY KEY REFERENCES divisions(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  expected_revision INTEGER NOT NULL
);

CREATE TRIGGER IF NOT EXISTS group_draw_insert_guard
BEFORE INSERT ON division_draw_revisions
WHEN NEW.expected_revision<>COALESCE((
  SELECT revision FROM division_draw_revisions WHERE division_id=NEW.division_id
),0)
BEGIN SELECT RAISE(ABORT,'DRAW_VERSION_CONFLICT'); END;

CREATE TRIGGER IF NOT EXISTS group_draw_insert_history_guard
BEFORE INSERT ON division_draw_revisions
WHEN EXISTS (
    SELECT 1 FROM matches m WHERE m.division_id=NEW.division_id
      AND m.bracket_slot IS NULL AND (m.stage LIKE 'Bảng %' OR m.stage='Vòng bảng')
      AND (m.status IN ('live','completed','walkover') OR m.winner_team_id IS NOT NULL
        OR m.started_at IS NOT NULL OR m.current_score_a<>0 OR m.current_score_b<>0
        OR EXISTS(SELECT 1 FROM score_events e WHERE e.match_id=m.id)
        OR EXISTS(SELECT 1 FROM match_sets s WHERE s.match_id=m.id))
  )
BEGIN SELECT RAISE(ABORT,'GROUP_STAGE_ALREADY_STARTED'); END;

CREATE TRIGGER IF NOT EXISTS group_draw_update_guard
BEFORE UPDATE ON division_draw_revisions
WHEN NEW.expected_revision<>OLD.revision
BEGIN SELECT RAISE(ABORT,'DRAW_VERSION_CONFLICT'); END;

CREATE TRIGGER IF NOT EXISTS group_draw_update_history_guard
BEFORE UPDATE ON division_draw_revisions
WHEN EXISTS (
    SELECT 1 FROM matches m WHERE m.division_id=NEW.division_id
      AND m.bracket_slot IS NULL AND (m.stage LIKE 'Bảng %' OR m.stage='Vòng bảng')
      AND (m.status IN ('live','completed','walkover') OR m.winner_team_id IS NOT NULL
        OR m.started_at IS NOT NULL OR m.current_score_a<>0 OR m.current_score_b<>0
        OR EXISTS(SELECT 1 FROM score_events e WHERE e.match_id=m.id)
        OR EXISTS(SELECT 1 FROM match_sets s WHERE s.match_id=m.id))
  )
BEGIN SELECT RAISE(ABORT,'GROUP_STAGE_ALREADY_STARTED'); END;
