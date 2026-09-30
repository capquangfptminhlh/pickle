# Edit Individual Player Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a permanent per-player edit action that updates every authorized profile field, moves players between clubs, and records rating corrections with a reason.

**Architecture:** Keep the existing admin table and modal. Render the edit action in `admin-app.js`, submit one `PATCH /api/players/:id` request, and make the Worker validate role-specific fields before using a D1 batch for the player update and optional rating-history insert. Preserve the existing standalone rating-adjust endpoint and deploy through the existing Cloudflare workflow.

**Tech Stack:** Vanilla JavaScript, Cloudflare Workers, D1 SQLite, Node test scripts, Wrangler, GitHub Actions.

---

### Task 1: Specify player-edit permissions in the integration smoke test

**Files:**
- Modify: `cloudflare/scripts/permissions.mjs:18-95`

- [ ] **Step 1: Add failing admin update assertions**

After the two players are created, add an admin correction that moves `pA` to `clubB`, updates its contact fields, and changes the rating with a reason:

```js
const adminEdited=(await raw("/api/players/"+pA.id,{
  method:"PATCH",token:admin,
  body:{
    fullName:"Perm Player A Edited "+stamp,
    nickname:"Ace",
    gender:"female",
    clubId:clubB.id,
    phone:"0900000000",
    active:true,
    rating:3.7,
    ratingReason:"Hiệu chỉnh hồ sơ kiểm thử"
  }
})).data;
assert(adminEdited.full_name.includes("Edited"),"admin edits player name");
assert(adminEdited.club_id===clubB.id,"admin moves player to another club");
assert(Number(adminEdited.rating)===3.7,"admin edits rating");
assert(adminEdited.ratingHistoryRecorded===true,"rating edit records history");
```

- [ ] **Step 2: Add failing validation assertions**

Add requests proving that a rating change without a reason and an unknown club are rejected:

```js
await raw("/api/players/"+pA.id,{method:"PATCH",token:admin,body:{rating:3.8},ok:[400]});
await raw("/api/players/"+pA.id,{method:"PATCH",token:admin,body:{clubId:"missing-club"},ok:[400]});
```

- [ ] **Step 3: Add failing club-manager boundary assertions**

After the manager login, update the manager-created player while trying to escape its club and rating scope:

```js
const managerEdited=(await raw("/api/players/"+managerMade.id,{
  method:"PATCH",token:manager.token,
  body:{nickname:"Manager edit",clubId:clubB.id,rating:4.9,phone:"0911111111",active:false}
})).data;
assert(managerEdited.nickname==="Manager edit","club manager edits basic player data");
assert(managerEdited.club_id===clubA.id,"club manager cannot move player");
assert(Number(managerEdited.rating)===3,"club manager cannot edit rating");
assert(managerEdited.phone==="0911111111"&&managerEdited.active===0,"club manager edits allowed operational fields");
```

- [ ] **Step 4: Run the smoke test and verify the new assertions fail**

Run the local Worker with the existing CI `.dev.vars`, then run:

```powershell
node cloudflare/scripts/permissions.mjs
```

Expected: failure at the club move, missing rating history, or missing rating-reason validation because the current `PATCH` handler ignores `clubId` and writes rating without history.

- [ ] **Step 5: Commit the failing contract**

```powershell
git add cloudflare/scripts/permissions.mjs
git commit -m "Test complete player profile editing"
```

### Task 2: Make the Worker update authorized player fields atomically

**Files:**
- Modify: `cloudflare/src/index.js:205-221`
- Test: `cloudflare/scripts/permissions.mjs`

- [ ] **Step 1: Validate the editable payload and role boundaries**

Replace the current field derivation in `PATCH /api/players/:id` with role-aware values:

```js
const referee=user.role==="referee";
const clubManager=user.role==="club_manager";
const canCorrectRating=["super_admin","organizer"].includes(user.role);
const fullName=String(b.fullName??before.full_name).trim();
if(!fullName)return fail("NAME_REQUIRED",request,env,400);
const nickname=String(b.nickname??before.nickname??"").trim();
const gender=b.gender==null?String(before.gender||"other"):String(b.gender);
if(!["male","female","other"].includes(gender))return fail("INVALID_GENDER",request,env,400);
const requestedClub=b.clubId===undefined?before.club_id:(b.clubId||null);
const clubId=(referee||clubManager)?before.club_id:requestedClub;
if(clubId&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))return fail("INVALID_CLUB",request,env,400);
const phone=referee?before.phone:String(b.phone??before.phone??"").trim();
const active=referee?before.active:(b.active===undefined?before.active:(asBool(b.active)?1:0));
const oldRating=Number(before.rating||0);
const rating=canCorrectRating&&b.rating!==undefined?Number(b.rating):oldRating;
if(!Number.isFinite(rating)||rating<0)return fail("INVALID_RATING",request,env,400);
const ratingChanged=Math.abs(rating-oldRating)>1e-9;
const ratingReason=String(b.ratingReason||"").trim();
if(ratingChanged&&!ratingReason)return fail("RATING_REASON_REQUIRED",request,env,400);
```

