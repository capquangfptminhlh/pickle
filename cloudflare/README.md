# PickleUp Cloudflare backend

This directory is the Cloudflare runtime for the tournament app.

## Architecture

- Cloudflare Workers: HTTP API and server-side authorization.
- D1: shared tournament, player, court, account and scoring data.
- Durable Objects + WebSockets: realtime score/state notifications across phones.
- R2: player avatars, tournament images and payment receipts.
- GitHub Pages can remain the frontend. `assets/api.js` supports a remote API base and Bearer sessions.

The existing Node/PostgreSQL server remains in the repository during migration so the current site is not broken while Cloudflare is being provisioned.

## Required Worker secrets

- `SESSION_SECRET`: random string, at least 32 characters.
- `BOOTSTRAP_ADMIN_EMAIL`: initial super-admin email.
- `BOOTSTRAP_ADMIN_PASSWORD`: initial password, at least 12 characters.

The bootstrap account is created only when the D1 user table is empty.

## GitHub Actions deployment

Repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `PICKLE_SESSION_SECRET`
- `PICKLE_ADMIN_EMAIL`
- `PICKLE_ADMIN_PASSWORD`

Repository variable:

- `CLOUDFLARE_DEPLOY_ENABLED=true`

The workflow first validates the Worker. Deployment is disabled until that repository variable is enabled, so adding this backend cannot accidentally break the current GitHub Pages site.

After the Worker is live, set `window.PICKLE_API_BASE` on the GitHub Pages build to the Worker origin. The API client then sends Bearer tokens and uses the Durable Object WebSocket automatically.

## Local development

Install dependencies in this directory, apply local D1 migrations, then run Wrangler dev. Local D1/R2/DO resources are isolated from production by Wrangler.
