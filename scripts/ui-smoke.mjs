import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";

const prod=process.env.UI_BASE_URL||"http://127.0.0.1:8080";
const preview=process.env.PREVIEW_BASE_URL||"http://127.0.0.1:8090/preview";
const adminEmail=process.env.ADMIN_EMAIL||"admin@pickle.test";
const adminPassword=process.env.ADMIN_PASSWORD||"ci-password-123";

const browser=await chromium.launch({headless:true});
const failures=[];

async function inspect(page,label){
  const errs=[];
  page.on("pageerror",e=>errs.push("pageerror: "+e.message));
  page.on("console",m=>{if(m.type()==="error")errs.push("console: "+m.text())});
  page.on("response",r=>{
    const t=r.request().resourceType();
    if(r.status()>=400&&["document","script","stylesheet","xhr","fetch"].includes(t)&&!r.url().includes("favicon")){
      errs.push("http "+r.status()+": "+r.url());
    }
  });
  return ()=>{
    const unique=[...new Set(errs)].filter(x=>!x.includes("ERR_ABORTED"));
    if(unique.length)failures.push({label,errors:unique});
  };
}
async function goto(page,url,label){
  const end=await inspect(page,label);
  const r=await page.goto(url,{waitUntil:"domcontentloaded"});
  if(!r||r.status()>=400)failures.push({label,errors:["navigation status "+(r?.status()??"none")]});
  await page.waitForTimeout(350);
  end();
}

const page=await browser.newPage({viewport:{width:1280,height:900}});
await goto(page,prod+"/","prod public");
if(!/pickle/i.test(await page.locator("body").innerText()))failures.push({label:"prod public",errors:["missing Pickle content"]});
if(!(await page.locator('a[href="/login"]').count()))failures.push({label:"prod public",errors:["admin login entry missing"]});

const prodState=await fetch(prod+"/api/public/state").then(r=>r.json());
if(prodState.tournaments?.[0]?.id){
  await goto(page,prod+"/tournament.html?id="+encodeURIComponent(prodState.tournaments[0].id),"prod tournament detail");
  if(!(await page.locator("#tourName").innerText()).trim())failures.push({label:"prod tournament detail",errors:["empty tournament name"]});
}
await goto(page,prod+"/court-board.html","prod TV court board");
if(!(await page.locator(".board-brand").isVisible()))failures.push({label:"prod TV court board",errors:["TV board shell not visible"]});
await goto(page,prod+"/ranking.html","prod ranking");
const players=await fetch(prod+"/api/public/players").then(r=>r.json());
if(players[0]?.id){
  await goto(page,prod+"/player.html?id="+encodeURIComponent(players[0].id),"prod player");
  if(!(await page.locator("#playerName").innerText()).trim())failures.push({label:"prod player",errors:["empty player name"]});
}

await goto(page,prod+"/checkin.html","prod checkin invalid token");
if(!(await page.locator("#checkinTeam").innerText()).includes("QR"))failures.push({label:"prod checkin",errors:["invalid-token state missing"]});

await goto(page,prod+"/login","prod login");
await page.locator("#email").fill(adminEmail);
await page.locator("#password").fill(adminPassword);
await Promise.all([
  page.waitForURL(/\/admin(?:\.html)?$/),
  page.locator("#loginForm button[type=submit]").click()
]);
await page.waitForLoadState("networkidle");
if(!(await page.locator("#nav").isVisible()))failures.push({label:"prod admin",errors:["admin nav not visible"]});

for(const id of ["dashboard","club_events","players","clubs","club_attendance","treasury","tournaments","registrations","matches","scores","standings","bracket","courts","bookings","referees","accounts","payments","sponsors","content","reports","audit","settings"]){
  const b=page.locator('[data-page="'+id+'"]');
  if(await b.count()){
    await b.click();
    await page.waitForTimeout(120);
    const text=(await page.locator("#content").innerText()).trim();
    if(!text)failures.push({label:"prod admin "+id,errors:["empty content"]});
  }
}


async function modalSmoke(page,pageId,selector,label){
  const nav=page.locator('[data-page="'+pageId+'"]');
  if(!(await nav.count()))return;
  await nav.click();
  const trigger=page.locator(selector).first();
  const ready=await trigger.waitFor({state:"attached",timeout:2500}).then(()=>true).catch(()=>false);
  if(!ready){failures.push({label,errors:["trigger missing: "+selector]});return}
  await trigger.click();await page.waitForTimeout(80);
  const dialog=page.locator("#genericDialog");
  if(!(await dialog.evaluate(el=>el.open))){failures.push({label,errors:["dialog did not open"]});return}
  const close=dialog.locator(".icon-btn").first();
  if(await close.count())await close.click();else await dialog.evaluate(el=>el.close());
  await page.waitForTimeout(40);
}

