import assert from "node:assert/strict";
import {test,before,after} from "node:test";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
const root=resolve(".");
let browser,server,base;
const data={
 tournaments:[{id:"t",name:"Giải PickleUp",venue:"Bình Thạnh"}],
 divisions:[{id:"d",tournamentId:"t",name:"Đôi tự do"}],
 courts:[{id:"c",tournamentId:"t",name:"Sân 1",active:true}],
 teams:[{id:"a",name:"Đội A"},{id:"b",name:"Đội B"}],
 matches:[{id:"m1",divisionId:"d",courtId:"c",status:"live",a:"a",b:"b",version:1},
 {id:"m2",divisionId:"d",courtId:null,status:"wait",a:"a",b:"b",version:1}]
};
before(async()=>{
 server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,"http://localhost").pathname;
   const file=resolve(root,"."+path);
   if(!file.startsWith(root+"/")){res.writeHead(403).end();return}
   res.setHeader("Content-Type",({".html":"text/html",".js":"text/javascript",".mjs":"text/javascript",".css":"text/css"})[extname(file)]||"application/octet-stream");
   res.end(await readFile(file));
  }catch{res.writeHead(404).end()}
 });
 await new Promise(done=>server.listen(0,"127.0.0.1",done));
 base="http://127.0.0.1:"+server.address().port;
 browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();await new Promise(done=>server.close(done))});
