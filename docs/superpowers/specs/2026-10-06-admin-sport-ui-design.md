# Pickleup dark sport admin design

The owner selected “Tông tối thể thao, điểm nhấn lime” on 2026-10-06, following the proposed upgrade of the existing admin, athlete registry and tournament operator screens. This is the approved visual direction; preserve the current workflows and role permissions.

Use charcoal `#0b1110` as the page background, `#15201b` for surfaces, `#1b2a22` for raised surfaces, `#2a3b31` for separators, `#edf6ee` for primary text, `#a3b5a8` for secondary text and `#d9ff63` with `#102014` text for primary actions. Green continues to communicate success. Status labels retain text alongside color. Keep the existing brand assets and local SVG icons.

The admin and preview admin pages share a dedicated stylesheet scoped to an `admin-sport` body class, loaded after existing styles. Public pages retain their current design. The visual system covers the sidebar, header, dashboard, athlete/team tables, tournament cards, operator dialog, player picker, draw overlay, scoring dialog, forms, mobile dock and feedback. Avoid white-on-white or dark-on-dark content caused by older inline styles.

For super admins and organizers, the homepage focuses on tournament operations: a hero greeting with next-match context, four clear shortcuts for tournaments/athletes/scores/referees, real metrics for tournaments/teams/live/completed matches, upcoming match cards and recent scoped activity. Club/finance/referee home behavior remains role appropriate. No placeholder numbers, invented business claims or new backend endpoints.

Readability and interaction standards: body/data text 14–16px, secondary copy at least12px, metric labels at least11px; controls at least44px tall and sufficient spacing; visible keyboard focus, accessible close/menu controls and skip link; horizontal scrolling confined to large tables/brackets; dialogs fit 375px screens and landscape heights with scrollable content; reduced-motion disables decorative and page-transition movement. Contrast checks target at least4.5:1 for ordinary text.

Verify with a local real Worker/SQLite browser fixture at1440×1000,375×812 and844×390, plus existing roster/account/scoring regressions. Capture representative desktop/mobile screenshots using synthetic data only. CI runs the new UI quality regression before automatic Cloudflare release. Production verification remains read-only.
