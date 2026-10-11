# Completed MLP score and championship verification

The owner requested verification from point entry through championship and of player/team names and scores. Actual browser simulation exposed completed-match display defects: the operator console and public QR page showed reset current scores (0–0), and the referee console retained the first active relay pair (AB). Persisted set results and full completed team names now appear in these views; completed rosters no longer imply an active pair/server. Bracket cards retain game counts and additionally show each set's actual point score. Scoring and qualification rules were not changed by this patch.

Verification on 2026-10-11:

- Real Worker/SQLite simulation: 16 teams, 48 players, four pools, 24 pool matches and 12 Serie A/B knockout/bronze matches. All 36 matches completed via rally and finish operations. Separate champions and bronze paths verified.
- Actual referee UI exercised AB at 0, BC at 9 and CA at 18 for a pool match and Serie B final; correct player names for unique grades and repeated-grade entered-order teams, S2 serving, receiving-side service requirement at 26, completion at 27 and persistence after reload verified.
- Operator, public tournament and public QR views checked at 375px and 1440px: full completed team names, persisted 27–0 points, winner text, independent A/B champions and explicit bracket set points. No page JavaScript errors.
- Three public QR regression cases include persisted results, live current score, Best of 3 last-set score and special-result display. Focused completed-score/series/relay/progress unit suite: 36 passing.
- Existing timeout/identity browser matrix passes at admin 375/1440 and referee 320/375; existing Serie A/B browser scenarios pass at Top 2 mobile/desktop and Top 1 mobile.
- Full Worker suite: 1,376 passing. Wrangler asset build/deployment dry run and changed JavaScript syntax checks pass.
- Independent read-only review caught the adjacent QR defect; the final integrated display paths have no remaining concrete review finding.

Release:

- PR [#31](https://github.com/capquangfptminhlh/pickle/pull/31), tested head `a23839910a349fc99d13a5c6339cf9c453b1b7c3`, merged as `05fe80ec8c0031826f64ec062596cc8b40290f25`. Git diff between tested head and merged app revision is empty.
- Cloudflare main validation/deployment [38122509631](https://github.com/capquangfptminhlh/pickle/actions/runs/38122509631): success. Final Worker version `eb5d4e74-8524-4fe7-9f19-2a328e4f72fc`, deployed 2026-10-11T07:48:18Z.
- Live verification: 21 HTML/JS/CSS/service-worker assets match local built SHA256 digests; health returns 200; three anonymous protected endpoint probes return 401. All 16 live MLP teams resolve correctly across 48 AB/BC/CA pair checks. Mobile homepage renders both tournaments and a visible login link without page errors.
- Live before/after comparison at 07:52Z confirms all 48 player grades, 16 team IDs, entered rosters and current match results unchanged. Zero authenticated production writes. The live tournament currently has no matches; completed-match testing used isolated synthetic Worker data, not real tournament results.
- Full main desktop/mobile/PostgreSQL CI [38122509648](https://github.com/capquangfptminhlh/pickle/actions/runs/38122509648) is still running at this evidence checkpoint; do not represent it as passed. The prior full main CI 38121327639 passed before this display-only patch.

This verifies the specified MLP championship and display scenarios; it is not a claim that every possible application scenario is defect-free. Local screenshots and detailed outputs are retained in ignored `ui-artifacts/mlp-championship/` and `scratch/completed-*.log`.
