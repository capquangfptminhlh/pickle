# Reset entry on bracket screen

User reported they cannot see reset on the bracket screen and confirmed full group/schedule reset, not knockout-only removal. Existing reset works from tournament detail and has an archive, stale-state guard, role checks and typed confirmation. Add per-division buttons on bracket screen with tournament/division names and explicit full-history scope, using existing data-reset-draw handler. No production reset performed by this code change.

Regression: browser entry test timed out finding reset button before change. Verify admin/organizer desktop/mobile open/cancel, wrong confirmation, stale-score rejection, archive/reset and new draw through existing real Worker test. Cache version updated.
