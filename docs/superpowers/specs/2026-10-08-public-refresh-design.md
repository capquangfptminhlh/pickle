# Public sports design refresh

The owner approved a bold sports direction and the site-wide priorities proposed after a seven-page desktop/mobile audit. Use deep green for hero areas, lime for primary actions, and neutral surfaces for reading and data. Keep the existing tournament detail layout.

Scope: homepage, ranking, player profile, tournament, about, tournament submission and login, including their local preview versions. Shared public header, dock, buttons, fields and cards must use consistent spacing, typography and radii. Administrative, referee and courtside flows stay governed by their existing styles.

Home removes the decorative paddle/ball overlap and duplicate mobile shortcuts, tightens section spacing, and presents uncropped portrait posters beside concise tournament information. Ranking uses a flat tab bar and compact filters/rows. Player metrics become one strip and empty histories use compact messages. Forms retain native controls, validation and existing IDs. About and login adopt the same visual language.

No new business claims, data, fees, ratings or permissions. No changes to scoring, APIs or persistence. Preserve reduced motion, keyboard focus, hidden states, poster colors and theme selection. Keep touch controls at least 44px.

Verification: existing browser design suite in both themes and at 375/844/1440; navigation/PWA regressions; fresh real-data screenshots with no runtime errors or horizontal overflow; review diff; build and CI; production verification after deployment. Update both service-worker caches for the shared stylesheet.
