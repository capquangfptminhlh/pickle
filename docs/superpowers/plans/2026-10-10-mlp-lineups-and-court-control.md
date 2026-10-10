# MLP Lineups and Court Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show four detailed tournament court cards and the exact MLP AB/BC/CA athletes on all scoring surfaces.

**Architecture:** Persist one-based athlete slots on team memberships, preserve the existing `teamPlayers` API shape, and add a small browser lineup helper shared by admin, referee, and court displays. Replace the control center's flat live list with a tournament-level court grid while retaining the complete schedule in an expandable division section.

**Tech Stack:** Vanilla JavaScript/HTML/CSS, Cloudflare Worker + D1, Express + PostgreSQL, Playwright, Node test runner.

---

### Task 1: Lock the missing behavior with failing tests

**Files:**
- Create: `cloudflare/tests/team-lineup.test.mjs`
- Create: `scripts/registry-mlp-court-ui.mjs`

- [ ] Write a Worker test that creates a three-player relay team in non-alphabetical order, reloads admin state, performs an order-only edit, and asserts the returned player ID order.
- [ ] Write a Playwright regression that opens a four-court tournament center and asserts four distinct court cards, current/next match details, exact AB names, and no mobile overflow.
- [ ] Assert the same fixture shows AB on the admin and referee scoring surfaces, then changes to BC at nine points and CA at eighteen points.
- [ ] Run `node --test cloudflare/tests/team-lineup.test.mjs` and `node scripts/registry-mlp-court-ui.mjs`; expect failures because slot persistence, court cards, and pair-name elements do not exist.

### Task 2: Persist roster slots in D1 and PostgreSQL

**Files:**
- Create: `cloudflare/migrations/0013_team_player_slots.sql`
- Modify: `database/schema.sql`
- Modify: `cloudflare/src/index.js`
- Modify: `cloudflare/src/operations.js`
- Modify: `cloudflare/src/state.js`
- Modify: `server/index.js`

- [ ] Add nullable `slot_no` plus a partial unique `(team_id, slot_no)` index in both databases.
- [ ] Write `slot_no = index + 1` in create, update, import, balanced draw, legacy recovery, and add-member paths.
- [ ] Treat reordered IDs as a roster change, retaining all existing roster locks and authorization.
- [ ] Order state memberships by `slot_no`, then infer legacy order only when every athlete name can be matched safely in the team name.
- [ ] Run the new Worker test and relevant roster/legacy suites; expect them to pass.

### Task 3: Add the shared MLP lineup presentation helper

**Files:**
- Create: `assets/team-lineup.js`
- Modify: `admin.html`
- Modify: `referee.html`
- Modify: `court-board.html`
- Modify: `service-worker.js`
- Modify: `cloudflare/public/service-worker.js`

- [ ] Implement helpers for roster athletes, slot labels, active relay leg, active pair names, full-roster text, and unresolved legacy lineups.
- [ ] Load the helper before the consuming scripts and update cache versions.
- [ ] Add focused browser assertions for AB at 0–8, BC at 9–17, and CA at 18–27.

### Task 4: Render exact pair names in scoring screens

**Files:**
- Modify: `admin.html`
- Modify: `assets/admin-app.js`
- Modify: `referee.html`
- Modify: `assets/referee-courtside.js`
- Modify: `assets/styles.css`
- Modify: `assets/referee-arena.css`

- [ ] Make the current pair the primary name for relay matches and keep the full team roster as secondary text.
- [ ] Expand the relay banner with both sides' exact pair names and update it immediately at segment boundaries.
- [ ] Use exact pair names in serving status and accessible rally labels.
- [ ] Label team roster pickers A/B/C from `relayTeamSize` and persist order-only edits.
- [ ] Run the Playwright regression at 375px and 1440px and verify no overflow.

### Task 5: Replace the flat live list with four court cards

**Files:**
- Modify: `assets/admin-app.js`
- Modify: `assets/styles.css`
- Modify: `assets/admin-sport.css`
- Modify: `assets/admin-light.css`

- [ ] Build a tournament-level court grid sorted by court order.
- [ ] Render state, stage/division, time, referee, current score, exact current MLP pair, score/assignment buttons, and next match per court.
- [ ] Add an unassigned-match section and keep the full per-division schedule in an expandable details element.
- [ ] Add a full-screen board link for the tournament.
- [ ] Run the Playwright regression and the existing operator center suite.

### Task 6: Full verification and deployment

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/cloudflare.yml`
- Modify: `docs/full-application-audit.md`

- [ ] Add the new regressions to both CI workflows.
- [ ] Run targeted tests, all Worker tests, browser regressions, asset build, and Wrangler dry-run.
- [ ] Review `git diff --check`, cache versions, and the final diff.
- [ ] Commit and push to `main`, wait for CI and Cloudflare deployment, then run read-only production verification for the deployed asset hashes and pages.