async function makePage(organizer,fixture=data,width=390){
 const context=await browser.newContext({viewport:{width,height:844}});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(({data,organizer})=>{
   window.__fixture=data;window.__organizer=organizer;window.__scheduled=[];
   window.__assignments=[];window.__assignError=null;window.__confirmResult=true;
   window.confirm=()=>window.__confirmResult;
 },{data:fixture,organizer});
 await page.route("**/assets/api.js*",route=>route.fulfill({contentType:"text/javascript",body:`
window.PickleAPI={
 optionalAdminState:async()=>window.__organizer?window.__fixture:null,
 publicState:async()=>window.__fixture,
 session:async()=>({user:{role:window.__organizer?"organizer":"player"}}),
 autoScheduleCourts:async id=>{window.__scheduled.push(id);return {updated:1,courts:1}},
 assignMatch:async(id,payload)=>{
   window.__assignments.push({id,payload});
   if(window.__assignError)throw Object.assign(new Error(window.__assignError),{status:409});
   const m=window.__fixture.matches.find(x=>x.id===id);
   m.courtId=payload.courtId;m.scheduledAt=payload.scheduledAt;m.version++;
   return {ok:true};
 }
};`}));
 await page.goto(base+"/court-timeline.html?tournament=t");
 await page.locator("#timelineStatus").getByText("Đã kết nối").waitFor({timeout:10000});
 return {page,context,errors};
}
test("public timeline shows courts and waitlist but never organizer actions",async()=>{
 const {page,context,errors}=await makePage(false);
 try{
   assert.equal(await page.locator("#timelineLive").textContent(),"1");
   assert.equal(await page.locator("#timelineUnplacedCount").textContent(),"1");
   assert.equal(await page.locator("#courtTimeline .match").count(),1);
   assert.equal(await page.locator("#unplacedMatches .match").count(),1);
   assert.equal(await page.locator("#autoScheduleActions button").count(),0);
   assert.equal(await page.locator("[data-assign-match]").count(),0,"public spectators cannot write match assignments");
   await page.locator('[data-view="live"]').click();
   assert.equal(await page.locator("#courtTimeline .match").count(),1);
   assert.equal(await page.locator("#unplacedMatches .match").count(),0);
   assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
test("organizer can confirm scheduling existing division through authenticated API",async()=>{
 const {page,context,errors}=await makePage(true);
 try{
   const action=page.locator('button[data-schedule-division="d"]');
   await action.waitFor({state:"visible"});
   await action.click();
   await page.waitForFunction(()=>window.__scheduled.includes("d"));
   assert.deepEqual(await page.evaluate(()=>window.__scheduled),["d"]);
   assert.equal(await page.locator("#timelineStatus").textContent(),"● Đã kết nối");
   assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("snake_case court_state live stays visible and correctly labeled in both filters",async()=>{
 const fixture=structuredClone(data);
 fixture.matches=[
  {id:"snake-live",divisionId:"d",courtId:"c",status:"wait",court_state:"live",a:"a",b:"b",version:1},
  {id:"waiting",divisionId:"d",courtId:null,status:"wait",court_state:"scheduled",a:"a",b:"b",version:1}
 ];
 const {page,context,errors}=await makePage(false,fixture);
 try{
  assert.equal(await page.locator("#timelineLive").textContent(),"1");
  await page.locator('[data-view="live"]').click();
  assert.equal(await page.locator("#courtTimeline .match.is-live").count(),1);
  assert.equal(await page.locator("#courtTimeline .match-status").textContent(),"ĐANG ĐẤU");
  assert.equal(await page.locator("#unplacedMatches .match").count(),0);
  await page.locator('[data-view="pending"]').click();
  assert.equal(await page.locator("#courtTimeline .match").count(),0);
  assert.equal(await page.locator("#unplacedMatches .match").count(),1);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
test("removed tournament immediately clears old organizer auto-schedule buttons",async()=>{
 const {page,context,errors}=await makePage(true);
 try{
  await page.locator('button[data-schedule-division="d"]').waitFor({state:"visible"});
  await page.evaluate(()=>{window.__fixture.tournaments=[]});
  await page.locator("#timelineReload").click();
  await page.locator("#tournamentTitle").getByText("Không tìm thấy giải đấu").waitFor();
  assert.equal(await page.locator("#autoScheduleActions button").count(),0);
  assert.equal(await page.locator("#autoScheduleActions").isHidden(),true);
  assert.deepEqual(await page.evaluate(()=>window.__scheduled),[]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("organizer confirms a six-court queue assignment only once, with explicit HCMC time and version",async()=>{
 const fixture=structuredClone(data);
 fixture.courts=[1,2,3,4,5,6].map(i=>({id:"c"+i,tournamentId:"t",name:"Sân "+i,active:true}));
 const {page,context,errors}=await makePage(true,fixture,390);
 try{
  await page.locator('[data-assign-match="m2"]').click();
  await page.locator("#assignCourt").selectOption("c6");
  await page.locator("#assignTime").fill("2030-01-01T09:00");
  // Dismissing either control or the explicit confirmation must never write.
  await page.locator("#assignCancel").click();
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  await page.locator('[data-assign-match="m2"]').click();
  await page.locator("#assignCourt").selectOption("c6");
  await page.locator("#assignTime").fill("2030-01-01T09:00");
  await page.evaluate(()=>window.__confirmResult=false);
  await page.locator("#assignSave").click();
  assert.equal(await page.locator("#assignDialog").isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  await page.evaluate(()=>window.__confirmResult=true);
  await page.locator("#assignSave").click();
  await page.locator("#assignDialog").waitFor({state:"hidden"});
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[{
    id:"m2",payload:{courtId:"c6",scheduledAt:"2030-01-01T02:00:00.000Z",expectedVersion:1}
  }],"the stored instant is 09:00 Vietnam time even if runner browser is in another timezone");
  assert.equal(await page.locator("#timelineUnplacedCount").textContent(),"0");
  assert.equal(await page.locator("#courtTimeline .court-column").count(),6);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("manual assignment reports server 409 without falsely moving the match or closing dialog",async()=>{
 const fixture=structuredClone(data);
 const {page,context,errors}=await makePage(true,fixture,1280);
 try{
  await page.locator('[data-assign-match="m2"]').click();
  await page.locator("#assignTime").fill("2030-01-01T09:00");
  await page.evaluate(()=>window.__assignError="PLAYER_SCHEDULE_CONFLICT");
  await page.locator("#assignSave").click();
  await page.locator("#assignFeedback").getByText(/VĐV trùng lịch/).waitFor();
  assert.equal(await page.locator("#assignDialog").isVisible(),true);
  assert.equal(await page.locator("#timelineUnplacedCount").textContent(),"1");
  assert.equal(await page.locator("#assignSave").isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>window.__assignments.map(x=>x.payload.expectedVersion)),[1]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("manual assignment rejects stale timeline data before writing and public access stays read-only",async()=>{
 const fixture=structuredClone(data);
 const {page,context,errors}=await makePage(true,fixture);
 try{
  await page.locator('[data-assign-match="m2"]').click();
  await page.locator("#assignTime").fill("2030-01-01T09:00");
  await page.evaluate(()=>{window.__fixture.matches[1].version=2});
  await page.locator("#timelineReload").click();
  await page.locator("#assignSave").click();
  await page.locator("#assignFeedback").getByText(/Lịch đã thay đổi/).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