// Regression checks for match operations.
const matchesNav=page.locator('[data-page="matches"]');
if(await matchesNav.count()){
  await matchesNav.click();
  // Native view transitions may defer render beyond a fixed navigation delay.
  await page.locator("#content h2").filter({hasText:/^Lịch thi đấu$/}).waitFor({state:"visible"});
  await page.locator("#matchList").waitFor({state:"attached"});
  await page.locator("#statusFilter").waitFor({state:"visible"});
  // Automatic byes with a TBD participant have no editable scoring history.
  const completedId=await page.evaluate(()=>state.matches.find(m=>m.status==="done"&&m.a&&m.b&&m.a!=="TBD"&&m.b!=="TBD")?.id);
  if(completedId){
    const review=page.locator('[data-match-card="'+completedId+'"] [data-score-match]');
    const reviewReady=await review.waitFor({state:"visible",timeout:5000}).then(()=>true).catch(error=>{if(error.name==="TimeoutError")return false;throw error});
    if(!reviewReady){
      failures.push({label:"prod completed match",errors:["completed score review and Undo entry missing"]});
    }else{
      await review.click();
      await page.locator("#scoreDialog").waitFor({state:"visible"});
      const controls=page.locator('#scoreDialog [data-score], #finishSet, #finishMatch, #saveQuickScore');
      if(await controls.count()!==7||!(await controls.evaluateAll(els=>els.every(el=>el.disabled)))){
        failures.push({label:"prod completed match",errors:["completed match still allows score changes"]});
      }
      if(!(await page.locator("#undoScore").isEnabled())){
        failures.push({label:"prod completed match",errors:["completed match Undo is inaccessible"]});
      }
      await page.locator("#scoreDialog .icon-btn").click();
    }
  }
  const statusFilter=page.locator("#statusFilter");
  if(await statusFilter.count()){
    await statusFilter.selectOption("live");await page.waitForTimeout(50);
    if(await page.locator('[data-match-card]:visible:not([data-match-status="live"])').count()){
      failures.push({label:"prod match filters",errors:["status filter leaves non-live cards visible"]});
    }
    await statusFilter.selectOption("");
  }
  const courtFilter=page.locator("#courtFilter");
  if(await courtFilter.count()){
    const values=await courtFilter.locator("option").evaluateAll(opts=>opts.map(o=>o.value).filter(Boolean));
    if(values.length){
      await courtFilter.selectOption(values[0]);await page.waitForTimeout(50);
      if(await page.locator('[data-match-card]:visible:not([data-match-court="'+values[0]+'"])').count()){
        failures.push({label:"prod match filters",errors:["court filter leaves cards from other courts visible"]});
      }
      await courtFilter.selectOption("");
    }
  }
}
const scoresNav=page.locator('[data-page="scores"]');
if(await scoresNav.count()){
  await scoresNav.click();
  await page.locator("#content h2").filter({hasText:/^Các trận cần nhập$/}).waitFor({state:"visible"});
  await page.locator("#matchList").waitFor({state:"attached"});
  await page.locator("#statusFilter").waitFor({state:"visible"});
  const scoreId=await page.evaluate(()=>state.matches.find(m=>m.status!=="cancelled"&&m.a&&m.b&&m.a!=="TBD"&&m.b!=="TBD")?.id);
  if(scoreId){
    const scoreTrigger=page.locator('[data-match-card="'+scoreId+'"] [data-score-match]');
    const scoreReady=await scoreTrigger.waitFor({state:"visible",timeout:5000}).then(()=>true).catch(error=>{if(error.name==="TimeoutError")return false;throw error});
    if(!scoreReady){
      failures.push({label:"prod score guard",errors:["score entry missing for eligible match"]});
    }else{
      await scoreTrigger.click();
      await page.locator("#scoreDialog").waitFor({state:"visible"});
      if(!(await page.locator("#finishMatch").isDisabled())){
        failures.push({label:"prod score guard",errors:["finish match enabled before required set wins"]});
      }
      const currentA=Number(await page.locator("#scoreA").innerText()),currentB=Number(await page.locator("#scoreB").innerText());
      const target=Number(await page.locator("#targetScore").inputValue());
      if(Math.max(currentA,currentB)<target&&!(await page.locator("#finishSet").isDisabled())){
        failures.push({label:"prod score guard",errors:["finish set enabled below target score"]});
      }
      await page.locator("#scoreDialog .icon-btn").click();
    }
  }
}

