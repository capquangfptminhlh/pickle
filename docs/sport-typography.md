# Sports typography

The approved direction is bold sports typography with strong contrast. The shared layer `assets/typography.css` is loaded after page themes on every public, operator and preview HTML page.

- Barlow 400–800: body text, navigation, controls and team names.
- Barlow Condensed 700–800: headings and score/statistic numerals. Major headings use uppercase; Vietnamese accents retain natural tracking and adequate line height.
- Scores and tables use lining/tabular numerals. Team names retain the wider UI face.
- Fourteen local Latin/Vietnamese WOFF2 subsets total 212,004 bytes. Only the regular Latin body face is preloaded. Font display uses swap; font synthesis is disabled.
- Font source and SIL Open Font License are recorded in `assets/fonts/`. Fonts do not request third-party services at runtime.
- Root and preview service workers precache all font subsets and the exact versioned stylesheet for first offline fallback.

Validation on 2026-10-09: existing browser scenarios pass across 28 public/operator/preview routes at 1440, 375 and 844 pixels in light and dark themes; another 28 scenarios pass at 320 pixels. Tests now assert downloaded Latin/Vietnamese font faces and heading/body families. Both service-worker scopes retain Vietnamese font loading in offline fallback. Admin and organizer workflow checks pass at all three standard sizes; Cloudflare asset build and deploy dry run pass. Independent browser review verified actual Vietnamese glyph coverage for every supplied weight and found no remaining issues after correcting the legacy body-selector cascade.
