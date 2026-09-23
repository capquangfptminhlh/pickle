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
- JWT login with roles: Super Admin, Organizer, Referee, Club Manager, Player
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
- referee account creation
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
- `JWT_SECRET` (32+ chars)
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PUBLIC_BASE_URL`

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

## Database safety
PostgreSQL is bound to the internal Docker network and the application port is bound to `127.0.0.1:8080`; expose the website only through a TLS reverse proxy.

Score changes are persisted in `score_events` and sensitive administrative changes in `audit_logs`.

## Governance
This project bootstraps from `capquangfptminhlh/seo-web` Website OS. Governance evidence is under `governance/`.

## Deployment status
The repository contains the production self-host stack, but a public production deployment still requires access to the target VPS plus its domain/TLS configuration. The existing AutoTax deploy agent was intentionally not reused because it is project-specific.
