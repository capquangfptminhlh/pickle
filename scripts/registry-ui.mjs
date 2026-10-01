import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname, dirname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require("playwright")); }
catch {
  ({ chromium } = require(resolve(process.env.CODEX_NODE_MODULES || resolve(dirname(process.execPath), "../node_modules"), "playwright")));
}
const root = fileURLToPath(new URL("../", import.meta.url));
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path === "/socket.io/socket.io.js" || path === "/assets/pwa.js") { res.end(""); return; }
    const full = resolve(root, "." + path);
    if (!full.startsWith(root)) { res.writeHead(403).end(); return; }
    res.setHeader("Content-Type", ({ ".js": "application/javascript", ".html": "text/html", ".css": "text/css" })[extname(full)] || "application/octet-stream");
    res.end(await readFile(full));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const failures = [];

async function fixture(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(2500);
  await page.route("**/assets/api.js*", route => route.fulfill({ contentType: "application/javascript", body: `
    const roster=[
      {id:"p1",full_name:"Nguyễn Một",active:true,club_name:"CLB A",rating:3},
      {id:"p2",full_name:"Trần Hai (khóa)",active:false,rating:3},
      {id:"p3",full_name:"Đã có đội",active:true,club_name:"CLB A"},
      {id:"p4",full_name:"Đội đã rút",active:true,club_name:"CLB A"},
      {id:"p5",full_name:"Tự do",active:true,club_name:null},
      {id:"p6",full_name:"Hồ sơ mới",active:true,club_name:"CLB A"},
      {id:"p7",full_name:"Cùng CLB",active:true,club_name:"CLB A"}
    ];
    const data={tournaments:[],divisions:[{id:"d1",name:"Đôi",eventType:"doubles",active:true}],courts:[],teams:[
      {id:"t1",divisionId:"d1",name:"Đội gốc",clubId:null,club:"Tự do",group:"A",status:"active",w:0,l:0,pf:0,pa:0},
      {id:"t2",divisionId:"d1",name:"Đội khác",status:"active",w:0,l:0,pf:0,pa:0},
      {id:"t3",divisionId:"d1",name:"Đội rút",status:"withdrawn",w:0,l:0,pf:0,pa:0}
    ],teamPlayers:{t1:["p1","p2"],t2:["p3"],t3:["p4"]},matches:[],audit:[]};
    window.__fixture={roster,data,clubs:[{id:"c1",name:"CLB A",active:true}],calls:[],error:null,issues:null,issueShape:"worker"};
    window.PickleAPI={
      me:async()=>({user:{name:"UI test",role:"super_admin"}}),adminState:async()=>structuredClone(data),
      players:async()=>structuredClone(roster),clubs:async()=>structuredClone(window.__fixture.clubs),
      reportOverview:async()=>({}),clubEvents:async()=>[],
      updateTeam:async(id,payload)=>{window.__fixture.calls.push({id,payload});if(window.__fixture.error)throw new Error(window.__fixture.error);return {id}},
      createTeam:async(id,payload)=>{window.__fixture.calls.push({id,payload});return {id:"new"}},
      importTeams:async(id,rows)=>{if(window.__fixture.issues){const e=new Error("IMPORT_PLAYER_ISSUES");
        if(window.__fixture.issueShape==="worker")e.data={detail:{issues:window.__fixture.issues}};
        else if(window.__fixture.issueShape==="node")e.data={issues:window.__fixture.issues};
        else e.issues=window.__fixture.issues;
        throw e;
      }return {created:rows.length}}
    };
  ` }));
  await page.goto(base + "/admin.html");
  if (viewport.width <= 760) await page.locator("#mobileMenu").click();
  await page.locator('[data-page="players"]').click();
  await page.locator('[data-crud-edit-team="t1"]').waitFor();
  return page;
}
async function test(name, fn) {
  try { await fn(); console.log("PASS", name); }
  catch (error) { failures.push(name); console.error("FAIL", name, error.message); }
}
async function edit(page) {
  await page.locator('[data-crud-edit-team="t1"]').click();
  await page.locator("#crudTeamName").waitFor();
}
async function choose(page, index, id, selector = "#crudTeamPlayerPicker", query = "") {
  const slot = page.locator(`${selector} [data-player-picker-slot="${index}"]`);
  await slot.waitFor({ state: "visible" });
  if (await slot.getByRole("button", { name: "Chọn lại" }).count()) await slot.getByRole("button", { name: "Chọn lại" }).click();
  await slot.locator("input").focus();
  if (query) await slot.locator("input").fill(query);
  await slot.locator(`[data-player-id="${id}"]`).click();
}

