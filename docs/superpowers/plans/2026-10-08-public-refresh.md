# Public sports refresh implementation plan

**Goal:** Apply the approved sports design across the seven public pages and previews.

**Architecture:** A scoped `assets/public-refresh.css` loaded after theme layers and before tournament-detail CSS owns the shared public design. Existing rendering and form handlers remain in place. Page markup gets a `public-refresh` scope and small structural improvements.

**Tech stack:** Static HTML/CSS, existing JavaScript, Playwright, Cloudflare Worker.

- [ ] Add shared theme tokens, flat navigation, consistent controls, card and field rules; scope away from admin/operator pages.
- [ ] Style home hero and status, remove overlapping decoration and duplicate mobile shortcuts; preserve data hooks and original posters.
- [ ] Apply ranking header/tabs/filter density; compact profile metrics and empty histories; align about, submission and login.
- [ ] Integrate production/preview HTML and bump stylesheet/JS/service-worker versions with cache entries.
- [ ] Run existing browser suites in both themes, verify real-data screenshots, and repair visual/functional findings.
- [ ] Request code review, inspect final diff, build, commit and push. Verify CI/deployment and the production pages.
