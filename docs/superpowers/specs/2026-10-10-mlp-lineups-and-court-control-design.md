# MLP lineups and court control design

## Problem

The tournament control center renders a flat match list, so an operator cannot scan the four courts and see what is live, who is playing, the score, the referee, or the next match. MLP scoring labels a relay leg as AB, BC, or CA but only renders the full three-player team name. The roster join also has no persisted slot, so the application cannot reliably know which athlete is A, B, or C after a reload.

## Approved experience

The tournament control center will show one tournament-level court grid before the division sections. Desktop uses a two-column grid for four courts; mobile uses one column. Each court card shows the court and queue state, stage/division, scheduled time, referee, current teams or MLP pairs, live score, direct score-entry and assignment actions, and the next match. Unassigned matches appear in a separate compact section. The existing complete match schedule remains available in an expandable section per division. A full-screen court-board link remains available for TV use.

For an MLP relay, the primary identity on every scoring surface is the active pair, for example `AB · An + Bình`. The full team roster remains visible as secondary context. At the segment boundary, the pair changes with the score: AB before 9, BC from 9 through 17, and CA from 18 through 27 for a 9×3 relay. The admin score dialog, dedicated referee page, and tournament court cards use the same lineup helper.

## Roster positions

`team_players` gains an optional one-based `slot_no`. New and edited rosters persist the submitted player order. Team relay roster pickers label slots A, B, C, and D according to `relayTeamSize`; a three-person relay therefore presents exactly A/B/C. Other event types keep their current player counts.

Existing teams are handled without silently inventing roles. When all athlete names appear in the slash-separated team name, the read model can infer their order for display. Otherwise the UI shows that A/B/C has not been assigned and asks the organizer to edit the team. Saving the team persists the chosen slots. Roster order changes are treated as real changes even when membership is unchanged, while the existing lock still prevents changes after a team has started a match.

## Data and compatibility

Both D1 and PostgreSQL add `slot_no` and a partial unique index on `(team_id, slot_no)`. All team creation, edit, import, and add-member paths write deterministic slot numbers. State queries order members by the saved slot before name and expose whether the order is assigned or safely inferred. Existing API consumers continue receiving `teamPlayers` as arrays of player IDs.

## Accessibility and responsive behavior

Pair changes are announced through the existing live status regions. Full names wrap rather than truncate in scoring contexts. Court card actions remain at least 44px high. Color is supplemented by textual states such as `ĐANG ĐẤU`, `ON DECK`, and `TRỐNG`. The grid must not introduce horizontal overflow at 375px.

## Verification

Automated coverage will prove roster order survives a create/read/edit cycle, order-only edits are persisted, all four court cards render with their details, MLP AB/BC/CA pair names change at the correct score boundaries, unassigned matches are separated, and both admin and referee score surfaces remain usable at desktop and mobile widths. Existing Worker, UI, build, and deployment checks must remain green before production deployment.
