-- Stage rules are opt-in on existing competitions to preserve their real match histories.
ALTER TABLE divisions ADD COLUMN stage_rules_enabled INTEGER NOT NULL DEFAULT 0 CHECK(stage_rules_enabled IN (0,1));
ALTER TABLE divisions ADD COLUMN final_format TEXT NOT NULL DEFAULT 'single_15' CHECK(final_format IN ('best3_11','single_15'));
