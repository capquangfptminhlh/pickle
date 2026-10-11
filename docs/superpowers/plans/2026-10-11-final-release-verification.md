# Final release verification requested by the owner

The owner requested one final comprehensive test run. Production scoring and tournament mutations were excluded: actual point entry and administrative writes ran against isolated real Worker/SQLite fixtures, and PostgreSQL HTTP integration runs in CI.

The previous full CI 38122509648 stopped on an obsolete assertion in `mlp-court-control-ui.mjs`: it opened a completed match but expected the active AB pair. The current application correctly displays the complete finished team. Commit `a04ac3b45e18961256cbcc163d958dd110d8ec7e` updates the test to verify full completed names, a hidden active-pair banner and disabled rally controls, then restores a live fixture and verifies AB/BC/CA. This is a test-only change; deployed application code is unchanged.

Fresh local evidence, 2026-10-11:

| Scope | Result |
| --- | --- |
| Worker API/business-rule regression suite | 1,376 passing, 0 failed |
| Root browser/logic unit suite, including network ordering, motion and offline behavior | 111 passing, 0 failed |
| Full MLP championship | 16 teams, 48 players, 24 pool and 12 A/B knockout/bronze matches completed; independent champions, correct relay names, persisted final points and public results verified |
| Account/referee management | Admin and Organizer at desktop/mobile; username-only account creation and assigned tournament scope verified |
| Operator center | Dashboard entry, setup with zero courts and referee creation; Admin/Organizer desktop/mobile pass |
| Draw reset | Cancel, stale score protection, archive and redraw; Admin/Organizer desktop/mobile pass |
| Court scheduling | New pools and existing knockout schedules; Admin/Organizer desktop/mobile pass |
| Timeout and roster identities | Admin 375/1440 and referee 320/375; S2, persisted deadline, one-minute countdown, refresh/reload, expiry, medical, failure and Undo/reset pass |
| Complete tournament lifecycle | Singles 11, doubles 15, MLP 27, doubles Best of 3 at 11; actual account login, configuration, registrations, draw, referee creation/login/assignment, scoring, pools, qualification, final and public champion pass |
| Scoring console | Desktop/mobile; finish-set, quick score, completed locks, Undo and stale-version rejection pass |
| Referee arena | Normal/reduced motion; score, Undo, refresh, API failure, service, relay, finish/special result and eight responsive/theme layouts pass |
| Four-court control | Completed versus active relay names and four-court/TV board flow pass with corrected fixture |
| Design and legacy recovery | Legacy JSON recovery, Admin/Organizer responsive design, and public/Preview pages in dark and light themes pass |
| Build | Wrangler asset build and deployment dry run pass |

Live read-only checks:

- All 21 checked production HTML/JS/CSS/service-worker assets match local built SHA256 digests. Health 200 and three unauthorized protected endpoint checks 401.
- All 16 actual MLP rosters resolve correctly across 48 AB/BC/CA checks. Actual player grades, team identities and entered rosters match the previous baseline.
- Public home, both tournaments and an actual QR match checked at 375px and 1440px: correct tournament/team names, visible login, no scoring controls, no page JavaScript errors or failed script/stylesheet responses, and no detail-page horizontal overflow.
- Live state now contains 24 pending matches; the earlier zero-match snapshot is stale and cannot be used to assert unchanged match data during this run. The test processes made zero authenticated production writes.

Full CI [38123415084](https://github.com/capquangfptminhlh/pickle/actions/runs/38123415084), on `a04ac3b45e18961256cbcc163d958dd110d8ec7e`, completed successfully. All desktop/mobile browser regressions, syntax/design guards, PostgreSQL migration/seed, authenticated login, end-to-end operations, registry API/Preview regressions and the final browser smoke test passed. This supersedes the failed obsolete-assertion run 38122509648 and the earlier pending-CI checkpoint in the completed-score release report.

Detailed local outputs and the full successful CI log are retained in ignored `scratch/final-*.log`; production/browser screenshots are in `ui-artifacts/`. No application-code change or new deployment was needed in this final test run; the verified production release remains Worker version `eb5d4e74-8524-4fe7-9f19-2a328e4f72fc`.
