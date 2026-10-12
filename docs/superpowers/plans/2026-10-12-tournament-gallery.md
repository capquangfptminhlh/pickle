# Tournament Gallery Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent PostgreSQL adapter and code review. Track steps below.

**Goal:** Let tournament organizers preserve memories in a publicly viewable photo album.

**Architecture:** Dedicated gallery endpoints, durable media and transactional metadata/audits. Shared image validation and photo serialization align Worker and Node implementations; independent gallery UI consumes API methods and uses native dialogs.

**Tech Stack:** Plain JavaScript, D1/R2, Express/PostgreSQL, Playwright.

### 1. Contract and Worker
- [ ] Add failing real-Worker tests in cloudflare/tests/tournament-gallery.test.mjs using accounts-fixture and in-memory R2.
- [ ] Add migration 0020_tournament_photos.sql and shared/tournament-photos.js: maximum 6 MiB, 300-character caption, file signature checks, photo DTO.
- [ ] Add cloudflare/src/tournament-photos.js and dispatch before generic media routes. GET/POST /api/tournaments/:id/photos; PATCH/DELETE /:photoId; GET /:photoId/image. Mutations require role/scope and audit batches. Add version guard trigger for atomic D1 updates.
- [ ] Run node --test cloudflare/tests/tournament-gallery.test.mjs and full Worker suite.

### 2. PostgreSQL parity
- [ ] Add table to database/schema.sql and isolated server/tournament-photos.js registered in server/index.js. File storage private to gallery and served only through authorized route.
- [ ] Add HTTP regression script scripts/registry-gallery-api.mjs to CI after API setup; verify public/private reads and mutation guards.

### 3. UI and Preview
- [ ] Add API methods list/upload/update/delete and Preview persistence methods.
- [ ] Add assets/tournament-gallery.js and .css: organizer dialog, sequential multi-upload, per-file errors, edit caption, explicit remove confirmation, public grid and keyboard accessible enlarged image dialog.
- [ ] Wire tournament cards/detail and public tournament page, including Preview equivalents, cache versions and build assets.
- [ ] Add scripts/registry-gallery-ui.mjs using Worker fixture and test both viewport sizes and organizer actions; execute with local Chromium.

### 4. Release
- [ ] Independent review against approved design then code-quality review; resolve important findings.
- [ ] Run syntax/build, relevant browser/API tests, full Worker suite; commit/push, observe CI and deploy.
- [ ] Verify production assets and public photo endpoint with read-only requests, preserving all 24 pool results.
