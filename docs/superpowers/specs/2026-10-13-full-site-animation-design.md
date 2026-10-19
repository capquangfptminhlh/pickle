# Full-site animation design

Date: 2026-10-13
Status: approved for planning

## Goal

Give every Pickleup surface a lively, sports-broadcast motion language while preserving the speed and certainty required during tournament operations. Motion must explain state changes, reinforce successful actions, and celebrate results without changing data, delaying controls, or hiding essential information.

## Scope

The motion system covers the public home, tournament detail, ranking, player, about, registration, login, live match, court board, check-in, referee, and admin experiences. It also covers shared navigation, cards, tables, forms, dialogs, toasts, live indicators, brackets, score changes, service changes, set wins, and match wins. Preview pages receive the same assets and behavior so browser regression tests represent production.

The work does not change tournament rules, score calculations, authorization, persistence, API contracts, or Socket.IO event payloads. It does not add sound or autoplay media.

## Chosen approach

Use GSAP as the dedicated animation runtime. Pin it in the application dependency tree and ship a local browser asset rather than loading it from a third-party CDN. The service workers cache the local runtime and the motion modules used by each surface.

The existing `assets/ui-motion.js` becomes the entry point for a shared motion system. It initializes only after the document is usable, detects supported capabilities, and exposes a small `window.PickleMotion` interface. Feature scripts call semantic operations such as `scoreChange`, `serviceChange`, `rankMove`, `bracketAdvance`, `setWin`, and `matchWin`; they do not construct unrelated timelines themselves.

Surface-specific behavior remains close to the surface that owns the state:

- shared navigation, cards, buttons, forms, dialogs, toasts, and route exits live in the common motion module;
- referee score and service timelines are triggered from confirmed referee render transitions;
- public match, ranking, and tournament timelines are triggered after their renderers commit new data;
- bracket animation is triggered after bracket reconciliation identifies an actual advancement or reset;
- celebration rendering is owned by one reusable overlay and one canvas, created on demand and removed after completion.

If GSAP is unavailable, all content and controls remain visible and usable. The common interface becomes a no-op implementation so feature scripts do not need separate error paths.

## Motion language

The selected style is highly animated and sports-focused. Motion uses sharp anticipation, spring-like settling, team-color light trails, controlled depth, and short staggered sequences. The standard durations are:

- direct control feedback: 120-220 ms;
- content entrances and state changes: 240-650 ms;
- bracket paths and larger sequences: 600-1,200 ms;
- set celebration: no more than 1.2 seconds;
- match celebration and confetti: no more than 2.5 seconds.

Transforms and opacity are the default animated properties. Layout-changing properties are avoided during repeated interactions. Glow, blur, and canvas particle counts are capped on small screens.

## Experience by surface

### Public pages

Hero content enters in a paced sequence. Background accents drift continuously at low amplitude. Tournament, news, ranking, and player cards reveal in staggered groups and use a restrained pointer tilt on devices with a fine pointer. Primary buttons receive a press compression, ripple, and short glow. The scroll progress indicator and active navigation state animate between positions.

Internal navigation receives an exit timeline only when navigation has not already been handled by the browser View Transition API. Controls remain active until navigation begins, and the exit has a strict upper bound so it cannot strand the user.

### Lists, tables, forms, and admin

New list rows enter from their logical origin. Removed rows contract before their space is reclaimed when the owning renderer can safely provide that lifecycle. Reordered ranking or schedule rows animate from their previous measured positions to the new positions. Numeric metrics count to confirmed values.

Dialogs scale and fade from the invoking control. Validation errors use one short horizontal shake and focus the first invalid field. Successful saves animate a check mark and toast. Loading states use lightweight loops that stop when their operation completes or aborts.

### Live match, court board, and check-in

Live indicators pulse with a controlled broadcast rhythm. Confirmed score changes animate the affected side only. Court and schedule changes move cards between their previous and current visual positions. Check-in confirmation uses a short identity highlight and success sweep without delaying the next scan or tap.

### Ranking

