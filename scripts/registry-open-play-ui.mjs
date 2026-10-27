import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,dirname,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import worker from "../cloudflare/src/index.js";
import {accountFixture} from "../cloudflare/tests/helpers/accounts-fixture.mjs";
import {signSession} from "../cloudflare/src/auth.js";
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const root=fileURLToPath(new URL("../",import.meta.url));
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,"http://localhost").pathname;
  const full=resolve(root,"."+pathname);
  if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader("Content-Type",({".html":"text/html",".js":"application/javascript",".css":"text/css",".svg":"image/svg+xml",".woff2":"font/woff2"})[extname(full)]||"application/octet-stream");
  res.end(await readFile(full));
 }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const browser=await chromium.launch({headless:true});
const base="http://127.0.0.1:"+server.address().port;
try{
 for(const viewport of [{width:390,height:844},{width:1280,height:850}]){
  const f=await accountFixture();
  const page=await browser.newPage({viewport});
  page.setDefaultTimeout(12000);
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.route("**/api/**",async route=>{
   const original=route.request();
   const req=new Request("https://pickle.test"+new URL(original.url()).pathname+new URL(original.url()).search,{
    method:original.method(),headers:original.headers(),
    ...(original.postData()?{body:original.postData()}: {})
   });
   const response=await worker.fetch(req,f.env);
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  try{
   await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens.organizer);
   await page.goto(base+"/open-play-admin.html");
   await page.locator("#workspace:not(.hidden)").waitFor();
   await page.locator("#title").fill("Open Play UI Test "+viewport.width);
   await page.locator("#startsAt").fill("2026-11-01T11:00");
   await page.locator("#createSession button[type=submit]").click();
   await page.locator("#selectedTitle").filter({hasText:"Open Play UI Test"}).waitFor();
   await page.locator("#openSignup").click();
   await page.locator("#details").filter({hasText:"ĐANG BẬT"}).waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   const id=f.db.prepare("SELECT id FROM open_play_sessions WHERE title=?").get("Open Play UI Test "+viewport.width)?.id;
   assert.ok(id,"session must persist to real local D1 fixture");
   f.db.exec("INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES ('ui-player','ui-player@test.invalid','Người chơi','player','unused')");
   f.db.exec("INSERT INTO players(id,user_id,full_name,rating) VALUES ('ui-profile','ui-player','VĐV Local',2.5)");
   const token=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id='ui-player'").get());
   await page.evaluate(token=>localStorage.setItem("pickle-api-token-v1",token),token);
   await page.goto(base+"/open-play-discover.html");
   await page.locator("#sessions article").first().waitFor();
   await page.locator("#sessions article button").first().click();
   await page.locator("#registrations").filter({hasText:"Open Play UI Test"}).waitFor();
   assert.equal(f.db.prepare("SELECT status FROM open_play_registrations WHERE session_id=? AND player_id='ui-profile'").get(id)?.status,"registered");
   await page.locator("#registrations button").first().click();
   await page.locator("#registrations").filter({hasText:"cancelled"}).waitFor();
   assert.equal(f.db.prepare("SELECT status FROM open_play_registrations WHERE session_id=? AND player_id='ui-profile'").get(id)?.status,"cancelled");
   await page.goto(base+"/open-play.html");
   await page.locator("#generate").click();
   await page.locator("#result").filter({hasText:"Kết quả: 2 cặp"}).waitFor();
   assert.deepEqual(errors,[],"browser errors");
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   console.log("PASS OPEN_PLAY_UI "+viewport.width);
  }finally{await page.close();f.db.close()}
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
console.log("OPEN_PLAY_UI_OK");
