# Site-wide Sport UI and Theme Choice Implementation Plan

> Use subagent-driven-development for separate palette layers, followed by independent spec and quality review. Existing owner authorization covers main and automatic Cloudflare deployment.

**Goal:** Consistent Pickleup pages with white as the default and the brighter dark sport/lime palette available through a persistent toggle, reflecting the owner's latest request on2026-10-07.

**Architecture:** Shared dark styles scoped to body.site-sport, an admin-specific dark layer, final scoped public/admin light overrides, and a shared accessible theme control. Initialize saved preference in the head. Preserve API contracts, role authorization, scoring semantics, hidden states, posters and QR images.

**Tech Stack:** Vanilla CSS/HTML, Playwright, real Worker/SQLite fixtures, GitHub Actions, Cloudflare.

- [x] Build scripts/registry-site-design-ui.mjs with actual Worker responses, published and missing/private cases, synthetic athletes/teams/matches, functional feedback, screenshots and contrast/overflow/touch checks at1440,375,844. Capture failing baselines before implementation.
- [x] Implement assets/site-sport.css and improve admin-sport.css: brighter dark cards/text, readable captions, distinct semantic states, original uncropped posters, visible focus, local table/bracket scrolling and reduced motion.
- [x] Integrate all24production/preview templates, skip links, labels, missing-tournament recovery and complete preview offline markup. Preserve remote organizer workflow/history and full-resolution portrait poster updates.
- [x] Add early assets/theme.js initialization plus theme.css: default light, accessible44px toggle on every page, safe persistence, tab synchronization, updated browser theme-color and visible mobile controls.
- [x] Implement scoped site-light.css and admin-light.css through separate CSS implementers. Inspect public/utility pages and18admin screens without changing dark mode or operator actions.
- [x] Update manifests and both PWA workers. Precache the exact versioned theme URLs requested by offline HTML as well as bare paths; retain authenticated API exclusions.
- [x] Add a failing-then-passing preference browser regression including clean service-worker install followed by the first offline fallback in both scopes. Verify navigation/reload persistence, tab synchronization and denied storage.
- [x] Run84site cases per palette,28phone cases per palette with normal motion,6admin/organizer cases per palette, existing registry/accounts/scoring/legacy browser regressions, and all1,043unit tests. Wire both palettes and preference checks into CI and Cloudflare validation. Build73assets and pass Wrangler dry run.
- [x] Complete independent spec review including the offline cache correction.
- [x] Complete fresh independent quality review of the theme option, resolve findings, and re-review if needed.
- [ ] Fetch concurrent origin changes without force push, commit reviewed files, push main and wait for CI plus Cloudflare success.
- [ ] Verify production HTML/assets against the built files, HTTPS/D1, auth boundaries, realtime, all public pages at desktop/phone sizes, theme controls and admin login read-only.

Use bundled Node24 locally and configured Node22 in CI. Keep synthetic screenshots in ignored ui-artifacts and dated release evidence in ignored scratch/website-os-20261007. This is scoped visual maintenance; no production test records or full business-launch claim.
