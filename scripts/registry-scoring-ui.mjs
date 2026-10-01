import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,extname,dirname} from "node:path";
import {createRequire} from "node:module";
import worker from "../cloudflare/src/index.js";
import {scoringFixture} from "../cloudflare/tests/helpers/scoring-fixture.mjs";
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const root=fileURLToPath(new URL("../",import.meta.url));
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,"http://localhost").pathname;
  if(path==="/socket.io/socket.io.js"||path==="/assets/pwa.js"){res.end("");return}
  const full=resolve(root,"."+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader("Content-Type",({".js":"application/javascript",".html":"text/html",".css":"text/css"})[extname(full)]||"application/octet-stream");res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true}),failures=[];
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const f=await scoringFixture(),page=await browser.newPage({viewport}),errors=[],requests=[];
  page.setDefaultTimeout(6000);page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens.admin);
  await page.route("**/api/**",async route=>{
    const r=route.request();if(r.method()==="POST")requests.push({path:new URL(r.url()).pathname,body:r.postDataJSON()});
    const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  const open=async()=>{await page.evaluate(()=>{page="scores";return refresh()});await page.locator('[data-score-match="match"]').click();await page.locator("#scoreDialog").waitFor()};
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);await page.locator("#userName").filter({hasText:"Admin"}).waitFor({state:"attached"});
    f.db.exec("UPDATE matches SET current_score_a=11,current_score_b=5,status='live',started_at='2026-10-01T12:00:00Z' WHERE id='match'");
    await open();assert.equal(await page.locator("#finishSet").isEnabled(),true);assert.equal(await page.locator("#finishMatch").isDisabled(),true,"first set must not finish bestOf3");
    await page.locator("#finishSet").click();await page.waitForFunction(()=>document.querySelector("#scoreA").textContent==="0");
    assert.equal(f.sets().length,1);
    const rows=page.locator(".quick-set-row");await rows.nth(0).locator(".quick-score-a").fill("11");await rows.nth(0).locator(".quick-score-b").fill("5");
    await rows.nth(1).locator(".quick-score-a").fill("11");await rows.nth(1).locator(".quick-score-b").fill("6");
    await page.locator("#saveQuickScore").click();await page.waitForFunction(()=>!document.querySelector("#scoreDialog").open);
    assert.equal(f.match().status,"completed");assert.equal(requests.find(r=>r.path.endsWith("quick-score")).body.expectedVersion,2);
    await open();assert.equal(await page.locator("#saveQuickScore").isDisabled(),true);assert.equal(await page.locator('[data-score="a"][data-delta="1"]').isDisabled(),true);
    assert.equal(await page.locator("#finishSet").isDisabled(),true);assert.equal(await page.locator("#finishMatch").isDisabled(),true);
    await page.locator("#undoScore").click();await page.waitForFunction(()=>document.querySelector('#saveQuickScore').disabled===false);
    assert.equal(f.match().status,"live");assert.equal(f.sets().length,1);assert.equal(requests.find(r=>r.path.endsWith("undo")).body.expectedVersion,3);
    await rows.nth(1).locator(".quick-score-b").fill("");const before=requests.length;await page.locator("#saveQuickScore").click();
    await page.locator(".toast").filter({hasText:/hai bên/}).waitFor();assert.equal(requests.length,before);
    await rows.nth(1).locator(".quick-score-b").fill("6");
    f.db.exec("UPDATE matches SET version=version+1 WHERE id='match'");await page.locator("#saveQuickScore").click();
    await page.locator(".toast").filter({hasText:/máy khác|thay đổi/}).waitFor();assert.equal(f.match().status,"live");assert.equal(await rows.nth(1).locator(".quick-score-b").inputValue(),"6");
    assert.deepEqual(errors,[]);console.log("PASS scoring real Worker UI",viewport.width);
  }catch(e){failures.push(`${viewport.width}: ${e.message}`);console.error("FAIL",failures.at(-1))}
  finally{await page.close();f.db.close()}
}}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
assert.deepEqual(failures,[]);console.log("SCORING_UI_OK");
