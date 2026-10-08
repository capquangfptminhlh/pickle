-- Players per team in a running-score relay. Pairs rotate cyclically
-- (3 players: AB, BC, CA; 4 players: AB, BC, CD, DA), so the game target is
-- relay_segment_points × relay_team_size. 0 = not a relay division.
ALTER TABLE divisions ADD COLUMN relay_team_size INTEGER NOT NULL DEFAULT 0
  CHECK (relay_team_size=0 OR relay_team_size BETWEEN 3 AND 4);
UPDATE divisions SET relay_team_size=points_to_win/relay_segment_points
  WHERE relay_segment_points>0 AND points_to_win%relay_segment_points=0
    AND points_to_win/relay_segment_points BETWEEN 3 AND 4;
