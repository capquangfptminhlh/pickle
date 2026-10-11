# Serie B and valid same-grade relay teams

The user confirmed that entered player skill grades are correct and that repeated-grade teams should use their entered member order for relay A/B/C. Grade changes are not required. Retain existing unique-grade role recognition; fall back to the confirmed team order when grades repeat or are absent, show the actual skill grade separately from the relay position, and preserve current scores.

The user also requested an optional Serie B for third-place teams in each pool. Serie A keeps the configured main qualification count (normally Top 2). With four pools, Serie B has four qualifiers, two semifinals, a final and an optional bronze match. Both branches use the division's scoring format, independent advancement paths and separate third-place settings. Qualification uses confirmed final pool standings; preview labels must not present provisional qualifiers as final.

- [x] Update and test relay role recognition and score-card identities using the user's confirmed same-grade member order.
- [x] Add persisted Serie B setup and independent bracket generation, qualification and advancement with real Worker/SQLite regression tests.
- [x] Add setup, operator and public bracket views for both series, including preview behavior and readable labels.
- [x] Verify reset/recovery, same player/court guards and referee scoring remain compatible with two bracket branches.
- [ ] Review the integrated diff, run appropriate build/API/browser checks, merge and deploy, then verify real deployed assets without changing tournament setup or results.

The CSV header defect discovered during diagnosis is separate from the user's confirmed direct-edit path. Preserve that evidence; do not use it to claim the cause of their current issue or invent player grades.

Local evidence, 2026-10-11:

- Worker regression suite: 1,375 passing before the final cross-series court-guard addition; full final suite is required again before release.
- Actual local HTTP scenario: four completed pools, eight Serie A qualifiers, four rank-three Serie B qualifiers, twelve knockout/bronze matches. Concurrent generation creates one complete pair of branches; incomplete pools create neither. Both champions and bronze playoffs complete through score entry.
- Real Worker browser flows at 375px and 1440px, plus Top 1 at 375px: save Serie B configuration, generate both branches, public brackets, assigned referee Serie B point entry and Undo.
- Full timeout/identity browser matrix: admin 375/1440 and referee 320/375; repeated grades, saved member order, S2 serving, deadline countdown, reload, medical, failure, Undo/reset pass.
- Preview/series/theme tests: 20 passing. Relay identity/series/progress unit checks also pass.
- Independent review found and verified fixes for Top 1 qualifier display and PostgreSQL court/time collisions. Shared allocator checked over 80 A/B size/court combinations. PostgreSQL HTTP integration remains for CI.
- Wrangler asset build and deployment dry run pass. Live tournament settings and results have not been changed by these tests.
