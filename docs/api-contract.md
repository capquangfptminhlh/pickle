# Production API contract

The static vertical slice uses browser storage only. Production should expose authenticated APIs.

## Roles
- super_admin: all operations
- organizer: tournament/division/registration/schedule/score administration for assigned tournaments
- referee: read assigned matches + score assigned live matches
- club_manager: club roster and club events
- player: own profile/registration and public data

## Core endpoints

- POST /api/tournaments
- GET /api/tournaments/:id
- PATCH /api/tournaments/:id
- POST /api/tournaments/:id/divisions
- POST /api/divisions/:id/teams
- POST /api/divisions/:id/generate-groups
- POST /api/divisions/:id/generate-schedule
- GET /api/divisions/:id/standings
- GET /api/divisions/:id/bracket
- PATCH /api/matches/:id/assignment
- POST /api/matches/:id/start
- PUT /api/matches/:id/score
- POST /api/matches/:id/finish-set
- POST /api/matches/:id/finish
- POST /api/matches/:id/undo
- GET /api/tournaments/:id/live
- GET /api/tournaments/:id/audit

## Score mutation contract

Every score write must include the current match version. Server rejects stale writes with HTTP 409 so two scorers cannot silently overwrite each other.

Example logical payload:
- matchId
- expectedVersion
- setNo
- scoreA
- scoreB
- action
- reason when correcting a completed score

Server responsibilities:
1. authorize actor for this tournament/match;
2. validate scoring rules;
3. lock the match row;
4. write set/result;
5. increment match version;
6. recalculate standings or advance bracket atomically;
7. append audit log;
8. publish realtime event to public/live clients.

## Integrity rules
- completed results are corrected through an audited correction action, never silently overwritten;
- bracket advancement and standings update are transactional;
- referee cannot edit tournament configuration;
- public endpoints never return private contact/payment fields;
- all admin pages are noindex and require authentication.
