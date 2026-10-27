# PickleUp Open Play — implementation and release gates
Status: feature branch PR #40, **not deployed**. The existing `open-play.html` remains an offline simulator.

## Implemented and tested in the feature branch
- Deterministic rating-constrained pairing for up to 256 participants; O(n log n); maximum count of legal pairs with a simple sum cap.
- Offline responsive UI and local CSV export, without server writes or token storage.
- Dedicated Cloudflare D1 migration `0022_open_play_sessions.sql`: sessions and registrations, unrelated to tournament scores/brackets.
- Authenticated staff API `/api/open-play/sessions`. Access: super admin (all), organizer/club manager (own sessions); club managers must use their permitted club ID.
- Session creation/list/details; close/cancel; staff registration/cancellation/rejoin with single-statement capacity guard; rating-aware pair preview.
- Audit events and targeted tests of permissions, capacity, score isolation and validation.
- Cloudflare PR validation (including D1 migration, Worker test, Wrangler build and integration smoke) added without automatic PR deployment.
- Root dependency security fixes and Cloudflare undici security override.

## Staff API (requires Bearer token)
- `GET /api/open-play/sessions`: current user's sessions (super admin sees all).
- `POST /api/open-play/sessions`: JSON `{title,startsAt,clubId?,courtLabel?,maxPlayers?,maxCombinedRating?,tolerance?}`. `startsAt` must be ISO datetime with timezone.
- `GET /api/open-play/sessions/:id`: details plus roster (authorized staff only).
- `PATCH /api/open-play/sessions/:id`: JSON `{status:"open"|"closed"|"cancelled"}`.
- `POST /api/open-play/sessions/:id/registrations`: JSON `{playerId}`, requires an existing active player.
- `POST /api/open-play/sessions/:id/registrations/:playerId/cancel`: cancel registration.
- `GET /api/open-play/sessions/:id/pairs`: legal pair preview; does not mutate records.

## NOT yet ready for customer launch
- Self-service sign-up, public session discovery, player-account linking/consent, check-in, waitlist.
- Verified venue/court scheduling, cancellation notifications, multiple rounds and fair rotation.
- True random seeded pairing with auditable seed; current algorithm is deterministic, not random.
- Production migration safety review, permission edge cases, real-device UI, concurrency/stress QA, observability/rollback.
- Marketplace, ratings recalculation, communities, native app are separate later phases.

## Protection rules
- Never use production tournament score/events as Open Play test fixtures.
- No production migration/deploy until CI and Worker validation pass and explicit release review.
- Never commit real player contact exports to a public GitHub repository; old files still exist in git history until rewritten.
