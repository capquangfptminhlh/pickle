# Pickle Tour — Production Scope

A feature is not "done" until UI, API, persistence, authorization, mobile behavior, audit/error handling, and production deployment behavior are covered.

## Applications
- Public Web: tournaments, live scores, standings, bracket, player ranking/profile.
- Player PWA: personal profile/avatar, current rating, rating history, personal scorecard, match history, tournaments, partner history, registrations/payments, notifications.
- Referee PWA: assigned matches, courtside scoring, undo/correction rules, offline-safe shell, realtime conflict handling.
- Organizer/Admin PWA: tournaments, divisions, courts, clubs, players, teams, scheduling, referees, payments, sponsors, media, reports, audit, system settings.

## PWA acceptance criteria
- Web app manifest and standalone display.
- Correct scope/start URL.
- Install UI and beforeinstallprompt handling.
- Service worker registered over HTTPS.
- App shell available offline.
- Navigation fallback to offline page.
- Static assets cache with versioning.
- API/socket/auth requests never cached by service worker.
- Update-available notification and controlled activation.
- Mobile safe-area support.
- Standalone-mode UI adjustments.
- Maskable/vector application icon.
- Theme/background colors.
- Shortcuts for Live Score, Player App and Admin.
- Reduced-motion accessibility.
- Offline/online status UI.
- GitHub Pages preview has its own scoped manifest/service worker.

## Player account acceptance criteria
- One app_user can link to one player profile.
- Player can edit only own editable profile fields.
- Player avatar upload with file validation.
- Personal dashboard shows rating, W/L, points for/against, recent form.
- Match history includes tournament, round, partner/opponents, per-set score and result.
- Rating history with reason and timestamp.
- Tournament history and current registrations/payment status.
- Notifications inbox/read state.
- Public player profile excludes private phone/email fields.

## Scoring acceptance criteria
- Mobile-first touch console.
- Server validates point/set/match state.
- Optimistic version lock prevents silent concurrent overwrite.
- Undo is event-based and idempotent.
- Corrections after downstream bracket starts are blocked or explicitly resolved.
- Every sensitive result mutation is audited.
- Public live score updates through realtime channel.

## Production acceptance criteria
- Dockerized self-host deployment.
- PostgreSQL persistent volume.
- Upload persistent volume.
- TLS reverse proxy.
- Health check.
- Backup/restore scripts.
- CI syntax + PostgreSQL integration smoke test.
- Secrets never committed.
- Admin pages noindex.
- Production domain sitemap/robots generated dynamically.
