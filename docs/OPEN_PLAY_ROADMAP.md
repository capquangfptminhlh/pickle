# PickleUp Open Play — implementation and release gates
Status: feature branch PR #40, **not deployed**. The existing `open-play.html` remains an offline simulator.

## Implemented and tested in the feature branch
- Deterministic rating-constrained pairing for up to 256 participants; O(n log n); maximum count of legal pairs with a simple sum cap.
- Offline responsive UI and local CSV export, without server writes or token storage.
- Dedicated Cloudflare D1 migration `0022_open_play_sessions.sql`: sessions and registrations, unrelated to tournament scores/brackets.
- Authenticated staff API `/api/open-play/sessions`. Access: super admin (all), organizer/club manager (own sessions); club managers must use their permitted club ID.
- Session creation/list/details; close/cancel; staff registration/cancellation/rejoin with single-statement capacity guard; rating-aware pair preview.
- New read-only **multi-round doubles preview**: `shared/open-play-rounds.js` generates 1–12 rotations across 1–32 virtual courts; four unique players per court, valid rating-capped teams, priority for less-played participants, and avoidance of repeated partners/opponents where possible. Deterministic best-effort algorithm, not a guaranteed optimal tournament schedule.
- Audit events and targeted tests of permissions, capacity, score isolation and validation.
- Cloudflare PR validation (including D1 migration, Worker test, Wrangler build and integration smoke) added without automatic PR deployment.
- Root dependency security fixes and Cloudflare undici security override.

## User-facing entrypoints in this branch
- `/open-play.html`: offline legal-pair simulator with CSV export.
- `/open-play-admin.html`: authenticated mobile BTC console to create sessions, configure registration, register/cancel players, and preview pairs.
- `/open-play-discover.html`: public upcoming-session discovery; authenticated linked player profiles may join/cancel.
- Public sign-up **defaults OFF** on every new session. BTC opts in explicitly. Public APIs never return private roster, contact details, or payment information.

## Player self-service API
- `GET /api/open-play/public/sessions`: public upcoming sessions explicitly accepting player signup.
- `GET /api/open-play/me`: authenticated user's own linked player profiles and their registrations only.
- `POST /api/open-play/sessions/:id/join`: body `{playerId}`, server verifies that this profile belongs to the signed-in account.
- `POST /api/open-play/sessions/:id/self-cancel`: same ownership check, player cancels their own registration.
- `PATCH /api/open-play/sessions/:id`: organizers may set `selfSignupEnabled: true|false` (closed/cancelled sessions cannot accept public signup).

## Staff API (requires Bearer token)
- `GET /api/open-play/sessions`: current user's sessions (super admin sees all).
- `POST /api/open-play/sessions`: JSON `{title,startsAt,clubId?,courtLabel?,maxPlayers?,maxCombinedRating?,tolerance?}`. `startsAt` must be ISO datetime with timezone.
- `GET /api/open-play/sessions/:id`: details plus roster (authorized staff only).
- `PATCH /api/open-play/sessions/:id`: JSON `{status:"open"|"closed"|"cancelled"}`.
- `POST /api/open-play/sessions/:id/registrations`: JSON `{playerId}`, requires an existing active player.
- `POST /api/open-play/sessions/:id/registrations/:playerId/cancel`: cancel registration.
- `GET /api/open-play/sessions/:id/pairs`: legal pair preview; does not mutate records.
- `GET /api/open-play/sessions/:id/rounds/preview?rounds=3&courts=2`: authorized BTC-only 2v2 preview, includes virtual courts, waiting lists and per-player game counts; **no DB writes**.


