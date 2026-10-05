ALTER TABLE divisions ADD COLUMN tie_break_mode TEXT NOT NULL DEFAULT 'head_to_head';
ALTER TABLE divisions ADD COLUMN scoring_mode TEXT NOT NULL DEFAULT 'side_out';
ALTER TABLE divisions ADD COLUMN minimum_rest_minutes INTEGER NOT NULL DEFAULT 15;
ALTER TABLE divisions ADD COLUMN match_slot_minutes INTEGER NOT NULL DEFAULT 20;
