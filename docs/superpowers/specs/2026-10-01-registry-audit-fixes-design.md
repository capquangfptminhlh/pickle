# Registry audit corrections

Approved scope: the owner accepted the five audit findings and instructed implementation on 2026-10-01. Retain the existing operator interface.

1. Prevent active division membership conflicts during concurrent creation, imports, legacy additions and reactivation. D1 triggers enforce membership at write time; API prechecks retain useful errors. Migrations add guards without deleting existing records.
2. Persist the editable club field on team creation. Resolve existing active club names with Vietnamese Unicode case folding, validate explicit club IDs, and insert new clubs inside the team transaction.
3. Edit member IDs in the existing team dialog. Replace links atomically, preserve the team ID, registrations and scheduled matches, validate active profiles and division counts, and record before/after audit data. Reject member changes once any associated match has started, has scores/sets, is live/completed/walkover, or has a winner. Metadata remains editable. Apply the same API contract to Node and Preview.
4. Show CSV issues inside the import dialog as escaped row/field/name/reason details. Keep the CSV available to correct and retry.
5. Match CSV full names after NFC normalization, trim and Vietnamese lowercase conversion. Preserve accents and reject ambiguous names; never create implicit athletes.

Verification: actual Worker requests against migrated SQLite, concurrent interleavings, atomic rollback, registration preservation, authorization, Unicode names and ambiguous imports. Browser checks on desktop/mobile exercise club selection, roster replacement and row issues. CI must execute these regression checks before deployment.

Governance bootstrap: capquangfptminhlh/seo-web main at ef18d255150f3a77a7c7587feccf1ba7c419ad7b, manifest 1.3.0, observed 2026-10-01. Mandatory central reading completed; local AGENTS and existing scope/design records loaded. This is maintenance of the existing application, with no new marketing pages, imagery or URL architecture; no claim of full Website OS launch completeness.