## Full-session waitlist and FIFO promotion
- Additive migration `0024_open_play_waitlist.sql`, independent from tournament tables and player contact exports.
- A public session must be **opted in, full, open and not yet confirmed** before a linked player may join its waitlist. A player cannot queue someone else's profile.
- `POST /api/open-play/sessions/:id/waitlist/join` body `{playerId}` (self), or staff `POST /api/open-play/sessions/:id/waitlist`.
- `GET /api/open-play/me` returns only the signed-in account's waiting positions; staff `GET /api/open-play/sessions/:id/waitlist` shows roster position/name/rating without contact data.
- Leave via `POST /api/open-play/sessions/:id/waitlist/self-cancel` or staff `POST /api/open-play/sessions/:id/waitlist/:playerId/cancel`.
- **Cancellation auto-promotion** happens in one D1 `DB.batch` transaction: cancel confirmed registration, admit earliest eligible active waitlisted profile to the freed slot, change waitlist status to promoted, audit both. Deterministic FIFO by created timestamp then player ID. Bypass and overbooking blocked through guarded inserts and unique constraints.
- Public discovery shows counts (not names), a waiting button when full, and own queue position/cancel controls.
- **Confirming a game-day plan automatically stops signup and expires remaining queue slots**, because the match roster is immutable. This does not imply a live push/notification service; refresh is manual.
- Safety: no paid reservation, no notification promise, no fairness beyond FIFO eligibility; no changes to score_events or existing tournaments.

## Match-day execution (feature branch, isolated data)
- **Staff check-in:** `POST /api/open-play/sessions/:id/check-in/:playerId` with `{checkedIn:true|false}`. Only already-registered active players can check in. Must check in at least four players before plan confirmation.
- **Get state:** `GET /api/open-play/sessions/:id/plan` returns check-ins and the confirmed schedule (if any). Staff authorization enforced.
- **Confirm once:** `POST /api/open-play/sessions/:id/plan` with `{rounds:1..12,courts:1..32,pointTarget:11|15|21,winBy:1|2}`. Generates a deterministic doubles court plan from **checked-in** players and saves atomically in `0023_open_play_game_day.sql`. Once confirmed, registrations, cancellations and check-ins are locked, preventing the underlying teams from changing during play. Duplicate confirmations return 409; no silent rescheduling.
- **Enter scores:** `PATCH /api/open-play/sessions/:id/matches/:matchId/score` body `{version,scoreA,scoreB,finish}`. Score version prevents overwrite on concurrent devices. Finishing requires the configured target and winning margin; every update is audited as an `open_play_match` event.
- **Audited correction:** `PATCH /api/open-play/sessions/:id/matches/:matchId/correction` requires `{version,scoreA,scoreB,reason}` with a 12–500 character justification. Only authorized staff can correct **completed** matches, including after a session is closed (not cancelled). Optimistic versioning, valid winning-score checks, atomic update plus conditional correction audit, no history deletion. `GET /api/open-play/sessions/:id/matches/:matchId/history` returns up to 100 historical score/audit records to authorized staff only. UI includes a separate final-score correction action with confirmation and an expandable audit trail.
- **Close session:** closing fails if any confirmed game remains unfinished. Tournament `matches` and `score_events` remain unchanged.
- **Staff UI:** check-in buttons, official plan confirmation after operator prompt, score inputs per match, status refresh and close. E2E scenario exercises full flow with synthetic users and local D1.
- **Public discovery:** optional auth lookup returns `null` on 401 rather than redirecting visitors to the login page. Browsing open events works without an account; joining and personal matches still require authentication.
- **Player game feed:** `GET /api/open-play/me/matches` lists only matches where the signed-in account owns one of the four participant profiles. No contact information is exposed. Mobile discovery shows `Trận đấu của tôi` with court, round, scores, status and manual refresh. Cross-profile access is not supported.

- **Not yet real-time push:** scoreboard refresh is operator/player-triggered; no WebSocket/SSE feed, native push notification, court booking guarantee or automated ranking changes.

## NOT yet ready for customer launch
- Player-account linking management/consent, self-check-in policy and booking notifications. Staff check-in and public self-registration are implemented, but need live-device acceptance testing.
- Verified venue/court booking and conflict prevention, cancellation notifications, confirmed-plan reset/reschedule flows and stronger globally fair partner rotation. A deterministic multi-round plan can be **confirmed and saved**, but court numbers are logical slots, not guaranteed physical bookings.
- True random seeded pairing with auditable seed; current algorithm is deterministic, not random.
- Production migration safety review, permission edge cases, real-device UI, concurrency/stress QA, observability/rollback, GDPR-style data lifecycle and history sanitization.
- Marketplace, ratings recalculation, communities, native app are separate later phases.

## Protection rules
- Never use production tournament score/events as Open Play test fixtures.
- No production migration/deploy until CI and Worker validation pass and explicit release review.
- Never commit real player contact exports to a public GitHub repository; old files still exist in git history until rewritten.
