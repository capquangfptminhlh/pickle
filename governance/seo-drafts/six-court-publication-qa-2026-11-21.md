# PickleUp — six-court article publication QA matrix (2026-11-21)

Status: **HOLD / evidence only**. This is not a publication approval or a substitute for the Website OS enforcement engine.

## Scope and source
- Repository: `capquangfptminhlh/pickle`; PR #67 branch `fix/seo-alpha-bootstrap-20261121`.
- Draft: `governance/seo-drafts/six-court-scheduling-2026-11-21.md`.
- Original SVG: `docs/seo-assets/six-court-scheduling-diagram.svg`.
- Central governance: `capquangfptminhlh/seo-web@main`, manifest v1.4.0; normative SEO Alpha, K0 and editorial gates apply.
- Intended query cluster: informational guidance for organizing six-court pickleball schedules; not a live tournament listing, official rulebook, or software feature landing page.

## Explicit release assertions (all must be evidenced before publishing)
| Check | Evidence required | Current result |
|---|---|---|
| Unique intent / canonical owner | Current URL inventory, live crawl and K0 decision record | UNVERIFIED |
| Existing article/template | Existing public indexable article route and responsive template | UNVERIFIED |
| Article factual accuracy | Check illustrative 09:19/09:20 and 35-minute rest examples; distinguish operator policy from official rules | DRAFT ONLY |
| Original image | SVG parse/render, accessibility alt, source presence, thumbnail and image HTTP 200 | SOURCE PATH RECORDED; RENDER UNVERIFIED |
| Internal links | Resolve links to real public URLs; never link admin pages | UNVERIFIED |
| Mobile | Screenshots and interaction check at 320, 375, 390 and 768 px | NOT RUN |
| Search metadata | Unique title, description, self-canonical, sitemap entry and index policy | NOT IMPLEMENTED |
| Website OS | Bootstrap freshness, SEO Alpha attestation, K0 and enforcement outputs | NOT INDEPENDENTLY VERIFIED |
| CI | Required checks for exact final PR head SHA | RECHECK AFTER CHANGES |
| Approval | Two independent human reviewers and site owner approval | NOT RECORDED |
| Production | Authorized release SHA, article/image HTTP 200, canonical and sitemap | NOT RELEASED |

## Tournament-day regression guard
Before any deployment touching shared site code, confirm that manual scheduling still rejects overlapping court slots, shared participants, stale schedule versions and changes to active matches. The existing PR #60 guard and PR #66 boundary regression are reference tests, not a substitute for full live-device six-court QA. No migration, production writes, score mutation, or tournament data changes are authorized by this document.

## Decision
Keep article and SVG as unindexed draft assets. Do not invent a `/blog/` canonical, add a sitemap URL, or report a live article until all release assertions have actual evidence. The target of three posts per day is conditional on qualification and approval, not a forced publishing quota.
