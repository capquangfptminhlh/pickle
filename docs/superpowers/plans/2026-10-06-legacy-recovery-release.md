# Legacy recovery release repair plan

> For agentic workers: execute the authorized maintenance continuously using subagent-driven-development, failing regression tests, spec/code review and fresh production verification.

**Goal:** Release the pending legacy recovery feature without overwriting newer D1 data, bypassing scoring guards, or leaving newly imported teams/matches incomplete.

**Architecture:** Keep the existing UI and source snapshot. Recovery adds missing IDs; existing parent records and their children remain authoritative. New teams/members and matches/sets share bounded atomic D1 batches. Provide JSON backup selection on the existing Cloudflare recovery page; GitHub Pages remains optional, without changing repository visibility or moving the production domain.

**Tech stack:** Cloudflare Workers/D1, JavaScript, SQLite regression fixtures, GitHub Actions/Pages and authenticated GitHub CLI.

## Confirmed failures

- [x] Sync the clean local checkout with current main `24d5722`; preserve upstream draw/courtside changes.
- [x] Reproduce Cloudflare run `37409917042`: second legacy import returns 500 because roster guards execute before duplicate `OR IGNORE` resolution.
- [x] Reproduce stale snapshot rollback of player rating/active status and match scores, versions, winner and sets.
- [x] Identify recovery Pages run `37409917065`: environment permits only `gh-pages`, while the recovery workflow publishes from main. The Pages site API currently returns 404.
- [x] Refresh central governance source `ef18d255150f3a77a7c7587feccf1ba7c419ad7b` and run its bootstrap engine successfully on 2026-10-06; this is maintenance, not a full Website OS launch-completeness claim.

## Repair and verification

- [x] Add regressions for retries, newer D1 scores/rosters/ratings, pre-existing empty-set matches, failed atomic parent/child imports, duplicate IDs and concurrent parent conflicts.
- [x] Make existing entities insert-only and report skipped records. Do not import legacy passwords or remove source browser data.
- [x] Preserve source timezone when reconstructing scheduled match clock times.
- [x] Run the full Worker/registry/Preview tests and desktop/mobile regressions; migrate a fresh local D1 and check native HTTP recovery behavior. Passed 109 unit tests, 18 existing UI cases, both recovery viewports and native D1 recovery/operations/public API checks.
- [x] Complete spec and quality review; push main and wait for CI plus Cloudflare deployment. Main `5a5cf73` released: CI `37412622965` and Cloudflare `37412623029` succeeded; final review approved the malformed-backup HTML regression fix.
- [x] Attempt Pages enablement: API422 states the current plan does not support Pages for this private repository. Do not change repository visibility or purchase a plan.
- [x] Add and test JSON file recovery on Pickleup.vn, preserving the selected file/local source and reporting new versus skipped records. Reject invalid JSON before transmitting it and clear the password after the request. Regressions cover slow-file selection races, oversize files, invalid login and HTML injected through malformed collection fields.
- [x] Make the optional Pages workflow skip only when the Pages API reports 404, while preserving other errors. Permit main alongside existing gh-pages only for future supported Pages deployments.
- [x] Verify current production health, deployed assets, private endpoint authorization and public recovery page. HTTPS/D1, seven matching browser assets, private API authorization, realtime and desktop/mobile checks passed on 2026-10-06; evidence under ignored `scratch/website-os-20261006/legacy-release-verification.md`. No synthetic production records or actual user legacy data were imported.
