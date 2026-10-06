# Dark sport admin UI implementation plan

> For agentic workers: execute the owner's selected dark sport/lime direction using subagent-driven-development and independent spec/quality review. Existing deployment authorization remains valid.

**Goal:** Deliver a readable and cohesive dark sport admin UI across operator screens and phone sizes.

**Architecture:** Add a scoped `assets/admin-sport.css` visual layer to admin/preview admin templates. Reuse current components, SVG icons and native controls. Make the management dashboard show actual tournament data and shortcuts while preserving other roles and permissions. Keep public pages isolated.

**Tech Stack:** Vanilla JavaScript/CSS, Playwright, real Worker/SQLite browser fixtures, GitHub Actions and Cloudflare.

- [x] Add `scripts/registry-design-ui.mjs` real-Worker browser fixture and capture the current baseline. Assert dark background, readable copy, real management metrics, at least44px controls, contained scrolling, player-picker/dialog usability and reduced-motion behavior. Observe baseline failures before implementation.
- [x] Create `assets/admin-sport.css`; update `admin.html` and `preview/admin.html` with scoped theme class, stylesheet, accessible close labels and skip link. Follow the approved palette and all required screen states. Do not change public templates or application IDs.
- [x] Update `assets/admin-app.js` management dashboard to use real state counts and tournament shortcuts. Preserve role visibility and existing action handlers; escape dynamic content touched by new rendering. Improve athlete row markup with reusable styling hooks, localized gender labels and safe visible names.
- [x] Run the new visual/functional browser regression at desktop/phone/landscape, inspect screenshots and correct contrast/layout findings. Run existing registry/accounts/scoring browser tests and relevant unit tests. Add new UI script to CI and Cloudflare validation, bump affected asset versions and update the service worker cache version.
- [ ] Complete spec then quality review. Build assets/dry run, commit/push reviewed work, wait for both CI and Cloudflare success, then verify current production assets, HTTPS, authorization and public page isolation without test production writes.

The UI/UX Pro Max skill supplied the accessibility/layout principles. Its local `scripts`/`data` entries point to absent `D:/CodexData/src/ui-ux-pro-max` files, so recommendations use the documented rules and the owner's selected palette rather than its unavailable search CLI. Existing Website OS bootstrap passed today against central source `ef18d255150f3a77a7c7587feccf1ba7c419ad7b`; scoped maintenance, no full-launch claim.

Operator validation exposed an existing draw-label MutationObserver feedback loop and a non-interactive div overlay below the native operator modal. Fixed idempotent labels and a nested native draw dialog, with two RED-to-GREEN regressions and actual Worker save checks.

Integrated origin/main `7e5304b` without dropping skill tiers, balanced team draw, poster, QA, or the published tournament. Preserved the Trình column and newer API/CRUD versions. The newly integrated skill pairing overlay now uses a native modal and an explicit non-submit trigger; the real Worker harness verifies pairing controls, A+/C labels, and return to the operator dialog. Full merged suite: 1,035 tests passed.