for(const [pid,selector,label] of [
  ["tournaments",'[data-action="newTournament"]',"prod create tournament"],
  ["players",'[data-action="newPlayer"]',"prod create player"],
  ["matches",'[data-action="newMatch"]',"prod create match"],
  ["courts",'[data-action="newCourt"]',"prod create court"],
  ["referees",'[data-action="newReferee"]',"prod create referee"],
  ["accounts",'[data-action="newUser"]',"prod create child account"],
  ["registrations",'[data-module-action="new-registration"]',"prod create registration"],
  ["clubs",'[data-module-action="new-club"]',"prod create club"],
  ["bookings",'[data-module-action="new-booking"]',"prod create booking"],
  ["sponsors",'[data-module-action="new-sponsor"]',"prod create sponsor"],
  ["content",'[data-module-action="new-post"]',"prod create post"],
  ["club_events",'[data-club-action="new-event"]',"prod create club activity"],
  ["treasury",'[data-club-action="new-transaction"]',"prod create treasury transaction"]
])await modalSmoke(page,pid,selector,label);

const scoreBtn=page.locator("[data-score-match]").first();
if(await scoreBtn.count()){
  await scoreBtn.click();
  await page.waitForTimeout(100);
  if(!(await page.locator("#scoreDialog").evaluate(el=>el.open)))failures.push({label:"prod scoring",errors:["score dialog did not open"]});
  await page.locator("#scoreDialog .icon-btn").click();
}

await page.setViewportSize({width:390,height:844});
await page.waitForTimeout(150);
if(!(await page.locator(".mobile-dock").isVisible()))failures.push({label:"mobile admin dock",errors:["mobile dock not visible"]});
const dockScores=page.locator('[data-dock-page="scores"]');
if(await dockScores.count()){await dockScores.click();await page.waitForTimeout(100);if(!(await page.locator("#content").innerText()).includes("Nhập điểm"))failures.push({label:"mobile admin dock",errors:["scores dock navigation failed"]});}

await goto(page,prod+"/referee.html","prod referee courtside");
if(!(await page.locator(".courtside-brand").isVisible()))failures.push({label:"prod referee courtside",errors:["courtside shell not visible"]});
if(!(await page.locator("#matchPicker").count())||!(await page.locator("#scoreSurface").count()))failures.push({label:"prod referee courtside",errors:["courtside match/score surfaces missing"]});

await goto(page,prod+"/court-board.html","prod authenticated TV court board");
if(!(await page.locator("#voiceBtn").isVisible()))failures.push({label:"prod authenticated TV court board",errors:["voice control missing"]});
const adminBoardState=await page.evaluate(()=>window.PickleAPI.optionalAdminState());
if(adminBoardState?.tournaments?.length){
  if((await page.locator("#dataMode").innerText()).trim()!=="NỘI BỘ")failures.push({label:"prod authenticated TV court board",errors:["authenticated board did not switch to internal data"]});
  if(!(await page.locator("#tournamentSelect option").count()))failures.push({label:"prod authenticated TV court board",errors:["internal tournament selector empty"]});
}
await goto(page,prod+"/match.html?id=missing-smoke-id","prod live match QR page");
if(!(await page.locator(".match-topbar").isVisible()))failures.push({label:"prod live match QR page",errors:["match page shell missing"]});
await page.setViewportSize({width:1280,height:900});

const ppage=await browser.newPage({viewport:{width:1280,height:900}});
await goto(ppage,preview+"/index.html","preview public");
if(!(await ppage.locator('a[href="login.html"]').count()))failures.push({label:"preview public",errors:["safe admin login entry missing"]});

await goto(ppage,preview+"/submit-tournament.html","preview tournament submit");
const submitBanner=ppage.locator("#tourBanner");
if(!(await submitBanner.count())){
  failures.push({label:"preview tournament banner",errors:["banner upload input missing"]});
}else{
  const tinyPng=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZP2sAAAAASUVORK5CYII=","base64");
  await submitBanner.setInputFiles({name:"banner.png",mimeType:"image/png",buffer:tinyPng});
  await ppage.waitForTimeout(80);
  if(!(await ppage.locator("#tourBannerPreviewWrap").isVisible().catch(()=>false)))failures.push({label:"preview tournament banner",errors:["banner preview did not appear"]});
  await ppage.locator("#tourBannerRemove").click();
  if(await ppage.locator("#tourBannerPreviewWrap").isVisible().catch(()=>false))failures.push({label:"preview tournament banner",errors:["banner preview did not clear"]});
}
await goto(ppage,preview+"/login.html","preview safe login");
if(!(await ppage.locator("body").innerText()).includes("GitHub Pages chỉ là giao diện public"))failures.push({label:"preview safe login",errors:["static admin security boundary missing"]});
await ppage.locator("#email").fill("admin@pickle.test");
await ppage.locator("#password").fill("ci-password-123");
await Promise.all([
  ppage.waitForURL(/\/preview\/admin\.html$/),
  ppage.locator("#loginForm button[type=submit]").click()
]);
await ppage.waitForLoadState("domcontentloaded");

