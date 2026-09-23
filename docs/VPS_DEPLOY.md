# VPS deployment

Pickle Tour is self-hosted. It does not use Supabase.

## Requirements
- Docker Engine + Docker Compose plugin
- a domain/subdomain pointing to the VPS
- Nginx or another reverse proxy
- ports 80/443 open

## First deploy
1. Clone this repository on the VPS.
2. Copy `.env.example` to `.env`.
3. Set a strong PostgreSQL password, JWT secret, first admin email/password, and public origin.
4. Run `sh scripts/deploy-vps.sh`.
5. Confirm `http://127.0.0.1:8080/api/health` returns `status=ok`.
6. Configure reverse proxy/TLS using `deploy/nginx.conf.example` as a template.
7. Login at `/login`.

## Updates
Pull the approved commit and run `sh scripts/deploy-vps.sh`. Docker rebuilds the app, migrations run idempotently, and PostgreSQL data remains in the named volume.

## Backup
Run `sh scripts/backup-db.sh`. Backups older than 14 days are removed by the script.

## Restore
Stop tournament operations first, then run `sh scripts/restore-db.sh backups/<file>.dump`.

## Security
- Never commit `.env`.
- Do not expose PostgreSQL port 5432 publicly.
- Put TLS in front of port 8080.
- Use unique referee passwords.
- Rotate the initial admin password after first login.
- Restrict VPS SSH access.
