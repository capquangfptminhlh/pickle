# Tournament operations audit — 11 October 2026

This release targets the production Cloudflare Worker and the organizer/referee screens. All destructive scenarios used synthetic local tournaments; the production checks were read-only.

## Reproduced defects and resulting behavior

| Trigger | Result after the fix | Regression evidence |
| --- | --- | --- |
| Rally doubles, mixed doubles or MLP: choose A-S2/B-S2 | Both players can be selected, exactly one service button is active, and the selected player's name is shown. Singles keep one server. Same-side rally wins preserve the selected server. | `timeout-clock.test.mjs`, `registry-timeout-clock-ui.mjs` |
| Standard timeout; refresh or reopen scoring | A server-persisted 60-second deadline drives the countdown in both consoles. It reaches `00:00` without polling every second. Undo restores the previous clock; scoring/reset/completion clears it as appropriate. Old audit events remain reversible. | Timer Worker tests and four real Worker browser layouts: admin 375/1440, referee 320/375 |
| Auto-seed with fractional/out-of-range group count or after a schedule exists | Reject invalid input and require the explicit reset flow to redraw existing schedules. Round-robin generation cannot overwrite played history or knockout matches. Successful changes are audited atomically. | `group-operations-safety.test.mjs`: 71 cases |
| Assign court/time across divisions or replan during the event | Respect other divisions' reservations, shared players and rest periods. Preserve called/active/scored matches. Plan from the later of current time and future tournament start, and reject stale reservation snapshots atomically. | `court-scheduling-safety.test.mjs`, eight organizer/admin browser cases |
| Two matches start or warm up on the same court/shared player | Only one physical occupant is accepted. Conflicting score, assignment, Undo and reset writes roll back without partial events/audits. Called/on-deck queues remain available. | `live-court-guard.test.mjs`: 23 cases; real Wrangler/D1 HTTP concurrency scenario |
| Change members while warming up, including a concurrent warmup transition | Freeze the lineup atomically. No member, team metadata or audit from a rejected replacement is committed. Basic team information remains editable. | `warmup-roster-guard.test.mjs`: six cases; real Wrangler/D1 roster PATCH |
| Imported walkover or legacy winner/loser bracket in state | Count valid walkover wins/losses without fabricating set scores. Exclude knockout stages from pool standings and ignore invalid legacy winners or self-matches. Existing two-way and three-way tie rules remain unchanged. | State standings and shared tie-break regressions |
| Close reset dialog while preview is loading | Closing cannot write a reset or reopen the dialog when the late response arrives. Browser checks wait for the actual loaded confirmation. | `registry-draw-reset-ui.mjs`: admin/organizer, desktop/mobile |

## Verification and delivery

- Full Worker regression suite: **1,355 passing**, including 36 scheduling, 71 group-operation, 23 live-occupancy and 23 timeout cases. Client/network/realtime/PWA suites: **93 passing**. Account/operator/role/scoring/referee/legacy/avatar flows and light/dark/reduced-motion browser checks also passed.
- The complete lifecycle suite covers singles 11, doubles 15, MLP 27 (AB → BC → CA), and Best of 3, including referee creation/login, assignment, pools, qualification, finals and public champion.
- All ten local Wrangler/D1 HTTP suites passed: smoke, permissions, registry, accounts, operations, public privacy, legacy import, bracket, reset and court safety. They cover cross-division scheduling, simultaneous starts, timeout persistence and Undo, warmup roster rejection, bracket generation and reset/archive/redraw.
- CI exposed two test-harness assumptions: an Undo-restored live match was left open before reusing its players, and successive timeout errors left two valid alerts visible. Scenarios now finish prior play and wait for the actual rejected request and counter updates; application safety guards remain enabled.
- Both dependency audits report zero vulnerabilities. Static assets build and Wrangler deployment dry-run succeed.
- Independent spec and code reviews are required before merge; confirmed findings receive reproducing regression tests before fixes.
- CI runs the new browser checks and D1 HTTP checks. Deployment applies additive migrations `0015`, `0016` and `0017` before publishing the Worker. Cache version `pickleup-v66-tournament-clock-20261011` includes the exact new console/clock assets.

## Limits

The authenticated write flows above ran against isolated SQLite/D1, not the user's live tournament. No real accounts, groups or scores were changed for testing. Production public pages were checked at 1440px and 375px. This evidence does not establish that every application flow or every network/device combination is error-free.

Medical timeout retains its existing usage counter; no medical duration was supplied, so the one-minute clock applies to ordinary timeout only. Scheduling estimates when an active court will be free; the physical occupancy guard still requires the previous match to actually leave that court. The new database protections and persisted timeout belong to the Cloudflare backend; the separate PostgreSQL/preview implementations are not given equivalent timer persistence by this release.

## Repeat the added checks

```powershell
node scripts/registry-court-scheduling-ui.mjs
node scripts/registry-timeout-clock-ui.mjs
node scripts/registry-draw-reset-ui.mjs
node scripts/registry-lifecycle-ui.mjs
node --test scripts/registry-realtime.test.mjs
```

In `cloudflare/`, run `npm test`, `npm run check`, and local migrations before the HTTP integration tests. `registry-court-safety-api.mjs` refuses non-local targets.
