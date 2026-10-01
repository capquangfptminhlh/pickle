-- Audit first in the same batch: reject a metadata write if scoring changed the
-- match after the caller validated it. This guard does not modify existing data.
CREATE TRIGGER IF NOT EXISTS match_metadata_version_guard
BEFORE INSERT ON audit_logs
WHEN NEW.entity_type='match' AND NEW.action IN ('UPDATE_MATCH','ASSIGN_MATCH','DELETE_MATCH','CANCEL_MATCH')
  AND NEW.before_data IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM matches WHERE id=NEW.entity_id
      AND version=json_extract(NEW.before_data,'$.version')
  )
BEGIN SELECT RAISE(ABORT,'VERSION_CONFLICT'); END;
