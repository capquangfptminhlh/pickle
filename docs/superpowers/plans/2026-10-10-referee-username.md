# Referee login without mandatory email

**Goal:** BTC creates and edits referees using a login name and password; a referee logs in without an email address.

**Design:** Login names are 3–32 ASCII letters/digits/dot/underscore/hyphen, normalized to lowercase. Display names remain independent and support Vietnamese. Existing email accounts remain valid. Referee account forms and the general account form when referee is selected accept the login name. Scope, password policy, audit, session revocation and role checks remain unchanged.

The legacy `app_users.email` field is the unique login identifier in both databases; it has no email-format constraint or outbound-email use. Reuse it as the canonical identifier without a schema migration or invented email addresses. API callers use `username` for the new behavior; legacy `email` writes retain email validation. Both authentication APIs accept username or email. Account responses expose a username alias for names without `@`.

**Validation:** Real Worker/SQLite tests first demonstrate missing support, then exercise creation, normalization, duplicates/races, rename, password reset, account lock, legacy email compatibility and scope. UI tests create a referee without email, log in with the real form and continue assigned scoring. Node/PostgreSQL API regression covers the same new identity contract. Preview supports the same UI.

- [x] Write and run failing Worker and UI tests.
- [x] Add shared identifier validation and apply it to Worker and Node account/auth endpoints.
- [x] Update create/edit forms, login labels, preview, and existing UI journeys.
- [x] Run backend and browser checks; request independent review. Worker 1,156 tests; 4 complete username scoring journeys; account/center UI and preview passed. PostgreSQL integration runs in CI.
- [ ] Bump cache versions, deploy, verify the deployed source and public login form; report the tested scope.
