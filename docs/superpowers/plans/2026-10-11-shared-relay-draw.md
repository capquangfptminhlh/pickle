# Shared relay draw revision

User request: draw for one team and apply the result to the other team.

Design: shuffle AB/BC/CA once on the server, then persist equal, separate order arrays for both teams in the existing audited transaction. Worker and PostgreSQL use the same helper. Preview mirrors the behavior. Existing saved orders, including started matches, remain intact; an unstarted match can be redrawn using the existing action. Names remain specific to each team. No schema migration or production data rewrite.

Alternatives considered: client-side copying would not enforce persistence; a new schema would unnecessarily risk historical matches. Reusing the server helper is the smallest complete change.

- [x] Add a deterministic regression requiring one random permutation copied into separate arrays; confirm failure against the old generator.
- [x] Update shared generator and Preview, operator text, and asset cache versions.
- [x] Check Worker persistence, Preview, mobile operator flow, and legacy differing saved orders.
- [x] Full Worker suite: 1,387 passed; focused Worker/client suite: 24 passed; real Worker mobile/Preview browser: RELAY_DRAW_UI_OK; Wrangler build dry run passed.
- [ ] Independent code review and deployment verification.

Scope: narrowly revises the already approved operator flow. No layout redesign, new pages, or marketing content. Existing project D0 operator-console decision applies. Central governance source pinned at ef18d255150f3a77a7c7587feccf1ba7c419ad7b observed 2026-10-11; no whole-site launch-completeness claim.
