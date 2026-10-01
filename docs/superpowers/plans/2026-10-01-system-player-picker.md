# System Player Registry Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Pickleup.vn player/rating registry the only source of athletes used in tournament teams, with searchable selection, duplicate protection, and no implicit player creation.

**Architecture:** Add a shared pure player-count contract, enforce registry membership and same-division uniqueness in every backend adapter, and create teams plus player links atomically. Replace the team modal's native selects with a focused browser picker module that consumes existing player records and submits `playerIds` in the create-team request.

The shared rule is singles: exactly one, doubles/mixed doubles: exactly two, and team: one to four athletes. Cloudflare persists the team and its links in one D1 batch.

**Tech Stack:** Vanilla JavaScript, Cloudflare Workers, D1 SQLite, Express/PostgreSQL, browser-local Preview API, Playwright, Node test runner, GitHub Actions.

---

### Task 1: Define the event-type player selection contract

**Files:**
- Create: `shared/team-player-selection.js`
- Create: `cloudflare/tests/team-player-selection.test.mjs`

- [ ] **Step 1: Write the failing contract test**

Create `cloudflare/tests/team-player-selection.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {normalizePlayerIds,validatePlayerIds,playerCountRange} from "../../shared/team-player-selection.js";

test("normalizes distinct non-empty player ids",()=>{
  assert.deepEqual(normalizePlayerIds([" p1 ","p2","p1",""]),["p1","p2"]);
});

test("defines player count by event type",()=>{
  assert.deepEqual(playerCountRange("singles"),{min:1,max:1});
  assert.deepEqual(playerCountRange("doubles"),{min:2,max:2});
  assert.deepEqual(playerCountRange("mixed_doubles"),{min:2,max:2});
  assert.deepEqual(playerCountRange("team"),{min:1,max:4});
});

test("rejects missing, duplicate, and invalid counts",()=>{
  assert.throws(()=>validatePlayerIds("singles",[]),{message:"PLAYER_SELECTION_REQUIRED"});
  assert.throws(()=>validatePlayerIds("doubles",["p1","p1"]),{message:"DUPLICATE_PLAYER_SELECTION"});
  assert.throws(()=>validatePlayerIds("doubles",["p1"]),{message:"INVALID_PLAYER_COUNT"});
  assert.deepEqual(validatePlayerIds("doubles",["p1","p2"]),["p1","p2"]);
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run:

```powershell
Set-Location cloudflare
npm test
```

Expected: the new test fails because `shared/team-player-selection.js` does not exist.

- [ ] **Step 3: Implement the shared contract**

Create `shared/team-player-selection.js`:

```js
export function playerCountRange(eventType){
  if(eventType==="singles")return {min:1,max:1};
  if(eventType==="doubles"||eventType==="mixed_doubles")return {min:2,max:2};
  return {min:1,max:4};
}

export function normalizePlayerIds(input){
  const ids=(Array.isArray(input)?input:[]).map(x=>String(x||"").trim()).filter(Boolean);
  return [...new Set(ids)];
}

export function validatePlayerIds(eventType,input){
  const original=(Array.isArray(input)?input:[]).map(x=>String(x||"").trim()).filter(Boolean);
  if(!original.length)throw new Error("PLAYER_SELECTION_REQUIRED");
  const ids=normalizePlayerIds(original);
  if(ids.length!==original.length)throw new Error("DUPLICATE_PLAYER_SELECTION");
  const {min,max}=playerCountRange(eventType);
  if(ids.length<min||ids.length>max)throw new Error("INVALID_PLAYER_COUNT");
  return ids;
}
```

- [ ] **Step 4: Run the contract tests**

Run `npm test` from `cloudflare`.

Expected: all Node tests pass, including the three new contract tests.

- [ ] **Step 5: Commit the contract**

```powershell
git add shared/team-player-selection.js cloudflare/tests/team-player-selection.test.mjs
git commit -m "Define tournament player selection rules"
```

### Task 2: Create Cloudflare teams atomically from registry athletes

**Files:**
- Modify: `cloudflare/src/index.js:331-353`
- Modify: `cloudflare/scripts/permissions.mjs`
- Modify: `cloudflare/scripts/smoke.mjs`

- [ ] **Step 1: Add failing integration assertions**

In `cloudflare/scripts/permissions.mjs`, after creating two active players and a doubles division, create a team with both player IDs and assert the links appear in admin state. Add negative cases for duplicate IDs, one-player doubles, inactive players, and reusing a player in another team in the same division:

```js
const beforeAtomic=(await raw("/api/admin/state",{token:admin})).data;
const atomicTeam=(await raw("/api/divisions/"+division.id+"/teams",{
  method:"POST",token:admin,
  body:{name:"Registry Pair "+stamp,group:"A",playerIds:[pA.id,pB.id]}
})).data;
let atomicState=(await raw("/api/admin/state",{token:admin})).data;
assert((atomicState.teamPlayers[atomicTeam.id]||[]).length===2,"team and player links created together");

