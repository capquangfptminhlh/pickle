# Independent relay draw implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Independently draw AB/BC/CA order for each team before every unstarted three-player MLP match, with correct persistent names and score controls.

**Architecture:** Match-owned orders, server-generated permutations and version-locked audited persistence. Shared validation/required-draw rules serve D1 and PostgreSQL; frontend lineup helpers select each side's persisted pair by the existing leg threshold. Already started matches retain their order and results.

**Tech Stack:** Cloudflare Worker/D1, Node/PostgreSQL, existing plain JavaScript UI, real SQLite/browser tests.

- [x] Root: shared relay draw validation/generation helpers, D1 migration/endpoint/state/scoring guard; real Worker negative/concurrency/persistence tests before implementation.
- [x] Backend worker: PostgreSQL migration/endpoint/state/scoring guard, transactional participant invalidation and API integration regression, matched to the contract in the spec.
- [x] UI worker: BTC/referee draw panels, independent lineup/banner/current serving names, public court/tournament/QR labels and Preview support; meaningful UI/lineup tests before implementation.
- [x] Root: integrate fixture/browser regressions for required pre-match draw, actual random independent order flow through 9/18/27 and independent A/B championships.
- [ ] Independent reviewer: spec compliance and code-quality review, emphasizing race guards, existing started matches, role/scope and persistent pair identity.
- [ ] Run fresh backend/unit/browser/build and PostgreSQL CI, merge/deploy with cache versions, verify actual live assets/configuration/active scores read-only, record evidence.

Verification before release: 1,386 Worker tests passed; 41 client/Preview unit tests passed; actual Worker relay UI passed; real PostgreSQL 17 relay API regression passed, including saved grades. Independent review found a zero-score service/history roster lock gap and a PostgreSQL grade-state omission; both have been corrected and tested. Build dry run passed. Production deployment and final CI remain pending.
