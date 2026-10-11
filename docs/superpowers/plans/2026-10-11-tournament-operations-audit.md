# Tournament Operations Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Reproduce and fix tournament-day defects, then verify organizer, referee and public flows through the browser and Worker.

**Architecture:** Keep Cloudflare as the production backend and reuse its authorization, version guards and shared scoring rules. Test destructive actions only with synthetic local data. Independent confirmed defects can be fixed in separate file scopes.

**Tech Stack:** JavaScript, Cloudflare Worker/D1, Node SQLite fixtures, Playwright, GitHub Actions.

---

### Task 1: Inventory and baseline

- [x] Read project governance and relevant debugging skills.
- [x] Inspect current CI failure and run the existing Worker suite: `cd cloudflare; npm test` (1,190 passing).
- [x] Reproduce decimal group count acceptance, regrouping after scoring and double booking across divisions with `node scratch/audit-reproduce.mjs`.
- [x] Inspect standings, score reversals, account permissions, public pages and complete lifecycle coverage.

### Task 2: Safe legacy group operations

**Files:** `cloudflare/src/index.js` (auto-seed/generate-round-robin routes), new `cloudflare/tests/group-operations-safety.test.mjs`.

- [x] Add failing Worker tests for `groupCount: 2.5`, `0`, `27`, nonnumeric values, changes after a point/undo/set/completion, bracket existence, and concurrent changes.
- [x] Require integer group counts within 1..26. Reject reseeding existing schedules and generation after play; preserve all data on rejection.
- [x] Use the existing division signature guard to reject changes between read and batch. Record successful legacy operations in audit logs.
- [x] Run `node --test cloudflare/tests/group-operations-safety.test.mjs cloudflare/tests/draw-reset.test.mjs` and existing draw suites.

### Task 3: Safe court scheduling

**Files:** new `cloudflare/src/court-scheduling.js`, route in `cloudflare/src/index.js`, new `cloudflare/tests/court-scheduling-safety.test.mjs`.

- [x] Add failing tests with two divisions using the same court/time, the same player in different divisions, active/called matches, concurrent scoring and partial write failure.
- [x] Schedule pending matches against existing reservations in all tournament divisions. Keep rest periods for both teams and shared players. Preserve matches already called, warming up, started or holding scoring history.
- [x] Persist the complete plan and its audit in one guarded D1 batch; reject stale reservations rather than writing a partial schedule.
- [x] Run `node --test cloudflare/tests/court-scheduling-safety.test.mjs cloudflare/tests/tournament-core.test.mjs` and tournament-day scenarios.

- [x] Add migrations `0015_live_court_guard.sql` and `0017_warmup_roster_guard.sql` to reserve physical court/player occupancy and freeze warming-up rosters atomically. Exercise concurrent starts, roster replacement/append, Undo reopening, and rollback.
- [x] Resolve independent review findings: plan remaining matches from current time, preserve live/warmup occupancy through estimated release, and retain shared-player rest and future bookings. All three timing defects were reproduced before their fixes.

### Task 4: Standings and browser readiness

**Files:** `shared/standings.js`, `cloudflare/src/state.js`, standings regression tests, `scripts/registry-draw-reset-ui.mjs`.

- [x] Reproduce imported walkover results and legacy knockout stage classification through actual state APIs.
- [x] Add failing state/ranking tests before correcting confirmed discrepancies; keep existing two-way/three-way tie policy.
- [x] Replace immediate reset-dialog text assertions with waits for loaded confirmation controls. Exercise cancellation during loading with a delayed response.
- [x] Run standings and reset-browser regressions on desktop and mobile.

- [x] Reject malformed imported self-matches in total standings and player win/loss history, matching the shared mini-table policy; completed/walkover regressions failed before the fix.

### Task 5: Full validation and delivery

- [x] Run the full Worker suite, all registry browser scripts and client/network/realtime tests. Cover singles 11, doubles 15, relay 27, 16 teams/4 courts, draw/reset, account assignment and completion through finals.
- [x] Build assets and run Worker dry-run with `cd cloudflare; npm run check`.
- [ ] Obtain independent spec and code reviews, fix findings, then attach and merge the PR.
- [ ] Deploy the verified commit; check production health, anonymous permissions and exact deployed assets, without changing real tournament data.
- [x] Record concrete findings, test evidence and remaining limits in the audit report.

### Task 6: Referee service selection and one-minute timeout (user steering)

**Files:** scoring service and timer state in `cloudflare/src/scoring.js`, `cloudflare/src/state.js`, match JSON in `cloudflare/src/index.js`; additive `0016_match_timeout_clock.sql`; shared browser timer plus admin/referee bindings and browser tests.

- [x] Reproduce disabled S2 buttons in rally doubles/team mode. Permit both players while singles retain one player; show exactly the selected server and preserve that selection when the same side wins rally.
- [x] Persist standard timeout side, start and end timestamps using server time (60 seconds). Expose `timeoutClock: {side,startedAt,endsAt}` or null in state/mutation results. Medical timeout retains its existing count without inventing a duration.
- [x] Render the countdown from its deadline in both scoring screens; refresh/page reload cannot restart it. Undo/reset restore or clear the corresponding clock using audited snapshots, including older events without timer fields.
- [x] Exercise A-S2/B-S2, ordinary timeout countdown, refresh, expiration, Undo/reset and failure on desktop/mobile against the real Worker. Review and rerun affected scoring/lifecycle/D1 suites before delivery.
