-- Preserve historical brackets, including duplicate slots, while preventing
-- competing generation batches from inserting the same division slot again.
CREATE TRIGGER IF NOT EXISTS bracket_generation_slot_guard
BEFORE INSERT ON matches
WHEN NEW.bracket_slot IS NOT NULL AND EXISTS (
  SELECT 1 FROM matches
  WHERE division_id=NEW.division_id AND bracket_slot=NEW.bracket_slot
)
BEGIN SELECT RAISE(ABORT,'BRACKET_ALREADY_EXISTS'); END;
