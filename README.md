# Pickle Tour

Self-hosted tournament operations platform for pickleball. No Supabase dependency.

## Public experience
- tournament discovery
- tournament detail pages
- live score over Socket.IO
- pool standings
- knockout bracket
- player rating leaderboard
- responsive desktop/mobile UI

## Admin
- Secure JWT HttpOnly login with active-account revalidation on every protected request
- login attempt throttling, same-site secure cookies, origin checks, Helmet security headers
- child account management for Super Admin
- delegated roles: Organizer (BTC), Referee, Club Manager and Finance; permissions are enforced server-side
- locked child accounts lose API access immediately, even if an older JWT has not expired
- tournament creation
- multiple divisions / event types
- courts
- players, clubs, teams, seeds and groups
- manual match creation
- automatic round-robin schedule generation
- court/time/referee assignment
- mobile score console
- Best of 1/3/5, 11/15/21 points, win-by-two
- optimistic version locking for concurrent scorers
- finish set / finish match
- bracket advancement
- standings calculated from confirmed match data
- audited Undo with downstream bracket protection
- referee account creation and assignment
- multiple child accounts with role changes, club scope, lock/unlock and password reset; password reset revokes old sessions
- registration and payment reconciliation
- auditable manual player rating adjustment
- password rotation
- audit log

## Architecture
- Node.js 22 + Express 5
- PostgreSQL 17
- Socket.IO realtime
- JWT HttpOnly cookie authentication
- Docker Compose
- Nginx reverse proxy example
- PostgreSQL backup/restore scripts
- GitHub Actions CI with PostgreSQL integration smoke tests

## Run on VPS
See `docs/VPS_DEPLOY.md`.

Required production environment:
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `JWT_SECRET` (use a long random secret; 48+ chars recommended)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PUBLIC_BASE_URL`
- `SEED_DEMO=false`

Start:
```
sh scripts/deploy-vps.sh
```

Health:
```
GET /api/health
```

Admin login:
```
/login
```

## Security & database safety
PostgreSQL is bound to the internal Docker network and the application port is bound to `127.0.0.1:8080`; expose the website only through a TLS reverse proxy.

Authentication uses bcrypt password hashes plus short-lived JWTs stored in HttpOnly, SameSite=Strict cookies; production uses the `__Host-` cookie prefix. Sessions are revalidated against the database and carry a credential version, so password changes/resets revoke older sessions immediately. Login attempts are throttled, production state-changing requests enforce the configured origin/fetch metadata, CSP blocks inline script execution, private receipts require authentication, uploaded files are checked by magic bytes, and administrative roles/club scopes are enforced on the server rather than by hiding buttons.

Score changes are persisted in `score_events`; account, club, attendance, treasury and other sensitive administrative changes are protected by server authorization and/or `audit_logs`.

## Governance
This project bootstraps from `capquangfptminhlh/seo-web` Website OS. Governance evidence is under `governance/`.

`governance/website-os.manifest.yml` is a snapshot of the central manifest at the
source commit recorded in `.website-os.yml`. Resolve the manifest's standards and
enforcement tools in that central repository, rather than relative to this local
snapshot. Restoring this file does not certify the project's launch completeness.

## Dependency maintenance
Use `npm ci --ignore-scripts` at the root and in `cloudflare/` to install the
committed dependency trees. CI audits development tools as well as production
dependencies with `npm audit --audit-level=high`.

Cloudflare overrides Miniflare's Sharp dependency to `0.35.5` because Wrangler
`4.148.0` still resolves the affected `0.35.4` version (GHSA-wq5f-xc86-pv6w).
Remove the override when Wrangler's dependency tree includes a patched version,
then repeat the audit, Worker build and local runtime tests.

## Deployment status
The repository contains the production backend/auth stack, but a public secure admin deployment still requires a server runtime + PostgreSQL + HTTPS. GitHub Pages is used only for the public/static presentation and intentionally does not provide a fake secured admin session.
