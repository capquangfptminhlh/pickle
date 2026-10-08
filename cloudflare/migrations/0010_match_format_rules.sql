-- Running-score team format ("chạy điểm"): one game to points_to_win where the
-- on-court pair rotates every relay_segment_points (e.g. AB to 9, BC to 18, CA to 27).
ALTER TABLE divisions ADD COLUMN relay_segment_points INTEGER NOT NULL DEFAULT 0
  CHECK (relay_segment_points>=0 AND relay_segment_points<=99);
-- Rally scoring variant: the game-winning point only counts for the serving side.
ALTER TABLE divisions ADD COLUMN final_point_on_serve INTEGER NOT NULL DEFAULT 0
  CHECK (final_point_on_serve IN (0,1));
-- Single elimination: semifinal losers play off for a single third place.
ALTER TABLE divisions ADD COLUMN third_place_match INTEGER NOT NULL DEFAULT 0
  CHECK (third_place_match IN (0,1));
