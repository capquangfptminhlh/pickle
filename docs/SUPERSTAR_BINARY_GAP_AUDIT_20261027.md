# PickleUp ↔ Pickleball Superstar Android 1.3.1 — binary-based functional gap audit

**Source:** privately supplied user archive `pickleball-superstar(1).rar` (RAR v5, 65,099,811 bytes), containing `base.apk` (111,782,009 bytes), `assets/index.android.bundle` (16,738,336 bytes), Expo config/manifest and analysis scripts. Source is retained outside this public repository. **Do not commit APK, decoded code, assets, URLs, app tokens, client secrets or copyrighted fonts.**

**Provenance SHA-256**
- RAR: `3ac26a91f30e653507803ad275bdf176d7996878221b98abf1924c2ea1229c16`
- base.apk: `d1fff3f6d293c2e13b75b24387575997f85402df15d7a4774a1d1f841a7bd572`
- Hermes bundle: `ee462f5053342216090ce6861c1d6565f8eb4fb028360d2cd21d1a1951eaebd6`

## What is independently verified from the archive
- `app.config` declares **Pickleball Superstar**, Android package `com.pickleballsuperstar.app`, version **1.3.1**, Expo SDK **57.0.0**.
- `index.android.bundle` begins with Hermes bytecode header; bytecode version at offset 8 is **98**.
- Embedded app-route string paths include `/tournament/[id]/manage/draw/[categoryId].tsx`, `/tournament/[id]/manage/registrations/[categoryId].tsx`, `/tournament/[id]/manage/settings/courts.tsx`, `/tournament/[id]/manage/referee-ratings.tsx`, `/social-play/[slug]/manage/sessions.tsx`, `/social-play/[slug]/settlements.tsx`, `/market/product/[idOrSlug].tsx`, `/market/seller/[storeId]/inventory.tsx`, `/match/[code]/referee.tsx` and `/match/[code]/theater.tsx`.
- Binary contains markers `PssRating`, `PssDelta`, `PssScore`, `Balanced`, `Round Robin`, `Ladder`, `waitlist`, `check-in`, `livestream`.
- Expo config requests location, camera, microphone, notifications, media-related Android permissions and includes video/audio/SQLite/secure-storage integrations. **Permission or string existence is not evidence that a feature is implemented, activated or working.**

## Comparative implementation matrix — bounded by checked PickleUp repository

| Functional system | Superstar binary/static evidence | PickleUp checked implementation | State |
| --- | --- | --- | --- |
| Tournament registration, draw, divisions and court rules | Tournament management routes and match-format screens | Existing tournament/admin/score/bracket flows; Cloudflare API | **Partially comparable**; do not claim parity of every rule |
| Tournament complaints, disciplinary flags, referee rating | `manage/complaints`, `manage/conduct-flag`, `manage/referee-ratings` routes | No end-to-end parity established | **Gap — verify scope** |
| Tournament insights and marketing/coupon management | `manage/insights`, `manage/settings/marketing` routes | Admin reports/content exist | **Gap — evidence and QA needed** |
| Social-play group management and scheduling | `social-play/[slug]/manage/members`, `sessions`, `schedules` | Open Play sessions, registration, role checks in PR #40 | **Partial** |
| Open Play matchmaking modes | Markers `Balanced`, `Round Robin`, `Ladder`, waitlist | Rating-constrained pairing ≤256 plus 1–12-round best-effort rotation preview and 1–32 virtual courts; no published Balanced/Ladder runtime modes | **Partial — substantial gap** |
| Open Play admission/check-in, waitlist, settlement | Strings and social-play settlement route | Opt-in player join/cancel, but no waitlist, check-in or settlement | **Gap** |
| Court/venue association and livestream | Court camera route, livestream markers and media permissions | Court boards, scheduling and live-score features; no proven Open Play per-court livestream | **Gap — verify runtime** |
| PSS rating/delta/score | Strings `PssRating`, `PssDelta`, `PssScore` | Player ratings/ranking, authorized rating edits | **Gap — no verified scoring equivalence** |
| Marketplace, seller, inventory, payment | Market seller/product/order/payment route families | No comparable marketplace verified in PickleUp | **Gap** |
| Mobile UX and UI cohesion | Native Android React Native route structure | Responsive web PWA, dedicated Open Play staff and player pages in PR #40 | **Different architectures; requires device/user validation** |

## Priority implementation sequence
1. **P0 — complete Open Play round lifecycle**: check-in, real court availability, persisted/confirmed round assignments, player readiness, safe scoreboard and session close-out. Virtual multi-round previews are now available on PR #40 but do not book courts or persist matches. Isolate from tournament score events.
2. **P0 — matching quality**: selectable modes (balanced, rotation/round-robin, ladder), repeat-partner avoidance, fairness and auditable constraints; never claim current deterministic one-round matching is random.
3. **P1 — member flow**: waitlist, arrival status, authenticated membership linking, cancellation rules, notices and roster export respecting privacy.
4. **P1 — operator UI**: unified phone-first control center with live counts, search and context actions, loading/failure/empty states, verified 320–1280px layouts.
5. **P2 — tournament parity**: disputes, referee evaluations, granular match-format setting, analytics and marketing only after domain modeling, permission and QA reviews.
6. **P3 — marketplace, payment, chat and livestream**: separate threat models, provider integrations, regulatory and platform-policy review before production.

## Evidence limits and safety
- This is an **offline static artifact review**. No Android emulator/runtime session, authenticated app data, working server endpoints or feature-completion rate has been established by route names alone.
- Do not transplant compiled code or copyrighted creative assets; implement original behavior from independently specified workflows.
- Any screenshots/font choices require independent licensing. Use available open-source typography rather than extracting and redistributing APK font files.
- The PickleUp feature branch PR #40 is not deployed; latest CI and release gates still apply.