- [ ] **Step 2: Batch the player update and rating history insert**

Build the D1 statements and run them together:

```js
const changedAt=nowIso();
const statements=[env.DB.prepare(
  "UPDATE players SET club_id=?,full_name=?,nickname=?,gender=?,rating=?,phone=?,active=?,updated_at=? WHERE id=?"
).bind(clubId,fullName,nickname,gender,rating,phone,active,changedAt,p.id)];
if(ratingChanged)statements.push(env.DB.prepare(
  "INSERT INTO rating_history(id,player_id,before_rating,delta,after_rating,reason,created_at) VALUES(?,?,?,?,?,?,?)"
).bind(uid(),p.id,oldRating,rating-oldRating,rating,ratingReason,changedAt));
await env.DB.batch(statements);
```

Keep the existing audit call after the batch and return the updated row with an explicit history result:

```js
return ok({...after,ratingHistoryRecorded:ratingChanged},request,env);
```

- [ ] **Step 3: Run the permission smoke test**

```powershell
node cloudflare/scripts/permissions.mjs
```

Expected: `CLOUDFLARE_PERMISSIONS_OK` and the new player-edit assertions pass.

- [ ] **Step 4: Run all Worker tests**

```powershell
Set-Location cloudflare
npm test
```

Expected: all Node tests pass.

- [ ] **Step 5: Commit the backend implementation**

```powershell
git add cloudflare/src/index.js
git commit -m "Support complete authorized player edits"
```

### Task 3: Render a permanent edit action and complete the modal

**Files:**
- Modify: `assets/admin-app.js:337-350`
- Modify: `assets/admin-crud.js:58-83,154-164`
- Modify: `admin.html:132-133`

- [ ] **Step 1: Render the action column and buttons directly**

Change the empty header to `Thao tác`. In each player row, render the permanent buttons inside an actions container:

```js
<th>Thao tác</th>
```

```js
<td><div class="actions">
  <button class="mini primary-mini" data-crud-edit-player="${p.id}">Sửa</button>
  <a class="mini" href="player.html?id=${encodeURIComponent(p.id)}" target="_blank" style="text-decoration:none">Hồ sơ</a>
  <button class="mini" data-avatar-player="${p.id}" data-avatar-name="${escHtml(p.full_name)}">Avatar</button>
  ${user?.role!=="referee"&&p.active?`<button class="mini danger-mini" data-crud-disable-player="${p.id}">Khóa</button>`:""}
</div></td>
```

Remove the standalone rating button because rating is moving into the edit modal.

- [ ] **Step 2: Expand the edit modal by role**

In `editPlayer`, derive role capabilities:

```js
const referee=ctx.user?.role==="referee";
const clubManager=ctx.user?.role==="club_manager";
const canChangeClub=!referee&&!clubManager;
const canCorrectRating=["super_admin","organizer"].includes(ctx.user?.role);
const clubs=canChangeClub?await API.clubs().catch(()=>[]):[];
```

Render the existing basic fields for everyone, club selection only when `canChangeClub`, phone and active status for non-referees, and these fields for rating-capable roles:

```js
'<label class="field">Rating<input id="crudPRating" type="number" min="0" step="0.1" value="'+Number(p.rating||0)+'"></label>'+
'<label class="field full">Lý do đổi rating <small>(bắt buộc khi thay đổi)</small><textarea id="crudPRatingReason" rows="2"></textarea></label>'
```

- [ ] **Step 3: Submit one complete payload**

Before calling the API, reject an empty name and require a reason when the privileged user changed rating:

```js
const fullName=$("#crudPName").value.trim();
if(!fullName)return ctx.toast("Họ tên VĐV không được để trống.");
const payload={fullName,nickname:$("#crudPNick").value.trim(),gender:$("#crudPGender").value||"other"};
if(!referee)Object.assign(payload,{phone:$("#crudPPhone").value.trim(),active:$("#crudPActive").checked});
if(canChangeClub)payload.clubId=$("#crudPClub").value||null;
if(canCorrectRating){
  const rating=Number($("#crudPRating").value),ratingReason=$("#crudPRatingReason").value.trim();
  if(Math.abs(rating-Number(p.rating||0))>1e-9&&!ratingReason)return ctx.toast("Nhập lý do khi thay đổi rating.");
  Object.assign(payload,{rating,ratingReason});
}
await API.updatePlayer(p.id,payload);
```

Map `INVALID_CLUB`, `INVALID_GENDER`, `INVALID_RATING`, and `RATING_REASON_REQUIRED` to Vietnamese messages while leaving the dialog open.

