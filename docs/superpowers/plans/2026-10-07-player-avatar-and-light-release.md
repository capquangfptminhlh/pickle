# Player Avatar Creation and Light Theme Release Plan

> **For Codex:** Use the executing-plans skill and complete each task in order.

**Goal:** Ship the light admin theme as the default and let admins select, preview, remove, upload, and retry a player avatar while creating a system player profile.

**Architecture:** Keep avatar selection as a small browser module used by the existing admin dialog. The dialog creates the database player first, then uploads the selected file through the existing authenticated avatar endpoint. It retains the created player id if upload fails so retrying cannot create a duplicate. The service workers cache the new module and treat non-successful navigation responses as network failures so their offline fallback remains deterministic.

**Tech stack:** Vanilla JavaScript/CSS, Cloudflare Worker + D1/R2, Playwright 1.55 browser tests, GitHub Actions, Wrangler.

---

## Task 1: Restore the deployment gate and light default

**Files:**
- Modify: `service-worker.js`
- Modify: `preview/service-worker.js`
- Modify: `assets/theme.js`
- Test: `scripts/registry-theme.test.mjs`

1. Add a regression assertion that a 404 navigation while offline falls back to the cached page and retains `data-theme="light"`.
2. Run `node scripts/registry-theme.test.mjs` with Playwright 1.55 and confirm the assertion fails before the fix.
3. In both service workers, throw when a navigation fetch returns a non-OK response before returning or caching it.
4. Bump both cache versions so clients activate the corrected worker.
5. Move theme storage to `pickleup-theme-v2` so the new release starts existing clients in light mode once; keep user-selected light/dark choices after that.
6. Re-run the theme test and confirm desktop, mobile, online, and offline scenarios pass.

## Task 2: Build the reusable avatar picker

**Files:**
- Create: `assets/player-avatar-input.js`
- Modify: `assets/admin-sport.css`
- Modify: `assets/admin-light.css`
- Test: `scripts/registry-player-avatar-ui.mjs`

1. Add failing browser checks for a 76px circular preview, initials derived from the name, JPG/PNG/WebP validation, a 3MB limit, replace/remove controls, 44px touch targets, and no horizontal overflow at 375px.
2. Implement `window.PicklePlayerAvatarInput.mount({ root, nameInput })` with `file()`, `clear()`, `setStatus()`, `setBusy()`, and `destroy()` methods.
3. Keep a previously valid file selected when a replacement is invalid, revoke object URLs on replace/remove/destroy, and expose validation without uploading.
4. Add dark and light palette styles with visible focus, error, preview, and disabled states.
5. Re-run the picker checks until they pass in both themes and viewport sizes.

## Task 3: Integrate create-then-upload recovery

**Files:**
- Modify: `assets/admin-app.js`
- Modify: `admin.html`
- Modify: `preview/admin.html`
- Test: `scripts/registry-player-avatar-ui.mjs`

1. Add failing end-to-end checks that creating with a valid image performs one player POST followed by one avatar POST.
2. Add a failure-once avatar route check: after the upload fails, the dialog shows retry and finish-without-photo actions; retry only uploads and never performs a second player POST.
3. Mount the picker between the form introduction and the name field.
4. On submit, validate the name and avatar, create the player once, freeze profile fields, then upload the avatar if present.
5. Preserve the created player id after an upload error and support retry or finish without photo.
6. Display explicit progress and success/error text and clean up preview resources when the dialog closes.
7. Run the UI test and verify the persisted player has an R2 avatar URL and there are no duplicate player rows.

## Task 4: Wire PWA caches and CI

**Files:**
- Modify: `service-worker.js`
- Modify: `preview/service-worker.js`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/cloudflare.yml`
- Modify: `admin.html`
- Modify: `preview/admin.html`

1. Load the avatar module before `admin-app.js` in production and preview templates.
2. Cache the bare and versioned module URLs in both service workers.
3. Bump admin CSS/app asset versions in both templates and exact service-worker entries.
4. Add the avatar UI regression command to both CI workflows before deployment.
5. Run static source/HTML checks and the full registry suite used by the workflows.

## Task 5: Release and verify production

1. Review `git diff --check`, ensure no credentials or generated scratch files are tracked, and commit the implementation.
2. Push the release branch used by the repository deployment workflow.
3. Watch GitHub Actions through completion and inspect any failure before retrying.
4. Verify `https://pickleup.vn/admin` serves the new asset versions, opens in light mode in a fresh context, toggles to dark and persists, and shows the avatar picker in the create-player dialog.
5. Verify the mobile layout at 375px and confirm no horizontal overflow.
