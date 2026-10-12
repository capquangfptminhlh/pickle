# Knockout-only reset

Approved requirement: replace the bracket screen reset with a scoped Serie A/B reset, preserving all pool groups, matches, scores, history and roster data. No live reset requested by this implementation task.

GET/POST reset-knockout requires organizer scope, preview token and DAT LAI confirmation. Deletes only bracket_slot matches, archives deleted records, and refuses actual play/history/sets. Automatic first-round byes are allowed if no play exists. Worker uses an atomic division signature guard; PostgreSQL locks division and bracket rows; Preview mirrors behavior. UI shows exact scope and count and returns to bracket after reset. The existing full reset remains only in its original tournament configuration flow.

Validation: endpoint regression failed before implementation; role guard, concurrent change rejection, pool preservation, bye and audit rollback tested. Real Worker browser tested admin/organizer at 375/1440 including actual scoped reset and preservation. Full suite/build/deployment recorded in task outputs.
