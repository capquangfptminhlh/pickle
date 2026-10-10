# Reset groups before a new draw

The user requested a way to reset groups and draw again. Previous work added a single-match score reset, leaving this request unimplemented.

Scope: one division, managed by its organizer or a super admin. Keep teams, players, registrations, courts, referee accounts, rules and saved draw preferences. Clear every match in this division, including knockout matches, sets, scoring events and team group assignments. Archive the cleared data in the authenticated audit log, in the same transaction as deletion.

The operator center and draw settings expose “Đặt lại bảng & quay lại”. A separate confirmation shows the division and authoritative counts, including live and completed matches. Require typing `QUAY LAI`; cancellation changes nothing. A stale preview or a score/draw arriving during reset aborts the whole transaction. After success refresh the center and reopen draw settings; another draw requires its normal confirmation.

Implementation sequence:

1. Add failing API tests for scope, confirmation, isolation, archive/rollback and concurrent updates.
2. Add a D1 reset snapshot view and transaction guard, then authenticated preview/reset routes.
3. Add the UI controls and confirmation; verify desktop and mobile through the real Worker and SQLite fixture.
4. Run the Cloudflare suite, operator regression and deployment build. Migrate the additive guard schema, deploy, and verify production assets and unauthorized access.

Governance bootstrap: capquangfptminhlh/seo-web at ef18d255150f3a77a7c7587feccf1ba7c419ad7b, manifest 1.3.0. Mandatory files and local operator-flow rules loaded on 2026-10-11. This is an authorized correction inside the existing admin design and is not a claim of whole-site launch completeness. No new public pages, imagery or layout concept.

## Verification on 2026-10-11

- Cloudflare `npm test`: 1,190 passed, zero failed. The reset suite has 25 cases.
- Browser reset flow: admin and organizer at 1440 px and 375 px; both button locations, cancel, invalid confirmation, stale scoring, re-preview, audited reset and new 16-team/4-group draw passed.
- Operator center browser regression: dashboard, court setup, draw, bracket expansion, last-match assignment and referee creation passed for both roles and widths.
- Real local Wrangler/D1 HTTP checks: played pool + generated knockout reset, concurrent resets, preserved teams, redraw and existing bracket safety passed.
- Worker dry-run, migration application, JavaScript syntax and diff whitespace checks passed.
- Independent code review reproduced and led to fixes for large rally histories, court/referee FK changes, and legacy seeding/scheduling racing reset. No remaining critical/important review findings.

Archive detail: complete JSON is UTF-8 encoded, split into 192 KiB byte chunks and stored as linked base64 audit records. The main reset audit records archive UUID, ordered chunk count, byte length and SHA-256. Every record and deletion is in the same D1 batch. State refresh selects only the audit summary columns so it does not load these archive blobs.

Migration 0014 is additive and must precede the Worker deployment. Production verification must use read-only requests; do not reset an existing real tournament as a deployment test. This implementation targets the production Cloudflare Worker; it does not claim feature parity with the separate legacy VPS backend.
