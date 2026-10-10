# Operator center: court setup and referee creation

The reported operator center had 16 teams, no active courts, and no pool matches.
The draw client returned before opening setup when there were no courts. Its
body-level toast was covered by the native operator dialog. Referee creation
also reported server validation failures through that covered toast, and the
center action led to a separate list rather than a scoped creation form.

Draw now opens court configuration for the current tournament when it has no
active courts. Saving courts refreshes state, restores the operator center and
continues to draw setup for the same tournament. Changing the tournament in
the court form does not draw the original division under a different scope.
The backend still requires valid courts and blocks redrawing started matches.

The dashboard's operator-center button also used a card click handler that
ignored every button click, including its own trigger. Direct trigger clicks
now open the center; unrelated nested card controls remain independent.

The referee action opens creation directly with the tournament selected.
Client validation and server/network failures appear inside the form. Inputs
remain available for retry; repeated saves are disabled while pending; Enter
submits creation. Closing a blank form bypasses required-field validation.
Successful creation opens the referee list. Server authorization is unchanged.

Shared notifications use a manual popover inside the active dialog's non-inert
subtree. Their pointer events are disabled so feedback cannot cover controls.
The fallback retains notifications inside an open dialog.

Validation:

- `scripts/registry-operator-center-ui.mjs`: real Worker and migrated SQLite,
  admin/organizer at 1440/375 pixels, dashboard entry, zero-court recovery, saved draw, 16 teams
  assigned to four groups, 24 scheduled matches, draw completion broadcast,
  notification stacking and nonblocking clicks, scoped account creation,
  blank/invalid/short input without writes, duplicate email, network retry,
  keyboard submission, blank-form close, login with the created account.
- This test failed against the previous client for zero-court recovery and
  visible duplicate-email validation. It runs in both CI and deployment gates.
- Existing account/referee browser checks, draw/preview regressions, 1,146
  Worker tests and the asset build/Worker dry run passed locally.

All fixture writes are isolated local test data. Deployment verification checks
production assets and unauthenticated access without changing real tournaments
or creating real accounts.