await raw("/api/divisions/"+division.id+"/teams",{
  method:"POST",token:admin,body:{name:"Duplicate",playerIds:[pA.id,pA.id]},ok:[400]
});
await raw("/api/divisions/"+division.id+"/teams",{
  method:"POST",token:admin,body:{name:"Wrong count",playerIds:[pA.id]},ok:[400]
});
await raw("/api/divisions/"+division.id+"/teams",{
  method:"POST",token:admin,body:{name:"Already assigned",playerIds:[pA.id,pB.id]},ok:[409]
});
atomicState=(await raw("/api/admin/state",{token:admin})).data;
assert(atomicState.teams.length===beforeAtomic.teams.length+1,"failed team requests leave no rows");
```

Create a third player, deactivate it, and assert a new team request containing that ID returns `400 PLAYER_INACTIVE`. Create a second division and prove `pA` can be linked there.

- [ ] **Step 2: Run the integration test and confirm failure**

Start the local Worker with the CI `.dev.vars`, then run:

```powershell
node cloudflare/scripts/permissions.mjs
```

Expected: failure because the current create-team route ignores `playerIds` and creates an unlinked team.

- [ ] **Step 3: Implement Worker validation and atomic writes**

Import the shared contract in `cloudflare/src/index.js`:

```js
import {playerCountRange,validatePlayerIds} from "../../shared/team-player-selection.js";
```

Replace `POST /api/divisions/:id/teams` with logic that loads the division, converts contract errors to HTTP 400, validates players, checks same-division membership, and writes all rows in one batch:

```js
const division=await one(env,"SELECT * FROM divisions WHERE id=?",p.id);
if(!division)throw httpError("NOT_FOUND",404);
let playerIds;
try{playerIds=validatePlayerIds(division.event_type,b.playerIds)}
catch(error){throw httpError(error.message,400)}

const marks=playerIds.map(()=>"?").join(",");
const selected=await rows(env,`SELECT id,active FROM players WHERE id IN (${marks})`,...playerIds);
if(selected.length!==playerIds.length)throw httpError("PLAYER_NOT_FOUND",404);
if(selected.some(x=>!x.active))throw httpError("PLAYER_INACTIVE",400);
const assigned=await rows(env,`SELECT tp.player_id FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE t.division_id=? AND tp.player_id IN (${marks})`,p.id,...playerIds);
if(assigned.length)throw httpError("PLAYER_ALREADY_IN_DIVISION",409);

