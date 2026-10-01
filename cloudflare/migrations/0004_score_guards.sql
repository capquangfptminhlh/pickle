-- Scoring batches insert their event first. Abort the entire batch if source,
-- downstream version/history, or original undo event changed after its reads.
-- Events produced by older workers omit expectedVersion and remain compatible.
CREATE TRIGGER IF NOT EXISTS scoring_event_source_guard
BEFORE INSERT ON score_events
WHEN json_type(NEW.payload,'$.expectedVersion') IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM matches WHERE id=NEW.match_id
      AND version=json_extract(NEW.payload,'$.expectedVersion')
  ) THEN RAISE(ABORT,'VERSION_CONFLICT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.payload,'$.guardVersions') g
    WHERE NOT EXISTS (
      SELECT 1 FROM matches m WHERE m.id=json_extract(g.value,'$.id')
        AND m.version=json_extract(g.value,'$.version')
    )
  ) THEN RAISE(ABORT,'VERSION_CONFLICT') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.payload,'$.guardVersions') g
    JOIN matches m ON m.id=json_extract(g.value,'$.id')
    WHERE json_extract(g.value,'$.requireUnstarted')=1
      AND (m.started_at IS NOT NULL OR m.status IN ('live','completed','walkover','cancelled')
        OR m.winner_team_id IS NOT NULL OR m.current_score_a<>0 OR m.current_score_b<>0
        OR EXISTS (SELECT 1 FROM match_sets s WHERE s.match_id=m.id)
        OR EXISTS (SELECT 1 FROM score_events e WHERE e.match_id=m.id))
  ) THEN RAISE(ABORT,'DOWNSTREAM_MATCH_LOCKED') END;

  SELECT CASE WHEN json_type(NEW.payload,'$.undoEventId') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM score_events e WHERE e.id=json_extract(NEW.payload,'$.undoEventId')
      AND e.match_id=NEW.match_id AND e.event_type<>'UNDO' AND e.undone_at IS NULL
  ) THEN RAISE(ABORT,'VERSION_CONFLICT') END;
END;
