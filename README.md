# Pickle Tour

Tournament operations MVP for pickleball.

## Current vertical slice

- Operator dashboard and live center
- Tournament list + create tournament
- Team/participant list + add team
- Match schedule and court monitor
- Mobile-friendly score entry
- Per-set scores, win-by-two validation, undo
- Finish match and audit log
- Automatic pool standings update
- Knockout semifinal winners advance to final
- Bracket and court views
- Role preview: Super Admin / Organizer / Referee
- Browser persistence via localStorage for demo testing

## Governance

This repo bootstraps from `capquangfptminhlh/seo-web` Website OS. See `AGENTS.md`, `.website-os.yml`, and `governance/`.

## Important

This is a development vertical slice, not a launch-complete production system. Authentication, server-side authorization, database persistence, payments, real referee accounts, realtime transport, and public SEO pages still require production implementation and verification.