try {
  await test("initial selected profiles stay visible, including inactive profiles", async () => {
    const page = await fixture();
    await page.evaluate(() => {
      const host = document.createElement("div"); host.id = "testPicker"; document.body.append(host);
      window.testPicker = window.PicklePlayerPicker.mount({ root: host, players: window.__fixture.roster, count: 2, selectedIds: ["p1", "p2"] });
    });
    assert.deepEqual(await page.evaluate(() => window.testPicker.values()), ["p1", "p2"]);
    assert.match(await page.locator("#testPicker").innerText(), /Trần Hai/);
    await choose(page, 1, "p6", "#testPicker");
    await page.locator('#testPicker [data-player-picker-slot="1"] button', { hasText: "Chọn lại" }).click();
    await page.locator('#testPicker [data-player-search="1"]').focus();
    assert.equal(await page.locator('#testPicker [data-player-id="p2"]').count(), 0);
    await page.close();
  });
  await test("edit existing members and preserve metadata-only links", async () => {
    const page = await fixture(); await edit(page);
    assert.equal(await page.locator("#crudTeamPlayerPicker [data-player-picker-slot]").count(), 2);
    assert.match(await page.locator("#crudTeamPlayerPicker").innerText(), /Nguyễn Một/);
    assert.match(await page.locator("#crudTeamPlayerPicker").innerText(), /Trần Hai/);
    await page.locator("#crudTeamName").fill("Tên sửa"); await page.locator("#crudSaveTeam").click();
    await page.waitForFunction(() => window.__fixture.calls.length === 1);
    const call = await page.evaluate(() => window.__fixture.calls[0]);
    assert.equal(call.id, "t1"); assert.equal(call.payload.name, "Tên sửa"); assert.equal("playerIds" in call.payload, false);
    await page.close();
  });
  await test("metadata edits preserve an archived assigned club even when omitted from the club list", async () => {
    for (const present of [false, true]) {
      const page = await fixture();
      await page.evaluate(present => {
        Object.assign(window.__fixture.data.teams[0], { clubId: "old-club", club: "CLB lịch sử" });
        window.__fixture.clubs.push({ id: "other-locked", name: "CLB khác đã khóa", active: false });
        if (present) window.__fixture.clubs.push({ id: "old-club", name: "CLB lịch sử", active: false });
      }, present);
      await page.evaluate(() => refresh()); await edit(page);
      assert.equal(await page.locator("#crudTeamClub").inputValue(), "old-club");
      assert.match(await page.locator('#crudTeamClub option[value="old-club"]').innerText(), /CLB lịch sử.*đã khóa/);
      assert.equal(await page.locator('#crudTeamClub option[value="other-locked"]').count(), 0);
      assert.equal(await page.locator('#crudTeamClub option[value="c1"]').count(), 1);
      await page.locator("#crudTeamName").fill("Tên lịch sử sửa"); await page.locator("#crudSaveTeam").click();
      await page.waitForFunction(() => window.__fixture.calls.length === 1);
      const payload = await page.evaluate(() => window.__fixture.calls[0].payload);
      assert.equal(payload.clubId, "old-club"); assert.equal("playerIds" in payload, false);
      await page.close();
    }
  });
  await test("roster replacement excludes active peers and retains selection after conflict", async () => {
    const page = await fixture(); await edit(page);
    await page.locator('#crudTeamPlayerPicker [data-player-picker-slot="1"] button', { hasText: "Chọn lại" }).click();
    await page.locator('#crudTeamPlayerPicker [data-player-search="1"]').focus();
    assert.equal(await page.locator('#crudTeamPlayerPicker [data-player-id="p3"]').count(), 0);
    assert.equal(await page.locator('#crudTeamPlayerPicker [data-player-id="p4"]').count(), 1);
    await page.locator('#crudTeamPlayerPicker [data-player-id="p6"]').click();
    await page.evaluate(() => window.__fixture.error = "PLAYER_ALREADY_IN_DIVISION");
    await page.locator("#crudSaveTeam").click();
    await page.waitForFunction(() => window.__fixture.calls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.__fixture.calls[0].payload.playerIds), ["p1", "p6"]);
    assert.match(await page.locator("#crudTeamError").innerText(), /đội khác/);
    assert.match(await page.locator("#crudTeamPlayerPicker").innerText(), /Hồ sơ mới/);
    assert.equal(await page.locator("#crudSaveTeam").isEnabled(), true);
    await page.evaluate(() => window.__fixture.error = null); await page.locator("#crudSaveTeam").click();
    await page.waitForFunction(() => !document.querySelector("#genericDialog").open);
    await page.close();
  });
  await test("locked roster explains reason while metadata stays editable", async () => {
    const page = await fixture();
    await page.evaluate(() => { window.__fixture.data.matches = [{ id: "m1", a: "t1", b: "t2", status: "scheduled", current: [0, 0], sets: [], startedAt: "2026-10-01T00:00:00Z" }]; });
    await page.evaluate(() => refresh()); await edit(page);
    assert.match(await page.locator("#crudTeamRosterNote").innerText(), /đã bắt đầu/);
    assert.equal(await page.locator('#crudTeamPlayerPicker button').first().isDisabled(), true);
    await page.locator("#crudTeamName").fill("Tên vẫn sửa"); await page.locator("#crudSaveTeam").click();
    await page.waitForFunction(() => window.__fixture.calls.length === 1);
    assert.equal("playerIds" in await page.evaluate(() => window.__fixture.calls[0].payload), false);
    await page.close();
  });
  await test("edit picker uses division slot counts", async () => {
    const page = await fixture();
    for (const [eventType, count] of [["singles", 1], ["mixed_doubles", 2], ["team", 4]]) {
      await page.evaluate(type => { window.__fixture.data.divisions[0].eventType = type; window.__fixture.data.teamPlayers.t1 = ["p1"]; }, eventType);
      await page.evaluate(() => refresh()); await edit(page);
      assert.equal(await page.locator("#crudTeamPlayerPicker [data-player-picker-slot]").count(), count);
      await page.evaluate(() => document.querySelector("#genericDialog").close());
    }
    await page.close();
  });
  await test("legacy conflicting links survive metadata-only edits", async () => {
    const page = await fixture();
    await page.evaluate(() => { window.__fixture.data.teamPlayers.t2.push("p1"); });
    await page.evaluate(() => refresh()); await edit(page);
    assert.match(await page.locator("#crudTeamPlayerPicker").innerText(), /Nguyễn Một/);
    await page.locator("#crudTeamName").fill("Tên legacy sửa"); await page.locator("#crudSaveTeam").click();
    await page.waitForFunction(() => window.__fixture.calls.length === 1);
    assert.equal("playerIds" in await page.evaluate(() => window.__fixture.calls[0].payload), false);
    await page.close();
  });
  await test("a match starting while editing preserves draft and allows restoring inactive original members on mobile", async () => {
    const page = await fixture({ width: 390, height: 844 }); await edit(page);
    await choose(page, 1, "p6"); await page.locator("#crudTeamName").fill("Tên sau khi trận bắt đầu");
    await page.evaluate(() => window.__fixture.error = "TEAM_ROSTER_LOCKED"); await page.locator("#crudSaveTeam").click();
    assert.match(await page.locator("#crudTeamError").innerText(), /đã bắt đầu/);
    assert.match(await page.locator("#crudTeamPlayerPicker").innerText(), /Hồ sơ mới/);
    await page.locator("#crudTeamResetMembers").click();
    assert.match(await page.locator("#crudTeamPlayerPicker").innerText(), /Trần Hai/);
    assert.equal(await page.locator("#crudTeamName").inputValue(), "Tên sau khi trận bắt đầu");
    await page.evaluate(() => window.__fixture.error = null); await page.locator("#crudSaveTeam").click();
    await page.waitForFunction(() => window.__fixture.calls.length === 2);
    assert.equal("playerIds" in await page.evaluate(() => window.__fixture.calls[1].payload), false);
    await page.close();
  });
  await test("club autofill requires every selected player to share a club", async () => {
    const page = await fixture(); await page.locator('[data-action="newTeam"]').click();
    await choose(page, 0, "p6", "#teamPlayerPicker"); await choose(page, 1, "p5", "#teamPlayerPicker");
    assert.equal(await page.locator("#teamClub").inputValue(), "");
    await choose(page, 1, "p7", "#teamPlayerPicker");
    assert.equal(await page.locator("#teamClub").inputValue(), "CLB A");
    await page.locator("#teamClub").fill("CLB riêng"); await choose(page, 1, "p5", "#teamPlayerPicker");
    assert.equal(await page.locator("#teamClub").inputValue(), "CLB riêng");
    await page.close();
  });
  for (const shape of ["worker", "node", "preview"]) {
    await test(`${shape} CSV issues show row, field, name and Vietnamese reason safely on mobile`, async () => {
      const page = await fixture({ width: 390, height: 844 });
      await page.locator('[data-action="importCsv"]').click(); await page.locator("#csvType").selectOption("teams");
      const csv = 'name,player1,player2\nĐội mới,Nguyễn Một,<img src=x onerror=alert(1)>';
      await page.locator("#csvPaste").fill(csv);
      await page.evaluate(shape => {
        window.__fixture.issueShape = shape;
        window.__fixture.issues = ["PLAYER_NOT_FOUND", "AMBIGUOUS_PLAYER", "PLAYER_INACTIVE", "DUPLICATE_PLAYER_SELECTION", "PLAYER_ALREADY_IN_IMPORT", "PLAYER_ALREADY_IN_DIVISION", "INVALID_PLAYER_COUNT"].map((reason, i) => ({ row: i + 1, field: "player2", name: "<img src=x onerror=alert(1)>", reason }));
      }, shape);
      await page.locator("#csvImportBtn").click();
      await page.locator("#csvIssues").waitFor({ state: "visible" });
      const text = await page.locator("#csvIssues").innerText({ timeout: 2000 });
      assert.match(text, /Dòng 1/); assert.match(text, /player2/); assert.match(text, /<img src=x onerror=alert\(1\)>/);
      for (const reason of [/không.*tồn tại/i, /trùng tên/i, /khóa/i, /hai lần/i, /CSV/i, /đội khác/i, /Số lượng/i]) assert.match(text, reason);
      assert.equal(await page.locator("#csvIssues img").count(), 0);
      assert.equal(await page.locator("#csvPaste").inputValue(), csv);
      assert.equal(await page.locator("#csvImportBtn").isEnabled(), true);
      assert.equal(await page.evaluate(() => document.querySelector("#genericDialog").open), true);
      await page.locator("#csvPaste").fill("name,player1,player2\nSửa,Nguyễn Một,Hồ sơ mới");
      await page.evaluate(() => window.__fixture.issues = null); await page.locator("#csvImportBtn").click();
      await page.waitForFunction(() => !document.querySelector("#genericDialog").open);
      await page.close();
    });
  }
  if (process.env.REGISTRY_UI_API_BASE) {
    await test("local Worker preserves club and registration through UI roster replacement and reports CSV issues", async () => {
      const live = process.env.REGISTRY_UI_API_BASE.replace(/\/+$/, "");
      assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(live).hostname), "live UI regression permits only a local test server");
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      page.setDefaultTimeout(10000);
      await page.goto(live + "/login.html");
      await page.locator("#email").fill(process.env.ADMIN_EMAIL || "admin@pickle.test");
      await page.locator("#password").fill(process.env.ADMIN_PASSWORD || "cloudflare-test-password-123");
      await page.locator('#loginForm button[type="submit"]').click();
      await page.locator('[data-page="players"]').waitFor();
      const setup = await page.evaluate(async () => {
        const suffix = Date.now(), tournament = await window.PickleAPI.createTournament({ name: `Registry UI ${suffix}`, eventType: "doubles" });
        const data = await window.PickleAPI.adminState(), division = data.divisions.find(d => d.tournamentId === tournament.id);
        const players = [];
        for (const letter of ["A", "B", "C"]) players.push(await window.PickleAPI.createPlayer({ fullName: `UI ${letter} ${suffix}` }));
        return { divisionId: division.id, players, name: `UI Team ${suffix}`, club: `UI Club ${suffix}` };
      });
      await page.evaluate(() => refresh());
      await page.locator('[data-page="players"]').click();
      await page.locator('[data-action="newTeam"]').click();
      await page.locator("#teamDivision").selectOption(setup.divisionId);
      await choose(page, 0, setup.players[0].id, "#teamPlayerPicker", setup.players[0].full_name);
      await choose(page, 1, setup.players[1].id, "#teamPlayerPicker", setup.players[1].full_name);
      await page.locator("#teamName").fill(setup.name); await page.locator("#teamClub").fill(setup.club);
      await page.locator("#saveTeam").click();
      await page.waitForFunction(() => !document.querySelector("#genericDialog").open);
      const created = await page.evaluate(async setup => {
        const data = await window.PickleAPI.adminState(), team = data.teams.find(t => t.name === setup.name);
        const registration = await window.PickleAPI.createRegistration(setup.divisionId, { teamId: team.id, amount: 0 });
        return { team, registration };
      }, setup);
      assert.equal(created.team.club, setup.club); assert.ok(created.team.clubId);
      await page.locator(`[data-crud-edit-team="${created.team.id}"]`).click();
      await choose(page, 1, setup.players[2].id, "#crudTeamPlayerPicker", setup.players[2].full_name);
      await page.locator("#crudSaveTeam").click();
      await page.waitForFunction(() => !document.querySelector("#genericDialog").open);
      const saved = await page.evaluate(async id => {
        const data = await window.PickleAPI.adminState(), registrations = await window.PickleAPI.registrations();
        return { team: data.teams.find(t => t.id === id), players: data.teamPlayers[id], registrations };
      }, created.team.id);
      assert.deepEqual(saved.players.sort(), [setup.players[0].id, setup.players[2].id].sort());
      assert.equal(saved.team.club, setup.club);
      assert.ok(saved.registrations.some(r => (r.team_id || r.teamId) === created.team.id));
      await page.locator('[data-action="importCsv"]').click();
      await page.locator("#csvType").selectOption("teams"); await page.locator("#csvDivision").selectOption(setup.divisionId);
      const csv = `name,player1,player2\nInvalid UI Team,${setup.players[2].full_name},UI Missing ${Date.now()}`;
      await page.locator("#csvPaste").fill(csv); await page.locator("#csvImportBtn").click();
      await page.locator("#csvIssues").waitFor({ state: "visible" });
      const issues = await page.locator("#csvIssues").innerText();
      assert.match(issues, /Dòng 1/); assert.match(issues, /player2/); assert.match(issues, /không tồn tại/);
      assert.equal(await page.locator("#csvPaste").inputValue(), csv);
      await page.close();
    });
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
if (failures.length) throw new Error(`${failures.length} registry UI regressions: ${failures.join("; ")}`);
console.log("REGISTRY_UI_OK");
