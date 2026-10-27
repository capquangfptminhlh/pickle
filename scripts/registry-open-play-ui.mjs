import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {resolve,dirname,extname} from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import worker from "../cloudflare/src/index.js";
import {accountFixture} from "../cloudflare/tests/helpers/accounts-fixture.mjs";
import {signSession} from "../cloudflare/src/auth.js";
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const root=fileURLToPath(new URL("../",import.meta.url));
const snapshotDir=resolve(root,"ui-artifacts");
await mkdir(snapshotDir,{recursive:true});
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
 for(const viewport of [{width:320,height:760},{width:390,height:844},{width:1280,height:850}]){
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
   await page.addInitScript(token=>{if(!localStorage.getItem("pickle-api-token-v1"))localStorage.setItem("pickle-api-token-v1",token)},f.tokens.organizer);
   await page.goto(base+"/open-play-admin.html");
   await page.locator("#workspace:not(.hidden)").waitFor();
   const adminType=await page.evaluate(()=>({
     body:getComputedStyle(document.body).fontFamily,
     hero:getComputedStyle(document.querySelector(".op-hero h1")).fontFamily
   }));
   assert.match(adminType.body,/Plus Jakarta Sans/);
   assert.match(adminType.hero,/Barlow Condensed/);
   await page.locator("#title").fill("Open Play UI Test "+viewport.width);
   await page.locator("#startsAt").fill("2026-11-01T11:00");
   await page.locator("#createSession button[type=submit]").click();
   await page.locator("#selectedTitle").filter({hasText:"Open Play UI Test"}).waitFor();
   await page.locator("#openSignup").click();
   await page.locator("#details").filter({hasText:"ĐANG BẬT"}).waitFor();
   await page.locator("#roundCount").fill("3");
   await page.locator("#courtCount").fill("2");
   await page.locator("#previewRounds").click();
   await page.locator("#roundResults").filter({hasText:"BẢN XEM TRƯỚC"}).waitFor();
   await page.locator("#roundResults").filter({hasText:"Vòng 3"}).waitFor();
   await page.screenshot({path:resolve(snapshotDir,"open-play-admin-"+viewport.width+".png"),fullPage:true});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   const id=f.db.prepare("SELECT id FROM open_play_sessions WHERE title=?").get("Open Play UI Test "+viewport.width)?.id;
   assert.ok(id,"session must persist to real local D1 fixture");
   f.db.exec("INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES ('ui-player','ui-player@test.invalid','Người chơi','player','unused')");
   f.db.exec("INSERT INTO players(id,user_id,full_name,rating) VALUES ('ui-profile','ui-player','VĐV Local',2.5)");
   const token=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id='ui-player'").get());
   await page.evaluate(token=>localStorage.setItem("pickle-api-token-v1",token),token);
   await page.goto(base+"/open-play-discover.html");
   await page.locator("#sessions article").first().waitFor();
   const playerType=await page.evaluate(()=>({
     body:getComputedStyle(document.body).fontFamily,
     hero:getComputedStyle(document.querySelector(".op-hero h1")).fontFamily,
     heroClipped:document.querySelector(".op-hero h1").scrollWidth>document.querySelector(".op-hero h1").clientWidth+2
   }));
   assert.match(playerType.body,/Plus Jakarta Sans/);
   assert.match(playerType.hero,/Barlow Condensed/);
   assert.equal(playerType.heroClipped,false,"Vietnamese hero heading should not clip");
   await page.locator("#sessionSearch").fill("khong-co-buoi-choi-nao");
   await page.locator("#sessions").filter({hasText:"Không tìm thấy lịch phù hợp"}).waitFor();
   await page.locator("#sessionSearch").fill("Open Play UI Test");
   await page.locator("#sessions article").first().waitFor();
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
   await page.locator("#sessions article button").first().click();
   await page.locator("#registrations").filter({hasText:"Open Play UI Test"}).waitFor();
   await page.screenshot({path:resolve(snapshotDir,"open-play-player-"+viewport.width+".png"),fullPage:true});
   assert.equal(f.db.prepare("SELECT status FROM open_play_registrations WHERE session_id=? AND player_id='ui-profile'").get(id)?.status,"registered");
   await page.locator("#registrations button").first().click();
   await page.locator("#registrations").filter({hasText:"Đã hủy"}).waitFor();
   assert.equal(f.db.prepare("SELECT status FROM open_play_registrations WHERE session_id=? AND player_id='ui-profile'").get(id)?.status,"cancelled");
   // Simulate complete game day on the same isolated in-memory D1 fixture.
   f.db.exec("INSERT INTO players(id,full_name,rating) VALUES ('gd1','Day Player 1',2.5),('gd2','Day Player 2',2.5),('gd3','Day Player 3',2.5),('gd4','Day Player 4',2.5)");
   for(const playerId of ["gd1","gd2","gd3","gd4"]){
    const joined=await f.api("/api/open-play/sessions/"+id+"/registrations",{playerId},"POST","organizer");
    assert.equal(joined.status,201,JSON.stringify(joined.data));
   }
   await page.evaluate(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens.organizer);
   await page.goto(base+"/open-play-admin.html");
   await page.locator("#workspace:not(.hidden)").waitFor();
   await page.getByRole("button",{name:"Quản lý Open Play UI Test "+viewport.width}).click();
   await page.locator("#roster li").filter({hasText:"Day Player 4"}).waitFor();
   for(let i=1;i<=4;i++){
    await page.getByRole("button",{name:"Check-in Day Player "+i}).click();
    await page.locator("#checkedInCount").filter({hasText:i+" VĐV"}).waitFor();
   }
   await page.locator("#roundCount").fill("2");
   await page.locator("#courtCount").fill("1");
   await page.locator("#pointTarget").selectOption("11");
   page.once("dialog",dialog=>dialog.accept());
   await page.locator("#confirmRounds").click();
   await page.locator("#gameDayStatus").filter({hasText:"2 trận"}).waitFor();
   assert.equal(await page.locator("#matches article").count(),2);
   await page.screenshot({path:resolve(snapshotDir,"open-play-day-"+viewport.width+".png"),fullPage:true});
   const firstMatch=page.locator("#matches article").first();
   await firstMatch.locator("input").nth(0).fill("11");
   await firstMatch.locator("input").nth(1).fill("7");
   await firstMatch.getByRole("button",{name:"Kết thúc trận"}).click();
   await page.locator("#gameDayStatus").filter({hasText:"1/2 trận"}).waitFor();
   assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM open_play_matches WHERE session_id=? AND status='completed'").get(id).n,1);
   const secondMatch=page.locator("#matches article").nth(1);
   await secondMatch.locator("input").nth(0).fill("4");
   await secondMatch.locator("input").nth(1).fill("11");
   await secondMatch.getByRole("button",{name:"Kết thúc trận"}).click();
   await page.locator("#gameDayStatus").filter({hasText:"2/2 trận"}).waitFor();
   await page.locator("#closeSession").click();
   await page.locator("#details").filter({hasText:"Đã đóng"}).waitFor();
   assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
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
