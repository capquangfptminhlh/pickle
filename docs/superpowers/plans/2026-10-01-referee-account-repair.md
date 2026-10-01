# Referee account maintenance

Continue the user's authorized administration audit and deployment. Repair the existing Cloudflare account flows; preserve the current interface and database records.

1. Reproduce mismatched account DTO fields, ignored referee email updates, foreign-target scope bypass, missing validation and missing audit persistence.
2. Reuse child-account validation and authorization for referee create/edit, keeping the referee role fixed. Validate both the existing and requested tournament scopes. Exclude global/foreign accounts from an organizer's referee list.
3. Return the UI account fields and joined tournament/club labels alongside existing camelCase fields, without secrets. Save account mutation and audit together in a D1 batch.
4. Test actual Worker requests against migrated SQLite, including atomic rollback and password reset. Verify existing desktop/mobile forms retain assigned scopes and use escaped referee names.
   In PostgreSQL account routes, distinguish an omitted scope from an explicit null: preserve omitted values, allow only the admin to clear scope, reject an organizer attempting to clear it.
5. Add regression coverage to deployment validation, review the patch, run checks, push main and confirm CI/deployment plus production assets.

No changes to tournaments, scores, existing match assignments, user roles or credentials are made on production as part of verification.

Local evidence: account regressions reproduced the reported defects before fixes; all 30 Worker tests and eight Preview tests now pass. Four desktop/mobile admin/organizer browser contexts use the real Worker with a migrated SQLite database. The 12 existing registry browser regressions, native Wrangler D1 account HTTP checks, Cloudflare operations smoke, permission smoke and deployment dry run pass. PostgreSQL integration is checked by the existing CI service before completion.
