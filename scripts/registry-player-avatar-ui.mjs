import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,extname,dirname} from "node:path";
import {createRequire} from "node:module";

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const root=fileURLToPath(new URL("../",import.meta.url));
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,"http://localhost").pathname;
  if(path==="/socket.io/socket.io.js"||path==="/assets/pwa.js"){res.end("");return}
  const full=resolve(root,"."+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader("Content-Type",({".js":"application/javascript",".html":"text/html",".css":"text/css",".svg":"image/svg+xml"})[extname(full)]||"application/octet-stream");
  res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});

async function fixture(viewport){
  const page=await browser.newPage({viewport});page.setDefaultTimeout(7000);
  await page.addInitScript(()=>localStorage.setItem("pickleup-theme-v2","light"));
  await page.route("**/assets/api.js*",route=>route.fulfill({contentType:"application/javascript",body:`
    const data={tournaments:[],divisions:[],courts:[],clubs:[{id:"club",name:"CLB Bình Lợi",active:true}],players:[],teams:[],teamPlayers:{},matches:[],audit:[],referees:[],registrations:[],payments:[],sponsors:[],posts:[],bookings:[],clubEvents:[],clubTransactions:[]};
    window.__avatarFixture={data,calls:{create:0,upload:0},failAvatarOnce:false};
    window.PickleAPI={
      me:async()=>({user:{id:"admin",name:"Admin test",role:"super_admin"}}),adminState:async()=>structuredClone(data),
      clubs:async()=>structuredClone(data.clubs),players:async()=>structuredClone(data.players),reportOverview:async()=>({}),clubEvents:async()=>[],
      createPlayer:async payload=>{window.__avatarFixture.calls.create++;const player={id:"player-"+window.__avatarFixture.calls.create,full_name:payload.fullName,nickname:payload.nickname||"",gender:payload.gender||"other",club_id:payload.clubId||null,club_name:"Tự do",skill_level:payload.skillLevel,rating:payload.rating,phone:payload.phone||"",active:true,avatar_url:""};data.players.push(player);return structuredClone(player)},
      uploadPlayerAvatar:async(id,file)=>{window.__avatarFixture.calls.upload++;if(window.__avatarFixture.failAvatarOnce){window.__avatarFixture.failAvatarOnce=false;throw new Error("UPLOAD_TEMPORARY")};const player=data.players.find(item=>item.id===id);player.avatar_url="/api/media/avatars/test.png";return {avatarUrl:player.avatar_url}}
    };
  `}));
  await page.goto(base+"/admin.html");
  await page.waitForFunction(()=>document.querySelector("#content"));
  await page.evaluate(()=>switchAdminPage("players"));
  await page.locator('[data-action="newPlayer"]').waitFor();
  return page;
}

const tinyPng={name:"avatar.png",mimeType:"image/png",buffer:Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082","hex")};
try{
  const page=await fixture({width:1280,height:900});
  await page.locator('[data-action="newPlayer"]').click();
  await page.locator("#pName").fill("Nguyễn Minh Anh");
  assert.equal(await page.locator(".player-avatar-create-initials").textContent(),"NA");
  const preview=await page.locator(".player-avatar-create-preview").boundingBox();
  assert.equal(Math.round(preview.width),76);assert.equal(Math.round(preview.height),76);
  const input=page.locator('.player-avatar-create input[type="file"]');
  await input.setInputFiles({name:"avatar.gif",mimeType:"image/gif",buffer:Buffer.from("gif")});
  await page.getByText("Chỉ nhận ảnh JPG, PNG hoặc WebP.").waitFor();
  await input.setInputFiles({name:"large.png",mimeType:"image/png",buffer:Buffer.alloc(3*1024*1024+1)});
  await page.getByText("Ảnh tối đa 3MB.").waitFor();
  await input.setInputFiles(tinyPng);assert.equal(await page.locator(".player-avatar-create-preview img").isVisible(),true);
  await page.locator(".player-avatar-create-remove").click();assert.equal(await page.locator(".player-avatar-create-initials").isVisible(),true);
  await input.setInputFiles(tinyPng);await page.locator("#savePlayer").click();
  await page.locator("#genericDialog").waitFor({state:"hidden"});
  assert.deepEqual(await page.evaluate(()=>window.__avatarFixture.calls),{create:1,upload:1});

  await page.locator('[data-action="newPlayer"]').click();await page.locator("#pName").fill("Trần Thị B");await input.setInputFiles(tinyPng);
  await page.evaluate(()=>{window.__avatarFixture.failAvatarOnce=true});await page.locator("#savePlayer").click();
  await page.getByRole("button",{name:"Thử tải ảnh lại"}).waitFor();
  assert.equal(await page.locator("#finishPlayerWithoutAvatar").isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>window.__avatarFixture.calls),{create:2,upload:2});
  await page.getByRole("button",{name:"Thử tải ảnh lại"}).click();await page.locator("#genericDialog").waitFor({state:"hidden"});
  assert.deepEqual(await page.evaluate(()=>window.__avatarFixture.calls),{create:2,upload:3});
  assert.equal(await page.evaluate(()=>window.__avatarFixture.data.players.length),2);

  await page.locator('[data-action="newPlayer"]').click();await page.locator("#pName").fill("Lê Không Ảnh");await input.setInputFiles(tinyPng);
  await page.evaluate(()=>{window.__avatarFixture.failAvatarOnce=true});await page.locator("#savePlayer").click();
  await page.locator("#finishPlayerWithoutAvatar").click();await page.locator("#genericDialog").waitFor({state:"hidden"});
  assert.deepEqual(await page.evaluate(()=>window.__avatarFixture.calls),{create:3,upload:4});
  assert.equal(await page.evaluate(()=>window.__avatarFixture.data.players.length),3);
  await page.close();

  const mobile=await fixture({width:375,height:812});
  await mobile.locator('[data-action="newPlayer"]').click();
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
  for(const selector of [".player-avatar-create-pick","#savePlayer"]){const box=await mobile.locator(selector).boundingBox();assert.ok(box.height>=44,`${selector} is a touch target`)}
  assert.equal(await mobile.locator("html").getAttribute("data-theme"),"light");
  await mobile.close();
  console.log("PLAYER_AVATAR_UI_OK");
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
