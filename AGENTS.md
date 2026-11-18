# AGENTS.md — Pickle Tour

## Mandatory SEO Alpha Research Gate (2026-11-18)

Before any SEO, GEO, AEO, organic content, schema, canonical, metadata or internal-link task, resolve the current `capquangfptminhlh/seo-web@main` commit SHA and follow the complete `governance/website-os.manifest.yml#mandatory_read_order`. This includes `standards/Website_OS_SEO_Alpha_Research_Gate_v1.0.0.md`, `governance/seo-alpha-policy.yml`, `alpha-engine/README.md`; additionally read `alpha-engine/lab/README.md`. Record observed_at, source SHA, policy SHA-256 and PASS/HOLD in `.website-os/evidence/seo-alpha-bootstrap.yml` for this SEO run. Missing/stale normative rule => **HOLD — SEO ALPHA RESEARCH GATE NOT LOADED**. Review lab findings as research only: no auto-publish, production changes require two human reviewers and owner approval. Existing Website OS/local gates stay in effect. 


This project is governed by the central Website OS.

- source repo: capquangfptminhlh/seo-web
- source ref: main
- source commit observed: ef18d255150f3a77a7c7587feccf1ba7c419ad7b
- central manifest: governance/website-os.manifest.yml
- central entrypoint: AGENTS.md
- observed_at: 2026-10-08
- project: Pickle Tour
- project repo: capquangfptminhlh/pickle

Load the central repository at the recorded commit and follow its manifest's
mandatory reading order before applying local rules. The local manifest is an
exact snapshot of that source; referenced standards and enforcement tools are
resolved in the central repository. Local rules extend central governance.
If the central source or required normative files cannot be loaded, record
`HOLD — WEBSITE OS BOOTSTRAP MISSING OR STALE`.

After central bootstrap, read `.website-os.yml`, `README.md`, and the
project-specific evidence under `governance/` relevant to the current task.

Local rules:
1. Tournament-day operator flows are higher priority than marketing decoration.
2. Score entry must be mobile-first, reversible, and audited.
3. Public results must never expose admin-only controls.
4. Any production persistence must use authenticated roles and server-side authorization.
5. Unknown business facts, fees, rankings, sponsors, or claims remain demo/UNVERIFIED until supplied by the owner.