await goto(ppage,preview+"/ranking.html","preview ranking");
const link=ppage.locator('a[href^="player.html?id="]').first();
if(await link.count()){
  const href=await link.getAttribute("href");
  await goto(ppage,preview+"/"+href,"preview player");
}
await goto(ppage,preview+"/checkin.html","preview checkin");
await goto(ppage,preview+"/admin.html","preview admin");
const initialLocalState=await ppage.evaluate(async()=>await window.PickleAPI.adminState());
if(["tournaments","divisions","courts","clubs","players","teams","matches","registrations","sponsors","posts","bookings","clubEvents","clubTransactions"].some(k=>(initialLocalState[k]||[]).length)){
  failures.push({label:"preview clean start",errors:["Pages app must start without seeded mock data"]});
}
// Create temporary browser-local records only for UI smoke coverage. These never ship as app data.
await ppage.evaluate(async()=>{
  const created=await window.PickleAPI.createTournament({name:"UI Smoke Tournament",venue:"CI",eventType:"doubles"});
  const did=created.division.id,tid=created.tournament.id;
  const court=await window.PickleAPI.createCourt(tid,{name:"UI Court"});
  const club=await window.PickleAPI.createClub({name:"UI Club",city:"HCMC"});
  const player=await window.PickleAPI.createPlayer({fullName:"UI Player",clubId:club.id,rating:3});
  const playerB=await window.PickleAPI.createPlayer({fullName:"UI Player B",clubId:club.id,rating:3.1});
  const playerC=await window.PickleAPI.createPlayer({fullName:"UI Player C",clubId:club.id,rating:3.2});
  const playerD=await window.PickleAPI.createPlayer({fullName:"UI Player D",clubId:club.id,rating:3.3});
  const beforeImport=await window.PickleAPI.adminState();
  let importError=null;
  try{await window.PickleAPI.importTeams(did,[{name:"Invalid UI Import",player1:player.full_name,player2:"Missing UI Player"}])}
  catch(error){importError=error}
  const afterImport=await window.PickleAPI.adminState();
  if(importError?.message!=="IMPORT_PLAYER_ISSUES"||importError?.issues?.[0]?.row!==1)throw new Error("preview import did not report missing registry player");
  if(afterImport.players.length!==beforeImport.players.length||afterImport.teams.length!==beforeImport.teams.length)throw new Error("preview invalid import mutated state");
  const event=await window.PickleAPI.createClubEvent({clubId:club.id,title:"UI Social",eventType:"social",venue:"UI Court",startAt:new Date(Date.now()+3600000).toISOString(),endAt:new Date(Date.now()+7200000).toISOString()});
  await window.PickleAPI.addClubAttendance(event.id,player.id);
  await window.PickleAPI.createClubTransaction({clubId:club.id,direction:"income",category:"membership",amount:100000,note:"UI test"});
  try{await window.PickleAPI.createTeam(did,{name:"Duplicate UI",playerIds:[player.id,player.id]});throw new Error("duplicate player selection accepted")}
  catch(error){if(error.message!=="DUPLICATE_PLAYER_SELECTION")throw error}
  const inactive=await window.PickleAPI.createPlayer({fullName:"Inactive UI Player",rating:3});
  const spare=await window.PickleAPI.createPlayer({fullName:"Spare UI Player",rating:3});
  await window.PickleAPI.deactivatePlayer(inactive.id);
  try{await window.PickleAPI.createTeam(did,{name:"Inactive UI",playerIds:[inactive.id,spare.id]});throw new Error("inactive player accepted")}
  catch(error){if(error.message!=="PLAYER_INACTIVE")throw error}
  const a=await window.PickleAPI.createTeam(did,{name:"UI Team A",group:"A",seed:1,playerIds:[player.id,playerB.id]});
  try{await window.PickleAPI.createTeam(did,{name:"Assigned UI",playerIds:[player.id,playerB.id]});throw new Error("assigned player accepted")}
  catch(error){if(error.message!=="PLAYER_ALREADY_IN_DIVISION")throw error}
  const b=await window.PickleAPI.createTeam(did,{name:"UI Team B",group:"A",seed:2,playerIds:[playerC.id,playerD.id]});
  await window.PickleAPI.createMatch(did,{teamAId:a.id,teamBId:b.id,courtId:court.id,stage:"UI Smoke"});
});

