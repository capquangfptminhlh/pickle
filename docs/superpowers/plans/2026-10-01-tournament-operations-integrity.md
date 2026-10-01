# Tournament operations integrity implementation plan

> For agentic workers: execute continuously using the existing authorized maintenance workflow, TDD, independent file ownership and spec/code review before main deployment.

**Goal:** Repair reproducible scoring, assignment and referee scope defects in the existing tournament operator flows.

**Architecture:** Keep the current UI and storage. Isolate Cloudflare score mutations into a handler that commits match state, sets, event/audit history and affected bracket slots in one guarded D1 batch. Apply the equivalent validation to PostgreSQL transactions and pass score versions from the UI. Preserve historical records and existing assignments.

**Tech stack:** Cloudflare Workers/D1, PostgreSQL/Express, browser JavaScript, Node test runner, Playwright.

## Confirmed public operations defects (audit expansion)

- [x] Reproduce and protect receipt media with current role and registration tournament/club scope; unlinked new uploads visible only to uploader or administrator. Serve private/no-store and fetch previews with authentication.
- [x] Repair public player DTOs to expose persisted sets, points, results, partners and rating history. Filter private tournaments, inactive divisions/teams and inactive partners. Filter sponsors linked to private tournaments.
- [x] Install same-origin Cloudflare WebSocket fallback, refresh after reconnect, and refetch partial invalidation messages without replacing complete UI state.
- [x] Keep PWA updates waiting for explicit user acceptance and bypass API/auth/upload caches. Verify via regression tests.
- [x] Run native D1 and PostgreSQL HTTP regressions for operations and public privacy on local/CI fixtures; review the expanded final patch.

## Scoring repair

- [x] Write Worker regressions and observe failures for edits to completed matches, premature/invalid/tied/excess quick results, stale versions, repeated undo and downstream-started corrections.
- [x] Add shared score rules: nonnegative finite integer scores, configured points/win-by-two, configured best-of wins and no extra sets after a winner.
- [x] Implement `cloudflare/src/scoring.js`, additive write guards and regression tests. Handle point, finish-set, quick-score, finish, special-result and undo with atomic persistence and complete snapshots. Support historical event payloads when safely restorable. Use compare-and-set guards across source and downstream versions; rollback on guard/audit failure. Reject corrections when downstream matches have any start/history.
- [x] Route score actions before operations dispatch in `cloudflare/src/index.js`; remove superseded handlers. Map integrity conflicts to HTTP409. Run `node --test cloudflare/tests/*.test.mjs`.

## Assignment and access repair

- [x] Reproduce stale referee scope access and invalid foreign/inactive teams/courts/referees on create and both edit endpoints.
- [x] Enforce current referee scope for assigned match reads, score/undo authorization and basic player edits in Worker and Node. Do not alter historical match assignment records.
- [x] Validate active teams in the selected division, distinct teams, active courts in the selected tournament and active referees with allowed scope on all create/edit/assignment paths. Preserve unchanged historical metadata; lock participant changes after start; preserve or cancel scored history rather than deleting it.
- [x] Test original assigned access, revoked/reassigned scope, all invalid assignment paths and valid explicit clearing. Use real Worker requests on migrated SQLite plus local HTTP tests on both backends.

## Interface and deployment

- [x] Send the visible match version on quick score, special result and undo. Disable scoring mutations after completion; show Vietnamese actionable conflict/rule/history errors and refresh after conflicts.
- [x] Add desktop/mobile scoring checks and native D1/PostgreSQL HTTP regressions to both existing workflows. Run existing registry/account/browser tests, syntax checks and Wrangler dry run.
- [ ] Complete spec and code quality review, push main, wait for both CI workflows and verify HTTPS health and deployed assets on Pickleup.vn. Do not write production test scores or replace production data.

## Verification record

Local checks: 84 unit regressions; 12 registry, 4 account and 2 scoring browser scenarios; native Wrangler D1 scoring, concurrency, permission, registry and R2 privacy HTTP suites; syntax/diff checks and Wrangler dry run passed. Spec and code quality reviews passed after repairing their reproduced history, receipt URL normalization and overlapping realtime findings.

Native PostgreSQL operations and public privacy HTTP tests passed in CI run 36852353130. That run exposed two outdated browser assertions; Cloudflare run 36852353258 passed validation but exposed remote D1 trigger parsing incompatibility. The release repair uses separate WHEN guards with single-statement trigger bodies, asserts completed read-only review/Undo, and waits for the registry heading. A full native Worker browser smoke also exposed missing Socket.IO requests; the Cloudflare asset build now omits the Node-only client while retaining the native WebSocket fallback.

Main deployment and production read-only verification remain release gates; do not report completion until both replacement workflows finish successfully.
