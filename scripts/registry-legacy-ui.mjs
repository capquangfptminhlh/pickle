import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname,dirname} from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import worker from "../cloudflare/src/index.js";
import {accountFixture} from "../cloudflare/tests/helpers/accounts-fixture.mjs";
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const root=fileURLToPath(new URL("../",import.meta.url));
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,"http://localhost").pathname,full=resolve(root,"."+path);
  if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader("Content-Type",({".html":"text/html",".js":"application/javascript",".svg":"image/svg+xml"})[extname(full)]||"application/octet-stream");
  res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const browser=await chromium.launch({headless:true});
try{for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  const f=await accountFixture(),page=await browser.newPage({viewport}),errors=[],requests=[];
  page.setDefaultTimeout(6000);page.on("pageerror",e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const original=File.prototype.text;
    File.prototype.text=function(){
      if(this.name.startsWith("slow-"))return new Promise((resolve,reject)=>{window.releaseBackupRead=()=>original.call(this).then(resolve,reject)});
      return original.call(this);
    };
  });
  const backup={players:[{id:"restored-player",full_name:"VĐV Khôi phục",rating:3.2}],teams:{length:'<img id="backup-injected" src="data:image/png;base64,AA==" onerror="document.body.dataset.backupExecuted=\'true\'">'}};
  let rejectLogin=false;
  await page.route("https://pickleup.vn/api/**",async route=>{
    const req=route.request();requests.push(new URL(req.url()).pathname);
    if(req.url().endsWith("/auth/login")){await route.fulfill(rejectLogin?{status:401,json:{error:"INVALID_CREDENTIALS"}}:{json:{token:f.tokens.admin,user:{role:"super_admin"}}});return}
    const response=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()}),f.env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  try{
    await page.goto(`http://127.0.0.1:${server.address().port}/legacy-migrate.html`);
    assert.equal(await page.locator("#migrateBtn").isDisabled(),true);
    const file=page.locator("#backupFile");assert.equal(await file.count(),1,"JSON restore must work without the retired Pages origin");
    await file.setInputFiles({name:"too-large.json",mimeType:"application/json",buffer:Buffer.alloc(20*1024*1024+1)});
    await page.locator("#legacyStatus").filter({hasText:/vượt quá 20 MB/}).waitFor();
    assert.equal(await page.locator("#migrateBtn").isDisabled(),true);assert.equal(requests.length,0);
    await file.setInputFiles({name:"invalid.json",mimeType:"application/json",buffer:Buffer.from("{bad")});
    await page.locator("#legacyStatus").filter({hasText:/không hợp lệ/i}).waitFor();
    assert.equal(await page.locator("#migrateBtn").isDisabled(),true);assert.equal(requests.length,0);
    for(const content of [JSON.stringify({players:[{id:"wrong-player",full_name:"Wrong backup"}]}),"{invalid"]){
      await file.setInputFiles({name:"slow-first.json",mimeType:"application/json",buffer:Buffer.from(content)});
      await page.waitForFunction(()=>typeof window.releaseBackupRead==="function");
      await file.setInputFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
      await page.locator("#legacyStatus").filter({hasText:"backup.json"}).waitFor();
      assert.equal(await page.locator("#backup-injected").count(),0,"backup collection fields must never inject HTML into the page");
      await page.evaluate(()=>{window.releaseBackupRead();delete window.releaseBackupRead});
      await page.waitForTimeout(50);
      assert.ok((await page.locator("#legacyStatus").innerText()).includes("backup.json"),"an older file read must not replace the latest selected backup");
      assert.equal(await page.locator("#migrateBtn").isEnabled(),true);
    }
    await file.setInputFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(backup))});
    await page.locator("#legacyStatus").filter({hasText:"backup.json"}).waitFor();
    assert.equal(await page.locator("#migrateBtn").isEnabled(),true);
    assert.equal(requests.length,0,"selecting a file must not transmit it");
    await page.locator("#email").fill("admin@test.vn");await page.locator("#password").fill("local-synthetic-password");
    await page.locator("#migrateBtn").click();await page.locator("#result").filter({hasText:"THÀNH CÔNG"}).waitFor();
    assert.equal(f.db.prepare("SELECT full_name FROM players WHERE id='restored-player'").get().full_name,"VĐV Khôi phục");
    f.db.exec("UPDATE players SET rating=4.5 WHERE id='restored-player'");
    await page.locator("#password").fill("local-synthetic-password");
    await page.locator("#migrateBtn").click();await page.locator("#result").filter({hasText:/giữ nguyên|bỏ qua/i}).waitFor();
    assert.equal(f.db.prepare("SELECT rating FROM players WHERE id='restored-player'").get().rating,4.5);
    assert.equal(await page.locator("#password").inputValue(),"");
    rejectLogin=true;const beforeRequests=requests.filter(path=>path.endsWith("/import-legacy-state")).length;
    await page.locator("#password").fill("wrong-synthetic-password");await page.locator("#migrateBtn").click();
    await page.locator("#result").filter({hasText:/Sai email hoặc mật khẩu/}).waitFor();
    assert.equal(await page.locator("#password").inputValue(),"");
    assert.equal(requests.filter(path=>path.endsWith("/import-legacy-state")).length,beforeRequests);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
    assert.deepEqual(errors,[]);console.log("PASS legacy JSON recovery UI",viewport.width);
  }finally{await page.close();f.db.close()}
}}finally{await browser.close();await new Promise(r=>server.close(r))}
console.log("LEGACY_UI_OK");
