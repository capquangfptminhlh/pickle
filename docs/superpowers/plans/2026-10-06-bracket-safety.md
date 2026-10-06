# Bracket safety maintenance plan

> For agentic workers: use subagent-driven-development for implementation, followed by spec and quality reviews. Continue the owner's authorized maintenance and release without another approval handoff.

**Goal:** Prevent premature or incomplete elimination brackets in the existing tournament operator flow.

**Architecture:** Validate completed group pairings rather than raw match counts. Build all elimination matches and bye propagation in memory, then persist the complete bracket in one atomic D1 batch. Add a non-destructive insertion guard for duplicate division/slot combinations so concurrent generation cannot create two brackets. Preserve existing matches and the current UI.

**Tech Stack:** Cloudflare Workers, D1/SQLite, node:test and existing local/native integration runners.

## Implementation and verification

- [x] Write real Worker/SQLite regressions in `cloudflare/tests/bracket-safety.test.mjs`: repeated results for one pair must not substitute for missing pairings; a database write failure during generation must leave zero new bracket matches; simultaneous generation must yield one success and one 409; existing completed brackets and pool scores must remain unchanged. Observed 13 failing cases before changing production code.
- [x] Modify `cloudflare/src/bracket.js`: check every unordered pair of active teams has a completed result with a winner belonging to the pair, and block pending duplicates. Replace sequential INSERT/update calls with a single atomic batch including bye propagation. Preserve single/double elimination topology and qualifier ordering.
- [x] Add `cloudflare/migrations/0008_bracket_generation_guards.sql`: a BEFORE INSERT trigger rejects a duplicate non-null bracket slot within the same division. Do not delete or rewrite historic records. Map the guard to HTTP409 inside bracket generation.
- [x] Run `node --test cloudflare/tests/bracket-safety.test.mjs cloudflare/tests/tournament-core.test.mjs`; all 19 passed. Full Worker/registry/Preview suite passed 127/127; eight fresh native D1 migrations and bracket/accounts/scoring/recovery HTTP checks passed. Wrangler deployment dry run passed.
- [x] Complete independent spec review, then quality review; both approved without outstanding findings.
- [ ] Commit/push the reviewed change under the owner's existing deployment authorization.
- [ ] Wait for CI and Cloudflare deployment success, then verify production health and public/private endpoint behavior without synthetic production writes.

## Additional confirmed account finding

- [x] Reproduce current-admin self-lockout through `PATCH /api/users/admin` with `active: 0`: original Worker returned 200 and deactivated the caller despite the boolean-false guard. Observed RED in `cloudflare/tests/account-self-protection.test.mjs` before the fix.
- [x] Apply the existing persistence normalization to the self-disable check in Worker and Node routes. Preserve ordinary metadata edits and child account activation semantics. Both new cases and nine existing account regressions passed.
- [x] Run the shared native account script against local D1, asserting false/zero/null/empty active values cannot lock out the caller. Included these small changes in independent final reviews. The same script is required by PostgreSQL CI before release.

Prior release evidence is saved under ignored `scratch/website-os-20261006/legacy-release-verification.md`. Central Website OS bootstrap passed earlier today against source `ef18d255150f3a77a7c7587feccf1ba7c419ad7b`; this remains scoped application maintenance.
