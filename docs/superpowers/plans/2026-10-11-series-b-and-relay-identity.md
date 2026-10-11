# Serie B and valid same-grade relay teams

The user confirmed that entered player skill grades are correct and that repeated-grade teams should use their entered member order for relay A/B/C. Grade changes are not required. Retain existing unique-grade role recognition; fall back to the confirmed team order when grades repeat or are absent, show the actual skill grade separately from the relay position, and preserve current scores.

The user also requested an optional Serie B for third-place teams in each pool. Serie A keeps the configured main qualification count (normally Top 2). With four pools, Serie B has four qualifiers, two semifinals, a final and an optional bronze match. Both branches use the division's scoring format, independent advancement paths and separate third-place settings. Qualification uses confirmed final pool standings; preview labels must not present provisional qualifiers as final.

- [x] Update and test relay role recognition and score-card identities using the user's confirmed same-grade member order.
- [x] Add persisted Serie B setup and independent bracket generation, qualification and advancement with real Worker/SQLite regression tests.
- [x] Add setup, operator and public bracket views for both series, including preview behavior and readable labels.
- [x] Verify reset/recovery, same player/court guards and referee scoring remain compatible with two bracket branches.
- [x] Review the integrated diff, run appropriate build/API/browser checks, merge and deploy, then verify real deployed assets without changing tournament setup or results.

The CSV header defect discovered during diagnosis is separate from the user's confirmed direct-edit path. Preserve that evidence; do not use it to claim the cause of their current issue or invent player grades.

Local evidence, 2026-10-11:

- Final Worker regression suite: 1,376 passing, including the cross-series live-court guard.
- Actual local HTTP scenario: four completed pools, eight Serie A qualifiers, four rank-three Serie B qualifiers, twelve knockout/bronze matches. Concurrent generation creates one complete pair of branches; incomplete pools create neither. Both champions and bronze playoffs complete through score entry.
- Real Worker browser flows at 375px and 1440px, plus Top 1 at 375px: save Serie B configuration, generate both branches, public brackets, assigned referee Serie B point entry and Undo.
- Full timeout/identity browser matrix: admin 375/1440 and referee 320/375; repeated grades, saved member order, S2 serving, deadline countdown, reload, medical, failure, Undo/reset pass.
- Preview/series/theme tests: 21 passing. Relay identity/series/progress unit checks also pass.
- Independent review found and verified fixes for Top 1 qualifier display and PostgreSQL court/time collisions. Shared allocator checked over 80 A/B size/court combinations. PostgreSQL HTTP integration passed in CI 38120428688.
- Wrangler asset build and deployment dry run pass. Live tournament settings and results have not been changed by these tests.

- A final review caught the homepage using an older tie sort and PostgreSQL state omitting official standing ranks. Both now use the same authoritative standings as qualification. Local real Worker public-state scenarios confirm two-way head-to-head and a three-way mini-table order, including a case where aggregate point differential would select the wrong leader.
- Final standings commit b25bd34 passes series/relay tests (21), syntax checks and Wrangler build/dry run. Independent read-only review found no remaining actionable issue; PostgreSQL HTTP verification passed in CI 38120428688.

Release evidence, 2026-10-11:

- PR #30 merged as `3b4babd7472d7fc1a136d244385694f573dc9e3b`. Its file contents exactly match the tested PR head `b25bd34c6a626562966e4aaf0fed2e181c80cd61` (empty Git diff).
- Full desktop/mobile and PostgreSQL CI: run 38120428688, success. Actual PostgreSQL HTTP scenario reports 8 Serie A qualifiers, 4 Serie B qualifiers, 12 matches, independent champions/bronze, concurrent generation and incomplete-pool atomicity.
- Cloudflare branch preflight: run 38120944136, success, including real Wrangler/D1 migration and API tests.
- Main Cloudflare validation and deployment: run 38121327688, success. Remote migration `0018_series_b_brackets.sql` applied. Final Worker version `5d7edc5d-bb08-4e1a-aae1-b396a3c80fb6`, 2026-10-11T07:27:42Z.
- Live release verification: all 19 checked HTML/JS/CSS/service-worker assets match local built SHA256 digests; health/public-state return 200; separate series settings and persisted timeout schema are present; three anonymous admin/reset/timeout probes return 401.
- Live relay verification: all 16 existing MLP teams ready; 48 AB/BC/CA pair checks pass. Before/after public-state comparison confirms all 48 actual player grades, team IDs, rosters and current match results remain unchanged. Tests made zero authenticated production writes.
- Live 375px homepage renders both current tournaments without page errors and shows a visible 44px mobile login link.
- Existing tournament Serie B settings remain off by default. Operators can enable rank-three Serie B in the division/draw setup, with a separate optional bronze match, before generating branches. At least two pools with three active teams each and completed valid pool results are required.
