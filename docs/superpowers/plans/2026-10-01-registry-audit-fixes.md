# Registry Audit Fixes Implementation Plan

> Execute in this session with test-driven-development, independent UI implementation and a final spec/code review.

**Goal:** Correct the five accepted registry audit findings and release the verified change.

**Architecture:** Preserve the global registry and existing UI. D1 triggers guard concurrent membership writes; API transactions replace rosters without changing team identity. Unicode-aware lookup and structured errors fix CSV imports.

**Tech Stack:** Cloudflare Workers/D1, Node/Postgres, vanilla JS, Playwright, node:test.

- [x] Add `cloudflare/tests/registry-api.test.mjs` using real Worker.fetch and SQLite with all migrations. Assert club persistence, reactivation conflict, concurrent creation rollback, roster replacement/registration preservation, started-match lock, scope and Unicode import behavior. Run `npm test` in `cloudflare`; verify the new cases fail before implementation.
- [x] Add `cloudflare/migrations/0003_roster_guards.sql` and adapt `cloudflare/src/index.js` team POST/PATCH and error mapping. Add Unicode name lookup in `cloudflare/src/operations.js`. Run the API regressions until green.
- [x] Extend `assets/player-picker.js` initial selections and `assets/admin-crud.js` roster editing; render structured CSV errors in `assets/admin-app.js`. Browser-test existing selection, replacement and escaped row issues at desktop/mobile sizes. Bump affected script versions in `admin.html` and `preview/admin.html`.
- [x] Apply the roster PATCH and reactivation contract to `server/index.js` and `preview/preview-api.js`, preserving existing roles and history. Check JS syntax and Preview browser behavior.
- [x] Add `npm test` and registry API integration checks to `.github/workflows/cloudflare.yml`. Run local Wrangler dry run, migrated local Worker smoke/permissions/regressions and browser checks. Review spec coverage then code quality, resolving all findings.
- [ ] Commit, merge into main, push for authorized automatic deployment. Wait for CI/Cloudflare success and verify production health/static assets without writing test records into production.
