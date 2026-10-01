# System Player Registry Picker Design

## Goal

Make the Pickleup.vn player/rating list the single source of truth for athletes. Tournament organizers must select existing athlete profiles when creating a singles entry, pair, or team. Tournament workflows must never create an athlete profile implicitly.

## Product language and navigation

- Rename the player management heading from `VĐV & cặp đấu` to `Bảng VĐV / Rating hệ thống` so its purpose is clear.
- Rename the global `Thêm VĐV` action and dialog to `Tạo hồ sơ VĐV`. This remains the place where authorized users create an athlete and assign the initial rating.
- Keep editing, avatar upload, CSV player import, club assignment, and rating history in this global registry.
- In tournament team creation, show the message `VĐV chưa có trong hệ thống. Hãy tạo hồ sơ tại Bảng VĐV / Rating trước.` when a search has no results. Do not offer inline profile creation.

## Tournament player picker

Replace the two long native player selects in `Thêm cặp / đội` with searchable picker slots that follow the existing modal styles.

Each picker:

- searches active system athletes by full name, nickname, club name, or phone number;
- shows avatar or initials, full name, nickname, club, and current rating;
- stores the immutable player ID after selection;
- excludes athletes already selected in another slot;
- excludes athletes already attached to a different team in the selected division;
- clears an invalid selection when the selected division changes.

The selected division controls the required number of athletes:

- `singles`: exactly one athlete;
- `doubles` and `mixed_doubles`: exactly two distinct athletes;
- `team`: one to four distinct athletes, using repeatable picker rows within the same dialog.

The team name is generated from the selected athlete names while the field is still untouched. The club field is filled when every selected athlete belongs to the same club, but remains editable for the team record.

## Data model and API

The existing `players` table remains the system registry and `team_players` remains the membership relation. No database migration is required.

Extend `POST /api/divisions/:id/teams` to accept `playerIds` with the existing team fields. Before writing, the Worker must:

1. load the division and determine its event type;
2. validate the required athlete count for that event type;
3. reject duplicate IDs;
4. verify every athlete exists and is active;
5. reject an athlete already linked to any other team in the same division;
6. validate all fields before inserting anything.

After validation, insert the team and every `team_players` row in one D1 batch. A failed validation or write must not leave an empty or partially linked team.

Keep `POST /api/teams/:id/players` for compatibility, but apply the same active-player and same-division duplicate checks so older callers cannot bypass the rule.

Use these stable API errors:

- `PLAYER_SELECTION_REQUIRED`
- `INVALID_PLAYER_COUNT`
- `DUPLICATE_PLAYER_SELECTION`
- `PLAYER_NOT_FOUND`
- `PLAYER_INACTIVE`
- `PLAYER_ALREADY_IN_DIVISION`

The admin UI maps them to concise Vietnamese messages and leaves the dialog open so the organizer can correct the selection.

## CSV imports

Tournament team import must follow the same source-of-truth rule. It must not create missing players.

Before creating any teams, validate all `player1` through `player4` cells against active system athletes using an exact, case-insensitive full-name match. A missing or ambiguous name rejects the import and returns row-level issues. This avoids a partially imported tournament and tells the organizer which profiles must be created or corrected in the global registry first.

The separate player CSV import remains available because it explicitly populates the system registry.

## Permissions

- Super Admin and tournament organizers can create tournament teams from the registry within their existing tournament scope.
- Global player creation permissions remain unchanged: Super Admin, organizer, and club manager according to their current server scopes.
- Referees may view assigned athletes but cannot create teams or athlete profiles.

## Compatibility

Existing teams and links remain unchanged. New team creation requires `playerIds` and the correct athlete count. Update demo-data helpers, preview adapters, smoke tests, and other internal callers to send player IDs in the same request. The legacy player-link endpoint remains available for editing an existing team, with the same validation rules.

## Verification

Add integration coverage proving that:

- singles requires one athlete and doubles requires two;
- only active registry athletes can be selected;
- a player cannot be selected twice or joined to two teams in one division;
- the same player may participate in a different division;
- a failed request leaves no team behind;
- team CSV import rejects missing athletes without creating profiles or teams;
- the searchable picker displays rating/club information and the no-result instruction;
- the global registry uses the new labels while still creating a player profile;
- Wrangler dry-run, the existing permission smoke test, and production deployment continue to pass.

