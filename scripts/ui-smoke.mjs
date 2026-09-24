import {chromium} from "playwright";

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
  const r=await page.goto(url,{waitUntil:"networkidle"});
  if(!r||r.status()>=400)failures.push({label,errors:["navigation status "+(r?.status()??"none")]});
  await page.waitForTimeout(250);
  end();
}

const page=await browser.newPage({viewport:{width:390,height:844}});
await goto(page,prod+"/","prod public");
if(!(await page.locator("body").innerText()).includes("Pickle"))failures.push({label:"prod public",errors:["missing Pickle content"]});

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

for(const id of ["dashboard","tournaments","players","matches","scores","standings","bracket","courts","referees","payments","audit","settings"]){
  const b=page.locator('[data-page="'+id+'"]');
  if(await b.count()){
    await b.click();
    await page.waitForTimeout(120);
    const text=(await page.locator("#content").innerText()).trim();
    if(!text)failures.push({label:"prod admin "+id,errors:["empty content"]});
  }
}

const scoreBtn=page.locator("[data-score-match]").first();
if(await scoreBtn.count()){
  await scoreBtn.click();
  await page.waitForTimeout(100);
  if(!(await page.locator("#scoreDialog").evaluate(el=>el.open)))failures.push({label:"prod scoring",errors:["score dialog did not open"]});
  await page.locator("#scoreDialog .icon-btn").click();
}

const ppage=await browser.newPage({viewport:{width:390,height:844}});
await goto(ppage,preview+"/index.html","preview public");
await goto(ppage,preview+"/ranking.html","preview ranking");
const link=ppage.locator('a[href^="player.html?id="]').first();
if(await link.count()){
  const href=await link.getAttribute("href");
  await goto(ppage,preview+"/"+href,"preview player");
}
await goto(ppage,preview+"/checkin.html","preview checkin");
await goto(ppage,preview+"/admin.html","preview admin");
for(const id of ["dashboard","tournaments","players","matches","scores","standings","bracket","courts","referees","payments","audit","settings"]){
  const b=ppage.locator('[data-page="'+id+'"]');
  if(await b.count()){
    await b.click();
    await ppage.waitForTimeout(100);
    const text=(await ppage.locator("#content").innerText()).trim();
    if(!text)failures.push({label:"preview admin "+id,errors:["empty content"]});
  }
}
const pscore=ppage.locator("[data-score-match]").first();
if(await pscore.count()){
  await pscore.click();
  await ppage.waitForTimeout(100);
  if(!(await ppage.locator("#scoreDialog").evaluate(el=>el.open)))failures.push({label:"preview scoring",errors:["score dialog did not open"]});
}

await browser.close();
if(failures.length){
  console.error(JSON.stringify(failures,null,2));
  process.exit(1);
}
console.log("UI SMOKE PASS");
