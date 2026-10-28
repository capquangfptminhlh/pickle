# Pickleball Superstar APK reference audit — 2026-10-28

> Source: user-provided `pickleball-superstar(1).rar` (65,099,811 bytes), containing `base.apk` (111,782,009 bytes), `assets/index.android.bundle` (16,738,336 bytes), `assets/app.config`, `assets/app.manifest`, 32 split APKs and helper analysis scripts. This is a reverse-engineered **binary package**, not the original editable application source tree. Do not copy any proprietary JS bytecode, logos, images, fonts, private endpoints, tokens or brand assets into PickleUp.

## Evidence and confidence

The bundle header identifies Hermes bytecode v98, 54,546 functions and 124,625 string entries. Raw route-string discovery yielded **198 distinct file-route tokens** (including auxiliary/internal paths). These are **capability and navigation indicators, NOT proof of completed app flows**. Exact visual parity requires running/screenshots of the licensed app; no pixel-level screenshot specification was established by this archive alone.

Found examples from bytecode:
- Tournament management: `/tournament/[id]/manage/index.tsx`, `.../participants/index.tsx`, `.../registrations/index.tsx`, `.../settings/category/index.tsx`
- Brackets, draw and match logistics: `.../manage/draw/index.tsx`, `.../so-do/index.tsx`, `.../timeline/index.tsx`, `.../timeline/unplaced.tsx`, `.../manage/settings/courts.tsx`
- Deep rules configuration: `.../settings/match-format/[categoryId]/edit/{rounds,games,scoring,serve,sides,team,tiebreak,breaks,segment}.tsx`
- Governance & transparency: `.../manage/complaints/index.tsx`, `.../manage/referee-ratings.tsx`, `.../manage/staff/index.tsx`, `.../manage/notify/index.tsx`
- User journey: `/tournament/[id]/register/index.tsx`, `/tournament/[id]/tickets/index.tsx`, `/me/tournaments/index.tsx`, `/me/tournament-tickets.tsx`
- Payments & marketing: `.../settings/payment/{index,account,timing}.tsx`, `.../settings/marketing/coupon/index.tsx`, `.../settings/marketing/promotion/index.tsx`
- Social & Open Play: `/social-play/[slug]/manage/{members,sessions,challenges}.tsx`, `/social-play/[slug]/settlements.tsx`, `/tournament/[id]/pairing/index.tsx`
- Match & media: `/match/[code]/{index,referee,theater}.tsx`, `/tournament/[id]/court-camera.tsx`, `/me/video-clips.tsx`
- Reputation: `/pss-rating/index.tsx`, `/me/challenges/index.tsx`
- Commerce & storefront: `/market/seller/[storeId]/inventory.tsx`, `/market/seller/[storeId]/pos/index.tsx`, `/market/request/new/index.tsx`, `/market/seller/[storeId]/settings/payout.tsx`.
- Campaign: `/campaign/[slug]/create.tsx`, `/campaign/[slug]/poster/[id].tsx`.

The app config declares permissions for camera, microphone, location and storage, and mentions QR check-in, match streaming and replay in its permission rationale. This does **not** demonstrate that livestreaming, replay or payment complete successfully in runtime.

## PickleUp parity gap (source-level preliminary)

| Area | PickleUp main evidence | Preliminary classification | Required acceptance test |
| --- | --- | --- | --- |
| Tournament setup, divisions, players, brackets | `assets/admin-app.js`, `assets/bracket-ui.js`, `cloudflare/src/` | Present; end-to-end parity unverified | Organizer creates 16/32/64 pair events, seeds, draws, publishes, scores and finalizes without editing database |
| Draw reveal / relay | `assets/draw-reveal.js`, `assets/draw-flex.js`, draw API tests | Present; polish parity unverified | Audience-mode full-screen reveal and rollback test |
| Court assignment / live score | `court-board.html`, `assets/referee-courtside.js`, court-scheduling tests | Present, UX gap likely | 6-court simultaneous sessions with conflict and disconnected referee scenarios |
| Open Play sessions, waiting, check-in, pairing | `open-play-*.html`, `cloudflare/src/open-play-*.js` | Implemented in PR #40; needs real-device flow QA | Register → waitlist → check-in → round assignment → referee → close with audit |
| Rich match format configuration | Existing `assets/match-format.js` and score controls | Partial/unverified compared with route depth | Configurable serve, scoring, games, team, tiebreak, timeouts with scenario fixtures |
| Timeline and unplaced queue | Court-board plus tournament operations | Dedicated parity not demonstrated | Global multi-court timeline, unassigned pool and drag/confirm behavior |
| Ticket/refund/prize payment | Registration/payment UI and Cloudflare routes may exist | Unverified; no route-specific parity established | Ticket order, refunds, audit, reconciliation and role access |
| Notifications/complaints/staff governance | Account/role and audit modules exist | Incomplete/unverified | Complaint workflow, referee assignment, template notification with delivery logs |
| Social challenge / clip / livestream | No matching dedicated paths in root repo tree | No verified implementation | Club challenge posts, match capture consent, playback and stream health |
| Marketing/campaigns/coupons | No matching dedicated paths in root repo tree | No verified implementation | Promotion rules, coupons and reporting with redemption idempotency |
| Marketplace/merchant POS | No matching dedicated paths in root repo tree | No verified implementation | Seller, stock, order, payment and buyer dispute lifecycle |

## Implementation order

1. **Operator experience parity:** a consistent visual system across dashboard, registration, draw, court timeline, bracket and referee; no role-hidden controls or fake data. Fully keyboard/touch accessible.
2. **Tournament operating depth:** complete match-format rules, multi-court unplaced scheduling, live conflict checks, official result traceability; regression suite for 16/32/64 pairs and MLP.
3. **Social and video:** social play community profiles, challenge and clip flows; privacy-safe upload, moderation and playback, with backend cost caps.
4. **Commercial extensions:** tickets/refunds, tournament marketing, coupons, merchant/POS only after data model, roles, accounting and settlement tests exist.

### What must not be claimed

- APK presence alone does not imply complete access to original source code or private backend.
- Static route strings do not establish working functionality or exact screen layouts.
- A passing GitHub Action does not prove the authenticated production journey works.
- Feature parity cannot be declared before mobile QA against the original reference plus PickleUp production.

## Next technical proof

Use the reference's route inventory as a screen checklist. For every candidate feature, create an independently implemented PickleUp route, API contract, fixture, integration test and mobile screenshot. Compare semantics/workflow rather than copying proprietary layouts or source assets. Verify the production release by public `/release.json` **and** an authenticated end-to-end smoke test.
