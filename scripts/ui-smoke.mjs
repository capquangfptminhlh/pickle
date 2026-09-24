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

for(const id of ["dashboard","tournaments","registrations","players","clubs","matches","scores","standings","bracket","courts","bookings","referees","payments","sponsors","content","reports","audit","settings"]){
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
  await nav.click();await page.waitForTimeout(120);
  const trigger=page.locator(selector).first();
  if(!(await trigger.count())){failures.push({label,errors:["trigger missing: "+selector]});return}
  await trigger.click();await page.waitForTimeout(80);
  const dialog=page.locator("#genericDialog");
  if(!(await dialog.evaluate(el=>el.open))){failures.push({label,errors:["dialog did not open"]});return}
  const close=dialog.locator(".icon-btn").first();
  if(await close.count())await close.click();else await dialog.evaluate(el=>el.close());
  await page.waitForTimeout(40);
}

for(const [pid,selector,label] of [
  ["tournaments",'[data-action="newTournament"]',"prod create tournament"],
  ["players",'[data-action="newPlayer"]',"prod create player"],
  ["matches",'[data-action="newMatch"]',"prod create match"],
  ["courts",'[data-action="newCourt"]',"prod create court"],
  ["referees",'[data-action="newReferee"]',"prod create referee"],
  ["registrations",'[data-module-action="new-registration"]',"prod create registration"],
  ["clubs",'[data-module-action="new-club"]',"prod create club"],
  ["bookings",'[data-module-action="new-booking"]',"prod create booking"],
  ["sponsors",'[data-module-action="new-sponsor"]',"prod create sponsor"],
  ["content",'[data-module-action="new-post"]',"prod create post"]
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
await page.setViewportSize({width:1280,height:900});

const ppage=await browser.newPage({viewport:{width:1280,height:900}});
await goto(ppage,preview+"/index.html","preview public");
await goto(ppage,preview+"/ranking.html","preview ranking");
const link=ppage.locator('a[href^="player.html?id="]').first();
if(await link.count()){
  const href=await link.getAttribute("href");
  await goto(ppage,preview+"/"+href,"preview player");
}
await goto(ppage,preview+"/checkin.html","preview checkin");
await goto(ppage,preview+"/admin.html","preview admin");
for(const id of ["dashboard","tournaments","registrations","players","clubs","matches","scores","standings","bracket","courts","bookings","referees","payments","sponsors","content","reports","audit","settings"]){
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
  ["content",'[data-module-action="new-post"]',"preview create post"]
])await modalSmoke(ppage,pid,selector,label);

const pscore=ppage.locator("[data-score-match]").first();
if(await pscore.count()){
  await pscore.click();
  await ppage.waitForTimeout(100);
  if(!(await ppage.locator("#scoreDialog").evaluate(el=>el.open)))failures.push({label:"preview scoring",errors:["score dialog did not open"]});
}

// UI VISUAL QA — real mobile screenshots used for design review.
await mkdir("ui-artifacts",{recursive:true});
const shot=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
await shot.goto(preview+"/index.html",{waitUntil:"domcontentloaded"});await shot.waitForTimeout(700);
await shot.screenshot({path:"ui-artifacts/mobile-public.png"});

await shot.goto(preview+"/admin.html",{waitUntil:"domcontentloaded"});await shot.waitForTimeout(700);
const dash=shot.locator('[data-page="dashboard"]');if(await dash.count())await dash.evaluate(el=>el.click());await shot.waitForTimeout(250);
await shot.screenshot({path:"ui-artifacts/mobile-admin-home.png",fullPage:true});

const scoreNav=shot.locator('[data-dock-page="scores"]');if(await scoreNav.count())await scoreNav.click();await shot.waitForTimeout(250);
const scoreOpen=shot.locator("[data-score-match]").first();if(await scoreOpen.count()){await scoreOpen.click();await shot.waitForTimeout(220);}
await shot.screenshot({path:"ui-artifacts/mobile-score.png"});

await shot.goto(preview+"/player.html?id=p1",{waitUntil:"domcontentloaded"});await shot.waitForTimeout(700);
await shot.screenshot({path:"ui-artifacts/mobile-player.png"});

await browser.close();
if(failures.length){
  console.error(JSON.stringify(failures,null,2));
  process.exit(1);
}
console.log("UI SMOKE PASS");
