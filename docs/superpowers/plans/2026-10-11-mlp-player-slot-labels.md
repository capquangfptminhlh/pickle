# MLP player identity labels

**Goal:** Identify MLP player A/B/C from the entered Trình column on both score entry surfaces, distinct from match sides A/B.

**Design:** A three-player relay resolves roles from unique entered skill categories A/A+, B/B+, C/C+. Names, roster order and numeric ratings cannot assign these roles. Display each full name beside its actual level, mark the current pair and serving player, and label match sides `BÊN A/B`. Missing or duplicate categories show a warning; player-profile corrections are recognized on the next state render without rebuilding matches. Normal singles/doubles and four-player slot-based relay retain their registered order. This reflects the user's clarification that A/B/C refers to Trình, not team slots; the user will correct missing profile levels themselves.

**Files:** `assets/team-lineup.js` provides the shared safe DOM renderer, `assets/team-lineup.css` provides scoped responsive styles, and `assets/admin-app.js` / `assets/referee-courtside.js` call it. HTML and service-worker asset versions advance together.

- [x] Extend `scripts/registry-timeout-clock-ui.mjs` to check entered levels, active pairs and serving identities at scores 0, 9, 18 on admin 375/1440 and referee 320/375; test duplicate levels followed by a profile correction.
- [x] Observe missing named identities fail first, then observe four meaningful skill-recognition tests fail on order-based pairing.
- [x] Implement read-side recognition and a shared renderer using `textContent`; five recognition tests and four service-selection layouts pass, with no production profile or roster writes.
- [x] Run the complete timeout UI test plus existing MLP, score-entry, referee arena and PWA regressions; inspect mobile screenshots. Six recognition unit tests, four real Worker timeout/service layouts, two score-entry layouts, sixteen referee arena states and nineteen recognition/realtime/preview tests passed. Review caught an excess-roster case, now covered and fixed.
- [x] Review the diff, build the Worker, open and attach a PR, verify CI, merge and deploy. Check production asset identity and health without changing real tournament data.

## Mobile login

Public headers now offer a visible `Đăng nhập` link on home, tournament, ranking, player, about and submission pages, with corresponding preview headers. Shared header layout keeps the link, logo and theme control separate. Login touches were tested in 140 browser cases: fourteen public/preview states, five widths (320/375/390/768/1440), light/dark themes, including actual navigation to the login form. Root additionally checked the changed mobile admin/referee/court-board/preview surfaces after asset-version changes.

`npm run check` passed with the new static assets. No production player skills, team memberships, scores or tournament setup were changed by this work. Website OS bootstrap verification passed; this is not a full-scope compliance claim.

## Profile input and team selection

An additional browser check used the actual BTC player edit form and authenticated Worker PATCH against an isolated SQLite fixture at 375 and 1440 px. Correcting Trình was persisted, survived reload, and updated both admin and referee AB pair identities without rewriting team order. The team picker shows each profile's entered Trình; three-player relay choices use generic member labels and explain grade-based pairing. Four-player position labels remain ordered. The existing registry picker/roster browser regressions and the 19 recognition/realtime/preview tests were rerun after this copy correction; the Worker dry-run build passed again.

The same isolated fixture also verified profile corrections during a live 9–0 match: swapping A/C roles and changing B to B+ through the actual BTC form updated the referee's BC pair after its refresh button was pressed. Scores and stored roster order stayed intact on mobile and desktop.

## Release evidence

- PR [29](https://github.com/capquangfptminhlh/pickle/pull/29) was reviewed, attached, and merged as application commit `5d0b9e89ad18c7b343472e9b1cfb04bc3d4750f8`.
- Final PR [CI 38112611449](https://github.com/capquangfptminhlh/pickle/actions/runs/38112611449) passed for head `71f7a599cc2ffccdf8dbd7200b53569fbeb3d411`.
- [Cloudflare release 38113393104](https://github.com/capquangfptminhlh/pickle/actions/runs/38113393104) passed validation and deployment. Worker regressions passed 1355/1355; integration checks covered accounts without email, roles, scoring, draw/reset and court safety.
- Final deployed Worker version: `6ef06c1d-f0d1-4a85-bfa8-76acfa63d625`, deployed at `2026-10-11T05:02:24Z`.
- Production checks matched fourteen deployed assets to the built release; health and public state returned 200, and three unauthenticated admin/action probes returned 401.
- Production browsers passed 36 login checks: six public pages × 320/375/1440 px × light/dark, with actual navigation to the login form. A separate loaded-home check confirmed both tournament cards render on mobile while the login link remains visible.
- The deployed lineup script passed 48 AB/BC/CA comparisons against real public data for all sixteen MLP teams: nine have complete A/B/C categories and seven currently have three B profiles. Those seven show a correction warning, with no guessed identities.
- Production player profiles, team membership and match scores were not changed by these checks.
