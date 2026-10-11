# Prestart verification at 2026-10-11 08:40 UTC

The owner requested another check immediately before the tournament. Fresh checks passed: all 1,376 Worker tests; actual username-only referee account management on desktop/mobile; persisted one-minute timeout and S2/identity matrix; referee score/Undo/failure/completion behavior across responsive/theme layouts; four-court control; and another complete 16-team, 48-player, 36-match MLP Serie A/B championship simulation. Production assets (21 SHA256 comparisons), public pages/QR at 375px and 1440px, health/authentication boundaries and all 48 relay pair recognitions also pass. Application code has not changed since the successful full CI 38123415084.

Live configuration was checked separately, not inferred from passing tests:

- 16 teams in four groups of four. All 24 unique round-robin matches exist, six per group, with no duplicate or cross-group pairing.
- Group A uses Sân 1, B uses Sân 2, C uses Sân 3 and D uses Sân 4.
- All 24 live pool matches currently have **no referee assignment**. The server allows a referee to enter points only when their account is assigned to that match and within tournament scope. This is an outstanding operational prerequisite for referee scoring, not a failed scoring calculation.
- All 24 matches have no scheduled timestamp; they can be called manually, but public scheduled times remain unset.
- Rules: one game to 27, rally scoring, no win-by-two, relay segments of 9 with three players, final point requires service. Serie A takes Top 2; rank-three Serie B is enabled. Serie A bronze is enabled; Serie B bronze is disabled.
- No authenticated production writes were made; account, point and finish mutations used isolated fixtures. Actual referee identities/court mapping were not guessed or changed.

Detailed current readiness state and test outputs are retained in ignored `scratch/prestart-live-readiness.json`, `scratch/prestart-*.log`, and `scratch/prestart-production-public.log`. Test success does not mean the live referee assignments have been completed; report that prerequisite to the operator before starting.
