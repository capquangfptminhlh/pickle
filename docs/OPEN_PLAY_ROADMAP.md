# PickleUp Open Play — implementation plan
Status: prototype on PR #40, **not deployed**.

## Implemented in this branch
- Standalone `/open-play.html` simulation using `shared/open-play.js`.
- Deterministic, rating-constrained matching (max 256 participants per calculation).
- Explicit rating cap and tolerance, reject duplicate IDs and invalid ratings.
- Standalone UI does not send requests or persist roster, scores or account data.
- Node regression tests for pairing and basic HTML/no-write safeguards.

## Production gate — required before enabling registration
1. Fix CI main/PR failures and check all Playwright screenshots.
2. Design Open Play tables: sessions, participants, invitations, courts, rounds, audit history.
3. Migrate databases additively; do not alter the existing score events and brackets.
4. Enforce authorized organizer mutations and check-in with server-side validation.
5. Support >256 players and fairness/round-robin rotation in later milestones; current matching supports 256.
6. Create public registration page; private organizer console; waitlist and cancellation.
7. Add race/concurrency tests and duplicate-registration protection.
8. Add observability, rate limiting, backup/restore and explicit deploy/rollback steps.
9. Do not claim algorithm is randomized: this prototype is deterministic and maximizes feasible pairing count, not an auditable seeded lottery.

## Parity sequence
After a production-ready Open Play release: richer player profiles and rating history, communities/clubs, booking, marketplace/payments, and native app packaging. Separate rollout gates are required for each.