const id=uid(),changedAt=nowIso();
const statements=[env.DB.prepare(
  "INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,?,?)"
).bind(id,p.id,name,b.clubId||null,b.seed??null,String(b.group||"A"),"active",changedAt)];
for(const playerId of playerIds){
  statements.push(env.DB.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").bind(id,playerId));
}
await env.DB.batch(statements);
```

Return the created team with `playerIds`. Update `POST /api/teams/:id/players` to reject unknown/inactive players, enforce the event maximum from `playerCountRange`, and reject membership in a different team in the same division.

- [ ] **Step 4: Update existing Worker smoke callers**

In `cloudflare/scripts/smoke.mjs` and earlier sections of `cloudflare/scripts/permissions.mjs`, create registry athletes before their teams and pass the required `playerIds` directly to `POST /api/divisions/:id/teams`. Remove the matching follow-up `POST /api/teams/:id/players` calls.

- [ ] **Step 5: Run Worker integration and unit tests**

Run:

```powershell
node cloudflare/scripts/smoke.mjs
node cloudflare/scripts/permissions.mjs
Set-Location cloudflare
npm test
npm run check
```

Expected: `CLOUDFLARE_SMOKE_OK`, `CLOUDFLARE_PERMISSIONS_OK`, all unit tests pass, and Wrangler dry-run succeeds.

- [ ] **Step 6: Commit the Worker implementation**

```powershell
git add cloudflare/src/index.js cloudflare/scripts/smoke.mjs cloudflare/scripts/permissions.mjs
git commit -m "Create tournament teams from registry players"
```

### Task 3: Stop team imports from creating player profiles

**Files:**
- Modify: `cloudflare/src/operations.js:124-151`
- Modify: `cloudflare/scripts/permissions.mjs`
- Modify: `server/index.js:832-875`
- Modify: `preview/preview-api.js:319`

- [ ] **Step 1: Add failing import assertions**

Add a team-import test using a unique missing name and record team/player counts before the call:

```js
const importBefore=(await raw("/api/admin/state",{token:admin})).data;
const missingName="Missing Registry Player "+stamp;
const invalidImport=(await raw("/api/divisions/"+division.id+"/import-teams",{
  method:"POST",token:admin,
  body:{rows:[{name:"Invalid Imported Pair",player1:pA.full_name,player2:missingName}]},
  ok:[400]
})).data;
assert(invalidImport.error==="IMPORT_PLAYER_ISSUES","missing import player is reported");
assert(invalidImport.detail?.issues?.[0]?.row===1,"import issue includes row number");
const importAfter=(await raw("/api/admin/state",{token:admin})).data;
assert(importAfter.players.length===importBefore.players.length,"team import creates no player profiles");
assert(importAfter.teams.length===importBefore.teams.length,"invalid import creates no teams");
```

- [ ] **Step 2: Run the test and confirm the implicit profile is created**

Run `node cloudflare/scripts/permissions.mjs` against the local Worker.

Expected: failure because the current import creates the missing athlete with rating 3.

- [ ] **Step 3: Pre-validate every Worker import row**

In `cloudflare/src/operations.js`, build a `plans` array before any insert. Resolve every non-empty `player1` through `player4` value using:

```js
const matches=await rows(env,"SELECT id,full_name FROM players WHERE lower(full_name)=lower(?) AND active=1 ORDER BY created_at",playerName);
if(matches.length!==1){
  issues.push({row:index+1,field:`player${slot+1}`,name:playerName,reason:matches.length?"AMBIGUOUS_PLAYER":"PLAYER_NOT_FOUND"});
}else{
  playerIds.push(matches[0].id);
}
```

Validate the player count with `validatePlayerIds(division.event_type,playerIds)` and check same-division assignments across all planned rows. If any issue exists, return `fail("IMPORT_PLAYER_ISSUES",request,env,400,{issues})` using the repository's supported error payload pattern. Only after validation succeeds may the route insert teams and links. Remove the branch that inserts into `players`.

- [ ] **Step 4: Apply the same rules to PostgreSQL and Preview**

In `server/index.js`, perform all name resolution and count/duplicate checks inside the existing transaction before the first insert; throw `IMPORT_PLAYER_ISSUES` with `issues` so PostgreSQL rolls back the whole import. Remove the fallback `insert into players`.

In `preview/preview-api.js`, resolve exactly one active player for each supplied name, validate the event count, and throw an error with `message="IMPORT_PLAYER_ISSUES"` and an `issues` property before mutating local state. Remove local player creation from `importTeams`.

- [ ] **Step 5: Run integration tests**

Run Worker permissions, root end-to-end tests, and Preview UI smoke. Expected: invalid imports report issues and leave registry/team counts unchanged.

- [ ] **Step 6: Commit strict team imports**

```powershell
git add cloudflare/src/operations.js cloudflare/scripts/permissions.mjs server/index.js preview/preview-api.js
git commit -m "Require registry players for team imports"
```

### Task 4: Keep Node and Preview team creation consistent

**Files:**
- Modify: `server/index.js:788-792,923-941`
- Modify: `preview/preview-api.js`
- Modify: `scripts/e2e.mjs`
- Modify: `scripts/ui-smoke.mjs`

- [ ] **Step 1: Update the end-to-end contract first**

Change tournament setup in `scripts/e2e.mjs` so each team request includes registry `playerIds`. Add assertions that duplicate, inactive, and already-assigned IDs return the same errors as Cloudflare.

- [ ] **Step 2: Run the Node end-to-end test and confirm failure**

With PostgreSQL migrated/seeded and the Node server running, run `node scripts/e2e.mjs`.

Expected: the new player-link assertions fail because the current Node create-team route ignores `playerIds`.

- [ ] **Step 3: Implement the PostgreSQL transaction**

Import `validatePlayerIds` and `playerCountRange` from `shared/team-player-selection.js`. In the existing `tx` callback for `POST /api/divisions/:id/teams`:

```js
const division=(await c.query("select * from divisions where id=$1",[req.params.id])).rows[0];
if(!division)throw Object.assign(new Error("NOT_FOUND"),{status:404});
let playerIds;
try{playerIds=validatePlayerIds(division.event_type,req.body.playerIds)}
catch(error){throw Object.assign(error,{status:400})}
const players=(await c.query("select id,active from players where id=any($1::uuid[])",[playerIds])).rows;
if(players.length!==playerIds.length)throw Object.assign(new Error("PLAYER_NOT_FOUND"),{status:404});
if(players.some(x=>!x.active))throw Object.assign(new Error("PLAYER_INACTIVE"),{status:400});
const assigned=(await c.query("select tp.player_id from team_players tp join teams t on t.id=tp.team_id where t.division_id=$1 and tp.player_id=any($2::uuid[])",[division.id,playerIds])).rows;
if(assigned.length)throw Object.assign(new Error("PLAYER_ALREADY_IN_DIVISION"),{status:409});
```

Insert the team and all links before the transaction returns. Update the legacy add-player endpoint with the same active, maximum-count, and same-division checks.

- [ ] **Step 4: Implement Preview parity**

Change `preview/preview-api.js` `createTeam` to validate the selected division and players before pushing any state:

```js
const division=state.divisions.find(d=>d.id===did);
const playerIds=validatePreviewPlayerIds(division?.eventType,p.playerIds);
const selected=playerIds.map(id=>state.players.find(x=>x.id===id));
if(selected.some(x=>!x))throw new Error("PLAYER_NOT_FOUND");
if(selected.some(x=>!x.active))throw new Error("PLAYER_INACTIVE");
const used=new Set(state.teams.filter(t=>t.divisionId===did).flatMap(t=>state.teamPlayers[t.id]||[]));
if(playerIds.some(id=>used.has(id)))throw new Error("PLAYER_ALREADY_IN_DIVISION");
```

Only after validation, push the team and assign `state.teamPlayers[id]=playerIds` before persisting.

- [ ] **Step 5: Update Preview test fixtures**

In `scripts/ui-smoke.mjs`, create enough temporary registry athletes for every team and pass IDs with each `createTeam` call. For the 16-pair draw, create 32 temporary athletes and submit two per pair. Do not restore any empty-team caller.

- [ ] **Step 6: Run Node and Preview tests**

Run `node scripts/e2e.mjs` against Node and `node scripts/ui-smoke.mjs` with the existing Preview server setup.

Expected: both report their current success markers with no player-selection failures.

- [ ] **Step 7: Commit runtime parity**

```powershell
git add server/index.js preview/preview-api.js scripts/e2e.mjs scripts/ui-smoke.mjs
git commit -m "Enforce registry teams across app runtimes"
```

### Task 5: Build the searchable athlete picker

**Files:**
- Create: `assets/player-picker.js`
- Modify: `assets/admin-app.js:337-347,916-952`
- Modify: `assets/styles.css`
- Modify: `admin.html:128-134`
- Modify: `preview/admin.html:121-127`
- Modify: `scripts/ui-smoke.mjs`

- [ ] **Step 1: Add failing browser assertions**

In the populated Preview section of `scripts/ui-smoke.mjs`, open the players page and assert the global labels, then open the team dialog:

```js
await ppage.locator('[data-page="players"]').click();
if(!(await ppage.locator("#content").innerText()).includes("Bảng VĐV / Rating hệ thống")){
  failures.push({label:"player registry label",errors:["system registry heading missing"]});
}
if(!(await ppage.locator('[data-action="newPlayer"]').innerText()).includes("Tạo hồ sơ VĐV")){
  failures.push({label:"player registry action",errors:["profile action label missing"]});
}
await ppage.locator('[data-action="newTeam"]').click();
if(!(await ppage.locator("[data-player-picker]").count())){
  failures.push({label:"team player picker",errors:["searchable picker missing"]});
}
await ppage.locator('[data-player-search]').first().fill("UI Player");
if(!(await ppage.locator('[data-player-result]').count())){
  failures.push({label:"team player picker",errors:["registry search returned no athlete"]});
}
```

Search for a missing name and assert the exact instruction `VĐV chưa có trong hệ thống. Hãy tạo hồ sơ tại Bảng VĐV / Rating trước.` is visible.

- [ ] **Step 2: Run UI smoke and confirm the picker assertion fails**

Run `node scripts/ui-smoke.mjs` using the standard Node and Preview test servers.

Expected: failure because the current dialog contains native `<select>` elements and old labels.

- [ ] **Step 3: Implement the focused picker module**

Create `assets/player-picker.js` as an IIFE exposing `window.PicklePlayerPicker.mount`. The mount function accepts `{root,players,count,excludedIds,onChange}` and returns `{values,setCount,setExcluded,destroy}`.

Render one slot per required athlete with this stable markup:

```html
<div class="player-picker-slot" data-player-picker-slot="0">
  <label class="field full">VĐV 1
    <input type="search" data-player-search="0" autocomplete="off" placeholder="Tìm tên, biệt danh, CLB hoặc điện thoại">
  </label>
  <div class="player-picker-results" data-player-results="0"></div>
  <div class="player-picker-selected" data-player-selected="0" hidden></div>
</div>
```

Normalize search text with `toLocaleLowerCase("vi")` and combine `full_name`, `nickname`, `club_name`, and `phone`. Result buttons use `data-player-result` and `data-player-id`, display rating through the supplied formatter, and never include an excluded or already selected ID. An empty result area renders the approved no-result instruction. Selecting a result stores only its ID and calls `onChange(values())`.

- [ ] **Step 4: Wire the picker into the team dialog**

In `openTeamModal`:

1. load active players once;
2. render a `#teamPlayerPicker` host instead of `teamPlayer1` and `teamPlayer2` selects;
3. derive picker count from the selected division event type;
4. exclude IDs already present in `state.teamPlayers` for teams in that division;
5. reset/reconfigure the picker when the division changes;
6. generate the team name and common club from selected records;
7. call only `API.createTeam(divisionId,{name,club,group,seed,playerIds})`;
8. remove the follow-up `API.addTeamPlayer` loop;
9. map the six stable API errors to Vietnamese messages while keeping the dialog open.

- [ ] **Step 5: Update registry labels, styles, and script tags**

Change the page heading to `Bảng VĐV / Rating hệ thống`, the button/dialog to `Tạo hồ sơ VĐV`, and the success toast to `Đã tạo hồ sơ VĐV trong bảng Rating.`

Add styles for `.player-picker-slot`, `.player-picker-results`, `.player-picker-result`, and `.player-picker-selected` using the existing form colors, 12px radii, compact mobile spacing, and a results max-height with scrolling.

Load `assets/player-picker.js?v=1` before `admin-app.js` in both admin HTML files and bump `admin-app.js` to `v=39`.

- [ ] **Step 6: Run syntax and browser tests**

Run:

```powershell
node --check assets/player-picker.js
node --check assets/admin-app.js
node scripts/ui-smoke.mjs
Set-Location cloudflare
npm run check
```

Expected: syntax checks pass, UI smoke finds registry labels/search results/no-result guidance, and Wrangler includes the new static asset.

- [ ] **Step 7: Commit the picker UI**

```powershell
git add assets/player-picker.js assets/admin-app.js assets/styles.css admin.html preview/admin.html scripts/ui-smoke.mjs
git commit -m "Select tournament athletes from system registry"
```

### Task 6: Validate, publish, and verify production

**Files:**
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/cloudflare.yml`

- [ ] **Step 1: Add new files to CI syntax coverage**

Add these commands to the existing syntax-check steps:

```yaml
node --check assets/player-picker.js
node --check shared/team-player-selection.js
```

Keep the existing Cloudflare integration scripts; they now contain the registry-team assertions and therefore gate deployment.

- [ ] **Step 2: Run the complete local verification suite**

Run the root Node integration/UI workflow locally with PostgreSQL, then run:

```powershell
Set-Location cloudflare
npm test
npm run check
npx wrangler d1 migrations apply DB --local
```

Start the local Worker with CI `.dev.vars`, then run:

```powershell
node cloudflare/scripts/smoke.mjs
node cloudflare/scripts/permissions.mjs
```

Expected: all commands exit zero; the Worker scripts print `CLOUDFLARE_SMOKE_OK` and `CLOUDFLARE_PERMISSIONS_OK`.

- [ ] **Step 3: Review the final diff against the specification**

Verify:

```powershell
git diff --check origin/main...HEAD
git status --short
```

Confirm the diff contains no implicit player creation in either team-import path and no team UI caller that submits without `playerIds`.

- [ ] **Step 4: Merge to main and push**

Fast-forward the verified feature branch into `main`, then run:

```powershell
git push origin main
```

Expected: GitHub starts both `CI` and `Cloudflare Worker` workflows for the new main commit.

- [ ] **Step 5: Watch both GitHub workflows**

Use `gh run watch --exit-status` for the matching `CI` and `Cloudflare Worker` runs.

Expected: Node integration, browser smoke, Worker validation, D1 migration check, and deploy jobs all complete successfully.

- [ ] **Step 6: Verify production**

Fetch `https://pickleup.vn/api/health` and the versioned admin assets. Log into the production admin UI, open `Bảng VĐV / Rating hệ thống`, then open `Thêm cặp / đội` and verify:

- the searchable picker shows active registry athletes with rating and club;
- an unknown search shows the approved instruction;
- singles shows one slot and doubles shows two;
- a selected athlete cannot be selected again;
- team submission creates the team with all selected athlete links.