- [ ] **Step 4: Stop dynamically inserting player buttons**

In the `page==="players"` decorator branch, remove the loop that calls `insertAdjacentHTML`. Fetch the roster and attach handlers to the buttons already rendered:

```js
const roster=await API.players().catch(()=>[]);
document.querySelectorAll("[data-crud-edit-player]").forEach(b=>b.onclick=()=>editPlayer(roster.find(p=>p.id===b.dataset.crudEditPlayer),ctx));
document.querySelectorAll("[data-crud-disable-player]").forEach(b=>b.onclick=()=>danger("Khóa VĐV này khỏi danh sách công khai?",()=>API.deactivatePlayer(b.dataset.crudDisablePlayer),ctx));
```

- [ ] **Step 5: Bust cached admin assets**

Update the tags in `admin.html`:

```html
<script src="assets/admin-crud.js?v=3"></script>
<script src="assets/admin-app.js?v=38"></script>
```

- [ ] **Step 6: Build Cloudflare static assets and run the dry run**

```powershell
Set-Location cloudflare
npm run check
```

Expected: assets copy successfully and Wrangler reports a successful dry-run bundle.

- [ ] **Step 7: Commit the admin UI**

```powershell
git add assets/admin-app.js assets/admin-crud.js admin.html cloudflare/public
git commit -m "Show permanent player edit controls"
```

### Task 4: Make automatic deployment depend only on Cloudflare credentials

**Files:**
- Modify: `.github/workflows/cloudflare.yml:48-91`

- [ ] **Step 1: Remove application secrets from the deploy job**

Keep only these environment values:

```yaml
env:
  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
  CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

Change the verification step to check only those two values. Remove the `Configure Worker secrets` step; `wrangler deploy` preserves the secrets already stored on the Worker.

- [ ] **Step 2: Apply migrations before the single deploy**

Use this deployment order after installing dependencies and building assets:

```yaml
- name: Verify deployment credentials
  run: |
    test -n "$CLOUDFLARE_API_TOKEN"
    test -n "$CLOUDFLARE_ACCOUNT_ID"
- name: Ensure media bucket exists
  working-directory: cloudflare
  run: npx wrangler r2 bucket create pickleup-media || true
- name: Apply D1 migrations
  working-directory: cloudflare
  run: npx wrangler d1 migrations apply DB --remote
- name: Deploy Worker
  working-directory: cloudflare
  run: npx wrangler deploy
```

- [ ] **Step 3: Run a workflow syntax and Worker dry-run check**

```powershell
Set-Location cloudflare
npm run check
```

Expected: Wrangler dry run succeeds. Inspect `.github/workflows/cloudflare.yml` and confirm no `PICKLE_*` repository secrets remain.

- [ ] **Step 4: Commit the workflow correction**

```powershell
git add .github/workflows/cloudflare.yml
git commit -m "Use persistent Worker secrets during deploy"
```

### Task 5: Configure GitHub, publish, and verify production

**Files:**
- No repository files created.

- [ ] **Step 1: Create or obtain a scoped Cloudflare API token**

Use a token limited to account `cf2c903fc14f763d9aceb86897ee28c7` with Workers Scripts write, D1 write, R2 write, Workers Routes write, and Account read permissions.

- [ ] **Step 2: Store the two Actions secrets**

```powershell
$cloudflareToken | gh secret set CLOUDFLARE_API_TOKEN --repo capquangfptminhlh/pickle
"cf2c903fc14f763d9aceb86897ee28c7" | gh secret set CLOUDFLARE_ACCOUNT_ID --repo capquangfptminhlh/pickle
```

Confirm with `gh secret list --repo capquangfptminhlh/pickle --app actions` that both names exist without printing their values.

- [ ] **Step 3: Rebase on the current remote main and rerun validation**

```powershell
git fetch origin
git rebase origin/main
Set-Location cloudflare
npm test
npm run check
```

Expected: rebase succeeds and all tests/checks pass.

- [ ] **Step 4: Push main and watch the Cloudflare workflow**

```powershell
git push origin main
gh run watch --repo capquangfptminhlh/pickle --exit-status
```

Expected: validate and deploy jobs both complete successfully.

- [ ] **Step 5: Verify production behavior**

Check:

```powershell
Invoke-WebRequest -UseBasicParsing https://pickleup.vn/api/health
Invoke-WebRequest -UseBasicParsing https://pickleup.vn/admin.html
```

Then use the super-admin login to open **VĐV & cặp đấu**, verify every row has a visible **Sửa** button, open one player, and confirm the complete role-appropriate form appears. Make one reversible profile edit and restore it to verify the API, audit, club assignment, and rating history on production.

- [ ] **Step 6: Confirm repository state**

```powershell
git status --short --branch
```

Expected: `main` matches `origin/main` with a clean worktree.