Confirmed rating and point values count between old and new values. A competitor whose position changes animates from the previous row position to the new one. A new leader receives one short light sweep; the effect does not loop.

### Bracket

Initial bracket display draws connector paths in round order. A confirmed winner produces a light trail from the completed match to the destination slot, followed by a winner-card emphasis. A knockout-only reset reverses the affected downstream paths and contracts cleared slots; it does not animate or alter preserved group results.

### Referee

Confirmed point increases and corrections use opposite directional motion and visible signed feedback. Selecting a serving athlete creates a touch wave on that athlete, moves a team-colored light trail to the service banner, and settles the new server highlight. Switching sides blends the arena accent from one team color to the other.

Set completion produces a short light burst around the set history. Match completion enlarges the winner name, emits team-color rays, and runs the shared confetti overlay. Undo and reset use clearly reversed motion so operators can distinguish them from new scoring.

## State and data integrity

Animation begins only after an action has succeeded locally or a confirmed server update has been rendered. Optimistic version locking and the existing API calls remain the source of truth. Failed actions may animate an error toast or invalid control, but they must never play a score, advancement, or victory animation.

Each animated entity stores the last rendered semantic state. Repeated Socket.IO delivery of the same version produces no celebration. A newer version cancels or completes the older timeline before the next one begins. Each surface keeps at most one active structural timeline per entity and one shared celebration timeline.

Opening a page on an already completed match shows the completed state without replaying confetti. A victory celebration runs only for a transition from no winner to a confirmed winner during the active session.

## Accessibility and device adaptation

`prefers-reduced-motion: reduce` replaces movement, parallax, particles, shaking, and counting with immediate state changes plus short opacity fades where useful. Focus, live-region announcements, labels, and control semantics remain independent of animation.

Pointer tilt is enabled only for fine pointers. Repeated ambient effects pause while the document is hidden. Small screens, low device memory when reported, and sustained long-frame detection use a reduced particle and glow budget. Animation never changes focus order, traps focus, or blocks keyboard input.

## Failure handling

The application renders final styles before trying to initialize motion. A missing or failed GSAP asset records a non-fatal console warning in development and installs no-op motion methods. An interrupted timeline applies its final or next confirmed state before cleanup. Celebration DOM and canvas nodes are removed on completion, navigation, and page visibility teardown.

No animation promise is awaited by score entry, service selection, form submission, navigation state, or realtime reconciliation. Motion failures therefore cannot fail business actions.

## Performance constraints

The shared runtime is loaded locally and cached. Pages load only the common system plus the surface behavior they already require. Motion uses transform and opacity wherever possible, batches DOM reads before writes, and avoids per-frame layout queries. Confetti uses one canvas and a capped particle pool.

The target is immediate control feedback on tournament-day phones, stable layout with no animation-induced overflow, and no sustained main-thread animation after a sequence completes. The motion system must not regress page content visibility when JavaScript is disabled or slow.

## Verification

Automated browser coverage verifies:

- final visible state with normal motion and reduced motion;
- controls remain clickable during and immediately after timelines;
- no duplicate score, set, match, ranking, or bracket celebration for the same confirmed version;
- service selection animates only after the server confirms the selected athlete;
- finished matches do not permit service changes;
- victory celebration runs on a live winner transition and does not replay on initial load;
- bracket advancement and knockout reset reach the correct final DOM state;
- mobile, tablet, and desktop layouts have no overflow caused by transforms or overlays;
- missing GSAP falls back to a fully usable static interface;
- celebration overlays and active timelines are cleaned up.

Existing integration and browser regression suites continue to validate scoring, Undo, reset, realtime updates, roles, and public visibility. Visual snapshots are captured for the referee, public home, ranking, tournament bracket, and admin views at representative mobile and desktop sizes.

## Release strategy

The change ships in three reviewable layers within one implementation plan: the local GSAP runtime and common motion interface; surface integrations; then celebrations, performance adaptation, and complete regression coverage. Cache versions are updated only after all assets and page references are finalized. Production deployment follows the existing CI and Cloudflare Worker checks.
