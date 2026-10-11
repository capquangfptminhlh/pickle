# Independent relay draw implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently draw AB/BC/CA order for each team before every unstarted three-player MLP match, with correct persistent names and score controls.

**Architecture:** Match-owned orders, server-generated permutations and version-locked audited persistence. Shared validation/required-draw rules serve D1 and PostgreSQL; frontend lineup helpers select each side's persisted pair by the existing leg threshold. Already started matches retain their order and results.

**Tech Stack:** Cloudflare Worker/D1, Node/PostgreSQL, existing plain JavaScript UI, real SQLite/browser tests.

- [x] Root: shared relay draw validation/generation helpers, D1 migration/endpoint/state/scoring guard; real Worker negative/concurrency/persistence tests before implementation.
- [x] Backend worker: PostgreSQL migration/endpoint/state/scoring guard, transactional participant invalidation and API integration regression, matched to the contract in the spec.
- [x] UI worker: BTC/referee draw panels, independent lineup/banner/current serving names, public court/tournament/QR labels and Preview support; meaningful UI/lineup tests before implementation.
- [x] Root: integrate fixture/browser regressions for required pre-match draw, actual random independent order flow through 9/18/27 and independent A/B championships.
- [x] Independent reviewer: spec compliance and code-quality review, emphasizing race guards, existing started matches, role/scope and persistent pair identity.
- [x] Run fresh backend/unit/browser/build and PostgreSQL CI, merge/deploy with cache versions, verify actual live assets/configuration/active scores read-only, record evidence.

## Release evidence

- Full application CI [38129095477](https://github.com/capquangfptminhlh/pickle/actions/runs/38129095477) passed on `130cf0586d43a395e889b0010fc9d538c807b01b`: desktop/mobile browsers, syntax/design, actual PostgreSQL17 migration/seed/login/operations/API, Preview and final browser smoke.
- Fresh local Worker suite: **1,387/1,387 pass**. Eleven focused relay tests cover independent permutations, required draw, permissions, persistence, version/history guards, audit rollback, roster/grade changes, identity readiness, legacy history and reset/finish retention. Client/Preview unit group: **41/41 pass**.
- Actual Worker browser draw flow passed: BTC/referee draw/redraw, no scoring before draw, independent names and serving players at 0/9/18, refresh, history lock, public court/tournament/QR and completed final points. Full MLP championship passed:16teams/48players,24pool+12knockout/bronze matches, separate A/B champions. Four complete tournament lifecycles and four timeout/S2 surfaces passed.
- Actual local PostgreSQL17 relay API and existing registry/operations/Serie APIs passed. Dedicated repeated-grade/no-position case rejects draw; unique grades remain recognized independently of roster slots.
- Independent review reproduced and resolved zero-point service/history roster changes, missing PostgreSQL grade state and unresolved repeated-grade positions. Final review reported no open blockers. Migration-only follow-up independently retained all predicates and passed focused tests.
- First remote rollout [38129996562](https://github.com/capquangfptminhlh/pickle/actions/runs/38129996562) stopped at D1 `incomplete input` while applying the multi-CASE guard body. The application stayed on the prior release. [PR33](https://github.com/capquangfptminhlh/pickle/pull/33) replaced it with single-statement WHEN/RAISE triggers. All1,387Worker tests passed again.
- Successful exact release [38130475784](https://github.com/capquangfptminhlh/pickle/actions/runs/38130475784), commit `78f5df1fba7dc55119a2e7f4700c0cdaa08a2ebf`, passed Worker regressions/local D1/API integration, applied remote migration0019 and deployed Worker **eaf4278e-832b-4412-bd1c-96ca8b0778cf**. Frontend/Node files remain identical to the fully CI-tested release; only SQL guard structure changed.

Read-only production verification at2026-10-11T10:04:41Z:

- All24checked HTML/JS/CSS/service-worker SHA256 digests match the built artifacts; health200. Relay fields and persisted history flag present;4anonymous protected endpoint checks return401, including relay draw.
- All24existing matches retained their version, teams, current points, completed sets, winner, referee and court exactly across deployment. No authenticated production simulation writes.
- All16actual rosters resolve correctly in48pair checks; no roster correction needed.
- Public home, both tournaments and actual QR match passed375/1440browser checks: visible login, actual names, no score controls, no page JavaScript or script/stylesheet errors, no detail overflow.

Detailed outputs: ignored `scratch/relay-draw-*.log`, `scratch/relay-d1-compatible-*.log`, `scratch/audit-production-release.json`, `scratch/relay-production-preservation.json`, `scratch/production-grade-recognition.json`; screenshots under `ui-artifacts/`.