// Regression: full 16-pair tournament workflow — draw 4 pools, round robin, Top 2, bracket to final.
const draw16=await ppage.evaluate(async()=>{
  const created=await window.PickleAPI.createTournament({name:"16 Pairs Draw Test",venue:"CI Bracket Court",eventType:"doubles"});
  const did=created.division.id,tid=created.tournament.id;
  await window.PickleAPI.updateDivisionFull(did,{name:"Đôi 16 cặp",eventType:"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2,active:true});
  for(let i=1;i<=4;i++)await window.PickleAPI.createCourt(tid,{name:"Sân "+i});
  const teams=[];
  for(let i=1;i<=16;i++){
    const p1=await window.PickleAPI.createPlayer({fullName:"Draw Player "+String(i*2-1).padStart(2,"0"),rating:3});
    const p2=await window.PickleAPI.createPlayer({fullName:"Draw Player "+String(i*2).padStart(2,"0"),rating:3});
    teams.push(await window.PickleAPI.createTeam(did,{name:"Cặp "+String(i).padStart(2,"0"),group:"A",seed:i,playerIds:[p1.id,p2.id]}));
  }
  const draw=await window.PickleAPI.autoSeedGroups(did,4);
  const rr=await window.PickleAPI.generateRoundRobin(did);
  let state=await window.PickleAPI.adminState();
  const groupMatches=state.matches.filter(m=>m.divisionId===did&&!m.bracketSlot&&(m.stage||"").startsWith("Bảng "));
  for(const m of groupMatches)await window.PickleAPI.quickScore(m.id,{sets:[[11,7],[11,8]]});
  const bracket=await window.PickleAPI.generateBracket(did);
  state=await window.PickleAPI.adminState();
  const drawn=state.teams.filter(t=>t.divisionId===did&&t.status!=="withdrawn");
  const groups=Object.fromEntries(["A","B","C","D"].map(g=>[g,drawn.filter(t=>t.group===g).map(t=>t.name)]));
  const ko=state.matches.filter(m=>m.divisionId===did&&m.bracketSlot).sort((a,b)=>a.bracketSlot.localeCompare(b.bracketSlot,undefined,{numeric:true}));
  const byId=Object.fromEntries(drawn.map(t=>[t.id,t]));
  const qf=ko.filter(m=>(m.bracketSlot||"").startsWith("SE-R1-")).map(m=>({
    slot:m.bracketSlot,
    a:byId[m.a]?.name||m.a,b:byId[m.b]?.name||m.b,
    groupA:byId[m.a]?.group||null,groupB:byId[m.b]?.group||null
  }));
  const halfOf=slot=>Number((slot.match(/M(\d+)$/)||[])[1]||0)<=2?"top":"bottom";
  const groupHalves={};
  for(const m of qf)for(const side of [["a","groupA"],["b","groupB"]]){
    const teamName=m[side[0]],g=m[side[1]];if(!g)continue;
    (groupHalves[g]||(groupHalves[g]=[])).push({team:teamName,half:halfOf(m.slot),slot:m.slot});
  }
  return {tournamentId:tid,divisionId:did,draw,rr,bracket,groups,qf,groupHalves,koSlots:ko.map(m=>m.bracketSlot)};
});
for(const g of ["A","B","C","D"]){
  if((draw16.groups[g]||[]).length!==4)failures.push({label:"16-pair draw",errors:[g+" must contain exactly 4 teams: "+JSON.stringify(draw16.groups[g])]});
  const halves=new Set((draw16.groupHalves[g]||[]).map(x=>x.half));
  if(halves.size!==2)failures.push({label:"16-pair bracket separation",errors:[g+" qualifiers are not in opposite halves: "+JSON.stringify(draw16.groupHalves[g])]});
}
if(draw16.rr.created!==24)failures.push({label:"16-pair round robin",errors:["expected 24 group matches, got "+draw16.rr.created]});
if(draw16.bracket.created!==7||draw16.bracket.bracketSize!==8)failures.push({label:"16-pair knockout",errors:["expected 8-team / 7-match bracket: "+JSON.stringify(draw16.bracket)]});
if(draw16.qf.some(m=>m.groupA&&m.groupA===m.groupB))failures.push({label:"16-pair QF",errors:["same-group teams met in quarterfinal: "+JSON.stringify(draw16.qf)]});
const expectedSlots=["SE-R1-M1","SE-R1-M2","SE-R1-M3","SE-R1-M4","SE-R2-M1","SE-R2-M2","SE-R3-M1"];
if(JSON.stringify(draw16.koSlots)!==JSON.stringify(expectedSlots))failures.push({label:"16-pair bracket slots",errors:["unexpected bracket slots: "+JSON.stringify(draw16.koSlots)]});
await mkdir("ui-artifacts",{recursive:true});
await goto(ppage,preview+"/tournament.html?id="+encodeURIComponent(draw16.tournamentId),"preview 16-pair bracket");
const bracketText=(await ppage.locator("#tourBracket").innerText()).replace(/\s+/g," ");
for(const label of ["Tứ kết","Bán kết","Chung kết"])if(!bracketText.includes(label))failures.push({label:"16-pair bracket UI",errors:["missing "+label+" in rendered bracket: "+bracketText.slice(0,500)]});
await ppage.screenshot({path:"ui-artifacts/16-pairs-bracket.png",fullPage:true});
await goto(ppage,preview+"/admin.html","preview admin after 16-pair bracket");

await ppage.reload({waitUntil:"domcontentloaded"});await ppage.waitForTimeout(250);
for(const id of ["dashboard","tournaments","registrations","players","clubs","matches","scores","standings","bracket","courts","bookings","referees","accounts","payments","sponsors","content","reports","audit","settings"]){
  const b=ppage.locator('[data-page="'+id+'"]');
  if(await b.count()){
    await b.click();
    await ppage.waitForTimeout(100);
    const text=(await ppage.locator("#content").innerText()).trim();
    if(!text)failures.push({label:"preview admin "+id,errors:["empty content"]});
  }
}
for(const [pid,selector,label] of [
  ["tournaments",'[data-action="newTournament"]',"preview create tournament"],
  ["players",'[data-action="newPlayer"]',"preview create player"],
  ["matches",'[data-action="newMatch"]',"preview create match"],
  ["courts",'[data-action="newCourt"]',"preview create court"],
  ["referees",'[data-action="newReferee"]',"preview create referee"],
  ["registrations",'[data-module-action="new-registration"]',"preview create registration"],
  ["clubs",'[data-module-action="new-club"]',"preview create club"],
  ["bookings",'[data-module-action="new-booking"]',"preview create booking"],
  ["sponsors",'[data-module-action="new-sponsor"]',"preview create sponsor"],
  ["content",'[data-module-action="new-post"]',"preview create post"],
  ["club_events",'[data-club-action="new-event"]',"preview create club activity"],
  ["treasury",'[data-club-action="new-transaction"]',"preview create treasury transaction"]
])await modalSmoke(ppage,pid,selector,label);

// Exercise populated public Preview flows using temporary browser-local records.
await goto(ppage,preview+"/index.html","preview populated home");
if(!(await ppage.locator(".tour-card").count()))failures.push({label:"preview populated home",errors:["created tournament not visible on public home"]});
if(!(await ppage.locator(".top-player-card").count()))failures.push({label:"preview populated home",errors:["created player not visible on public home"]});
const eventHref=await ppage.locator(".tour-card").first().getAttribute("href").catch(()=>null);
if(eventHref){
  await goto(ppage,preview+"/"+eventHref,"preview tournament detail");
  if(!(await ppage.locator("#tourName").textContent()||"").includes("UI Smoke Tournament"))failures.push({label:"preview tournament detail",errors:["tournament route shows wrong record"]});
}
await goto(ppage,preview+"/index.html","preview populated home return");
const playerHref=await ppage.locator(".top-player-card").first().getAttribute("href").catch(()=>null);
if(playerHref){
  await goto(ppage,preview+"/"+playerHref,"preview player detail");
  if(!(await ppage.locator("#playerName").innerText()).includes("UI Player"))failures.push({label:"preview player detail",errors:["player route shows wrong record"]});
}
await goto(ppage,preview+"/ranking.html","preview populated ranking");
for(const mode of ["player","club","area"]){
  const tab=ppage.locator('[data-rank-mode="'+mode+'"]');
  if(!(await tab.count())){failures.push({label:"preview ranking modes",errors:["missing "+mode+" tab"]});continue}
  await tab.click();await ppage.waitForTimeout(60);
  if(!(await tab.evaluate(el=>el.classList.contains("active"))))failures.push({label:"preview ranking modes",errors:[mode+" tab did not activate"]});
  if(!(await ppage.locator("#rankingRows .ranking-app-row").count()))failures.push({label:"preview ranking modes",errors:[mode+" ranking has no populated rows"]});
}

await goto(ppage,preview+"/admin.html","preview populated admin return");
await ppage.locator('[data-page="players"]').click();
await ppage.locator('#content h2').filter({hasText:"Bảng VĐV / Rating hệ thống"}).waitFor({state:"visible"});
const registryText=await ppage.locator("#content").innerText();
if(!registryText.includes("Bảng VĐV / Rating hệ thống"))failures.push({label:"player registry label",errors:["system registry heading missing"]});
if(!(await ppage.locator('[data-action="newPlayer"]').innerText()).includes("Tạo hồ sơ VĐV"))failures.push({label:"player registry action",errors:["profile action label missing"]});
await ppage.locator('[data-action="newTeam"]').click();
if(!(await ppage.locator("[data-player-picker]").count())){
  failures.push({label:"team player picker",errors:["searchable picker missing"]});
}else{
  await ppage.locator('[data-player-search]').first().fill("Spare UI Player");
  if(!(await ppage.locator('[data-player-result]').count()))failures.push({label:"team player picker",errors:["registry search returned no athlete"]});
  await ppage.locator('[data-player-search]').first().fill("Không tồn tại 999999");
  const noResult="VĐV chưa có trong hệ thống. Hãy tạo hồ sơ tại Bảng VĐV / Rating trước.";
  if(!(await ppage.locator('[data-player-results]').first().innerText()).includes(noResult))failures.push({label:"team player picker",errors:["missing registry guidance"]});
}
await ppage.locator('#genericDialog .icon-btn').click();
await ppage.setViewportSize({width:390,height:844});
for(const id of ["dashboard","club_events","players","clubs","club_attendance","treasury","tournaments","registrations","matches","scores","standings","bracket","courts","bookings","referees","payments","sponsors","content","reports","audit","settings"]){
  const b=ppage.locator('[data-page="'+id+'"]');
  if(!(await b.count()))continue;
  await b.evaluate(el=>el.click());await ppage.waitForTimeout(90);
  const overflow=await ppage.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
  if(overflow){
    const offenders=await ppage.evaluate(()=>[...document.querySelectorAll("body *")].map(el=>{const r=el.getBoundingClientRect();return {tag:el.tagName,cls:el.className?.toString?.().slice(0,90)||"",text:(el.textContent||"").trim().replace(/\s+/g," ").slice(0,70),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}}).filter(x=>x.width>0&&(x.left<-1||x.right>window.innerWidth+1)).slice(0,12));
    failures.push({label:"preview mobile admin "+id,errors:["page has horizontal overflow: "+JSON.stringify(offenders)]});
  }
  if(!(await ppage.locator("#content").innerText()).trim())failures.push({label:"preview mobile admin "+id,errors:["empty mobile content"]});
}
const previewScoresNav=ppage.locator('[data-page="scores"]');
if(await previewScoresNav.count())await previewScoresNav.evaluate(el=>el.click());
await ppage.waitForTimeout(100);
const pscore=ppage.locator("[data-score-match]").first();
if(await pscore.count()){
  await pscore.click();
  await ppage.waitForTimeout(100);
  if(!(await ppage.locator("#scoreDialog").evaluate(el=>el.open)))failures.push({label:"preview scoring",errors:["score dialog did not open"]});
  const scoreCardBox=await ppage.locator("#scoreDialog .score-card").boundingBox();
  if(scoreCardBox&&(scoreCardBox.x<0||scoreCardBox.x+scoreCardBox.width>390.5))failures.push({label:"preview scoring",errors:["score dialog leaves mobile viewport"]});
  await ppage.locator("#scoreDialog .icon-btn").click().catch(()=>{});
}

// UI VISUAL QA — real mobile screenshots used for design review.
await mkdir("ui-artifacts",{recursive:true});
const shot=ppage;await shot.setViewportSize({width:390,height:844});
await shot.goto(preview+"/index.html",{waitUntil:"domcontentloaded"});await shot.waitForTimeout(700);
if(!(await shot.locator(".public-mobile-dock").isVisible().catch(()=>false)))failures.push({label:"preview mobile public",errors:["public mobile dock missing"]});
if(await shot.locator(".public-mobile-dock a").count()!==5)failures.push({label:"preview mobile public",errors:["public bottom nav must have 5 tabs"]});
if(!(await shot.locator(".mobile-app-dashboard").isVisible().catch(()=>false)))failures.push({label:"preview mobile public",errors:["mobile tournament dashboard missing"]});
if(await shot.locator(".public-hero").isVisible().catch(()=>false))failures.push({label:"preview mobile public",errors:["desktop tournament hero should be replaced by mobile dashboard"]});
if(!(await shot.locator("#publicTours").isVisible().catch(()=>false)))failures.push({label:"preview mobile public",errors:["tournament list missing"]});
const publicOverflow=await shot.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
if(publicOverflow)failures.push({label:"preview mobile public",errors:["public home has horizontal overflow"]});
await shot.screenshot({path:"ui-artifacts/mobile-public.png",fullPage:true});

await shot.goto(preview+"/ranking.html",{waitUntil:"domcontentloaded"});await shot.waitForTimeout(700);
if(!(await shot.locator(".ranking-tabs").isVisible().catch(()=>false)))failures.push({label:"preview mobile ranking",errors:["ranking app tabs missing"]});
if(!(await shot.locator("#rankingPodium").isVisible().catch(()=>false)))failures.push({label:"preview mobile ranking",errors:["ranking podium missing"]});
for(const mode of ["player","club","area"]){
  const tab=shot.locator('[data-rank-mode="'+mode+'"]');
  if(!(await tab.count())){failures.push({label:"preview mobile ranking",errors:["missing ranking tab "+mode]});continue}
  await tab.click();await shot.waitForTimeout(80);
  if(!(await tab.evaluate(el=>el.classList.contains("active"))))failures.push({label:"preview mobile ranking",errors:["ranking tab did not activate: "+mode]});
}
const rankHeroImg=shot.locator(".ranking-hero-grid>img");
if(await rankHeroImg.count()&&await rankHeroImg.isVisible().catch(()=>false)){
  failures.push({label:"preview mobile ranking",errors:["ranking hero image must be hidden on mobile"]});
}
const rankingOverflow=await shot.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
if(rankingOverflow)failures.push({label:"preview mobile ranking",errors:["ranking page has horizontal overflow"]});
await shot.screenshot({path:"ui-artifacts/mobile-ranking.png",fullPage:true});

await shot.goto(preview+"/admin.html",{waitUntil:"domcontentloaded"});await shot.waitForTimeout(700);
const dash=shot.locator('[data-page="dashboard"]');if(await dash.count())await dash.evaluate(el=>el.click());await shot.waitForTimeout(500);
if(!(await shot.locator(".mobile-dock").isVisible().catch(()=>false)))failures.push({label:"preview mobile admin",errors:["admin mobile dock missing"]});
if(await shot.locator("#sidebar").evaluate(el=>el.classList.contains("open")).catch(()=>false))failures.push({label:"preview mobile admin",errors:["admin drawer unexpectedly open on dashboard"]});
if(await shot.locator("#sidebar").isVisible().catch(()=>false))failures.push({label:"preview mobile admin",errors:["closed admin drawer is still visible"]});
if(await shot.locator(".app-fab").isVisible().catch(()=>false))failures.push({label:"preview mobile admin",errors:["quick-action FAB overlaps dashboard"]});
if(!(await shot.locator(".club-home-hero").isVisible().catch(()=>false)))failures.push({label:"preview mobile admin",errors:["club home hero missing"]});
if(await shot.locator(".club-home-metrics article").count()!==4)failures.push({label:"preview mobile admin",errors:["club home metrics incomplete"]});
const clippedHomeActions=await shot.evaluate(()=>[...document.querySelectorAll(".club-home-actions button")].filter(el=>{const r=el.getBoundingClientRect();return r.left<0||r.right>window.innerWidth+1}).length);
if(clippedHomeActions)failures.push({label:"preview mobile admin",errors:["dashboard quick actions clipped outside viewport"]});
const adminOverflow=await shot.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
if(adminOverflow)failures.push({label:"preview mobile admin",errors:["admin dashboard has horizontal overflow"]});
await shot.screenshot({path:"ui-artifacts/mobile-admin-home.png",fullPage:true});

const scoreNav=shot.locator('[data-dock-page="scores"]');if(await scoreNav.count())await scoreNav.click();else await shot.evaluate(()=>document.querySelector('[data-page="scores"]')?.click());await shot.waitForTimeout(250);
const clippedScoreControls=await shot.evaluate(()=>[...document.querySelectorAll(".filters>*")].filter(el=>{
  const r=el.getBoundingClientRect();return r.left<0||r.right>window.innerWidth+1;
}).map(el=>({tag:el.tagName,text:(el.textContent||"").trim().slice(0,40)})));
if(clippedScoreControls.length)failures.push({label:"preview mobile score",errors:["score filters/actions clipped outside viewport: "+JSON.stringify(clippedScoreControls)]});
const scoreOpen=shot.locator("[data-score-match]").first();if(await scoreOpen.count()){await scoreOpen.click();await shot.waitForTimeout(220);}
const scoreOverflow=await shot.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+2);
if(scoreOverflow)failures.push({label:"preview mobile score",errors:["score screen has horizontal overflow"]});
const filterBoxes=await shot.locator("#content .filters>*").evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}})).catch(()=>[]);
if(filterBoxes.some(r=>r.left<0||r.right>390.5))failures.push({label:"preview mobile score",errors:["score filter/action controls leave viewport"]});
await shot.screenshot({path:"ui-artifacts/mobile-score.png"});

// No seeded player is expected on a fresh Pages install.

await browser.close();
if(failures.length){
  console.error(JSON.stringify(failures,null,2));
  process.exit(1);
}
console.log("UI SMOKE PASS");
