-- The ordinary timeout deadline survives refreshes and score-event reversals.
-- Existing timeout counts and medical timeout behavior remain intact.
ALTER TABLE matches ADD COLUMN timeout_side TEXT CHECK(timeout_side IN ('A','B'));
ALTER TABLE matches ADD COLUMN timeout_started_at TEXT;
ALTER TABLE matches ADD COLUMN timeout_ends_at TEXT;
