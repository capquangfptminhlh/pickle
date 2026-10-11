# MLP player identity labels

**Goal:** Identify MLP player A/B/C from the entered Trình column on both score entry surfaces, distinct from match sides A/B.

**Design:** A three-player relay resolves roles from unique entered skill categories A/A+, B/B+, C/C+. Names, roster order and numeric ratings cannot assign these roles. Display each full name beside its actual level, mark the current pair and serving player, and label match sides `BÊN A/B`. Missing or duplicate categories show a warning; player-profile corrections are recognized on the next state render without rebuilding matches. Normal singles/doubles and four-player slot-based relay retain their registered order. This reflects the user's clarification that A/B/C refers to Trình, not team slots; the user will correct missing profile levels themselves.

**Files:** `assets/team-lineup.js` provides the shared safe DOM renderer, `assets/team-lineup.css` provides scoped responsive styles, and `assets/admin-app.js` / `assets/referee-courtside.js` call it. HTML and service-worker asset versions advance together.

- [x] Extend `scripts/registry-timeout-clock-ui.mjs` to check entered levels, active pairs and serving identities at scores 0, 9, 18 on admin 375/1440 and referee 320/375; test duplicate levels followed by a profile correction.
- [x] Observe missing named identities fail first, then observe four meaningful skill-recognition tests fail on order-based pairing.
- [x] Implement read-side recognition and a shared renderer using `textContent`; five recognition tests and four service-selection layouts pass, with no production profile or roster writes.
- [x] Run the complete timeout UI test plus existing MLP, score-entry, referee arena and PWA regressions; inspect mobile screenshots. Six recognition unit tests, four real Worker timeout/service layouts, two score-entry layouts, sixteen referee arena states and nineteen recognition/realtime/preview tests passed. Review caught an excess-roster case, now covered and fixed.
- [ ] Review the diff, build the Worker, open and attach a PR, verify CI, merge and deploy. Check production asset identity and health without changing real tournament data.

## Mobile login

Public headers now offer a visible `Đăng nhập` link on home, tournament, ranking, player, about and submission pages, with corresponding preview headers. Shared header layout keeps the link, logo and theme control separate. Login touches were tested in 140 browser cases: fourteen public/preview states, five widths (320/375/390/768/1440), light/dark themes, including actual navigation to the login form. Root additionally checked the changed mobile admin/referee/court-board/preview surfaces after asset-version changes.

`npm run check` passed with the new static assets. No production player skills, team memberships, scores or tournament setup were changed by this work. Website OS bootstrap verification passed; this is not a full-scope compliance claim.
