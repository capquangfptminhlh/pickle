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
   assert.equal(await page.locator(".match[draggable=true]").count(),0,"public matches are not draggable");
   assert.equal(await page.locator("[data-drop-court]").count(),0,"public court columns are not drop targets");
   assert.equal(await page.locator("#dragHelp").isHidden(),true);
   assert.equal(await page.locator("#courtTimeline .match[data-assign-match]").count(),0);
   assert.equal(await page.locator("#courtTimeline .assign-match").count(),0);
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
 fixture.matches[0].courtId="c1"; // The live match must use a court in the six-court fixture.
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
  await page.waitForFunction(()=>document.querySelector("#timelineUnplacedCount")?.textContent==="0");
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
  // Simulate another BTC writing before confirmation; background reload is inert under a modal.
  await page.evaluate(()=>{window.__fixture.matches[1].version=2});
  await page.locator("#assignSave").click();
  await page.locator("#assignFeedback").getByText(/Lịch đã thay đổi/).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("organizer drags an unplaced match to one of six courts, confirms separately, and persists only once",async()=>{
 const fixture=structuredClone(data);
 fixture.courts=[1,2,3,4,5,6].map(i=>({id:"c"+i,tournamentId:"t",name:"Sân "+i,active:true}));
 fixture.matches[0].courtId="c1";
 const {page,context,errors}=await makePage(true,fixture,1440);
 try{
  const source=page.locator('#unplacedMatches .match[data-drag-match="m2"]');
  const target=page.locator('#courtTimeline .court-column[data-drop-court="c6"]');
  assert.equal(await source.count(),1);
  assert.equal(await target.count(),1);
  assert.equal(await page.locator("#dragHelp").isVisible(),true);
  await source.dragTo(target);
  await page.locator("#assignDialog").waitFor({state:"visible"});
  assert.equal(await page.locator("#assignCourt").inputValue(),"c6","dropping on court 6 preselects court 6");
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[],"drag only opens the dialog");
  await page.locator("#assignCancel").click();
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[],"cancel never writes");
  assert.equal(await page.locator("#timelineUnplacedCount").textContent(),"1");
  await source.dragTo(target);
  await page.locator("#assignDialog").waitFor({state:"visible"});
  await page.locator("#assignTime").fill("2030-01-01T12:30");
  await page.locator("#assignSave").click();
  await page.locator("#assignDialog").waitFor({state:"hidden"});
  await page.waitForFunction(()=>document.querySelector("#timelineUnplacedCount")?.textContent==="0");
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[{
   id:"m2",payload:{courtId:"c6",scheduledAt:"2030-01-01T05:30:00.000Z",expectedVersion:1}
  }]);
  assert.equal(await page.locator('#courtTimeline .court-column[data-drop-court="c6"] .match[data-match-id="m2"]').count(),1);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("drag onto occupied court only stages an assignment; server 409 leaves it in the queue",async()=>{
 const fixture=structuredClone(data);
 const {page,context,errors}=await makePage(true,fixture,1280);
 try{
  await page.locator('#unplacedMatches .match[data-drag-match="m2"]').dragTo(
    page.locator('#courtTimeline .court-column[data-drop-court="c"]'));
  await page.locator("#assignDialog").waitFor({state:"visible"});
  assert.equal(await page.locator("#assignCourt").inputValue(),"c");
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  await page.locator("#assignTime").fill("2030-01-01T09:00");
  await page.evaluate(()=>window.__assignError="COURT_SCHEDULE_CONFLICT");
  await page.locator("#assignSave").click();
  await page.locator("#assignFeedback").getByText(/Sân đã có trận trùng giờ/).waitFor();
  assert.equal(await page.locator("#assignDialog").isVisible(),true);
  assert.equal(await page.locator("#timelineUnplacedCount").textContent(),"1");
  assert.equal(await page.locator("#assignSave").isEnabled(),true);
  assert.deepEqual(await page.evaluate(()=>window.__assignments.map(x=>x.payload.expectedVersion)),[1]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});


test("organizer can drag an already scheduled match between courts, with explicit approval and original version",async()=>{
 const fixture=structuredClone(data);
 fixture.courts=[1,2,3,4,5,6].map(i=>({id:"c"+i,tournamentId:"t",name:"Sân "+i,active:true}));
 fixture.matches[0].courtId="c1";
 fixture.matches.push({
  id:"scheduled-move",divisionId:"d",courtId:"c2",status:"wait",courtState:"scheduled",
  a:"a",b:"b",version:5,scheduledAt:"2030-01-01T02:00:00.000Z",hasHistory:false
 });
 const {page,context,errors}=await makePage(true,fixture,1440);
 try{
  const source=page.locator('#courtTimeline .court-column[data-drop-court="c2"] .match[data-drag-match="scheduled-move"]');
  const target=page.locator('#courtTimeline .court-column[data-drop-court="c4"]');
  assert.equal(await source.count(),1);
  await source.dragTo(target);
  await page.locator("#assignDialog").waitFor({state:"visible"});
  assert.equal(await page.locator("#assignCourt").inputValue(),"c4");
  assert.equal(await page.locator("#assignTime").inputValue(),"2030-01-01T09:00");
  assert.match(await page.locator("#assignTitle").textContent(),/Đổi sân/);
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[],"drop must not write");
  await page.locator("#assignCancel").click();
  assert.equal(await source.count(),1,"cancel keeps match on original court");
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  await source.dragTo(target);
  await page.locator("#assignSave").click();
  await page.locator("#assignDialog").waitFor({state:"hidden"});
  await page.locator('#courtTimeline .court-column[data-drop-court="c4"] .match[data-match-id="scheduled-move"]').waitFor();
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[{
   id:"scheduled-move",payload:{courtId:"c4",scheduledAt:"2030-01-01T02:00:00.000Z",expectedVersion:5}
  }],"only one audit-worthy API change should be submitted");
  assert.equal(await page.locator('#courtTimeline .court-column[data-drop-court="c2"] [data-match-id="scheduled-move"]').count(),0);
  assert.equal(await page.locator("#timelineUnplacedCount").textContent(),"1","existing unplaced queue remains untouched");
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("scheduled court move can be made via the accessible button without dragging on mobile",async()=>{
 const fixture=structuredClone(data);
 fixture.courts=[{id:"c1",tournamentId:"t",name:"Sân 1",active:true},{id:"c2",tournamentId:"t",name:"Sân 2",active:true}];
 fixture.matches[0].courtId="c1";
 fixture.matches.push({
  id:"mobile-move",divisionId:"d",courtId:"c2",status:"wait",courtState:"scheduled",
  a:"a",b:"b",version:3,scheduledAt:"2030-01-01T02:00:00.000Z",hasHistory:false
 });
 const {page,context,errors}=await makePage(true,fixture,390);
 try{
  const button=page.locator('#courtTimeline .match[data-match-id="mobile-move"] button[data-assign-match="mobile-move"]');
  assert.equal(await button.textContent(),"Đổi sân / giờ");
  await button.click();
  await page.locator("#assignDialog").waitFor({state:"visible"});
  assert.equal(await page.locator("#assignCourt").inputValue(),"c2","current court stays selected by default");
  await page.locator("#assignCourt").selectOption("c1");
  await page.locator("#assignCancel").click();
  assert.deepEqual(await page.evaluate(()=>window.__assignments),[]);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("court moves are unavailable for live, warmup, scored or completed matches",async()=>{
 const fixture=structuredClone(data);
 fixture.courts=[1,2,3,4,5,6].map(i=>({id:"c"+i,tournamentId:"t",name:"Sân "+i,active:true}));
 fixture.matches=[
  {id:"live",divisionId:"d",courtId:"c1",status:"live",courtState:"live",a:"a",b:"b",version:2},
  {id:"warmup",divisionId:"d",courtId:"c2",status:"wait",courtState:"warming_up",a:"a",b:"b",version:2},
  {id:"scored",divisionId:"d",courtId:"c3",status:"wait",courtState:"scheduled",hasHistory:true,a:"a",b:"b",version:2},
  {id:"completed",divisionId:"d",courtId:"c4",status:"done",courtState:"done",a:"a",b:"b",version:2},
  {id:"safe",divisionId:"d",courtId:"c5",status:"wait",courtState:"scheduled",a:"a",b:"b",version:2}
 ];
 const {page,context,errors}=await makePage(true,fixture,1280);
 try{
  for(const id of ["live","warmup","scored","completed"]){
   assert.equal(await page.locator('[data-drag-match="'+id+'"]').count(),0,id+" cannot be dragged");
   assert.equal(await page.locator('button[data-assign-match="'+id+'"]').count(),0,id+" cannot be manually moved");
  }
  assert.equal(await page.locator('[data-drag-match="safe"]').count(),1);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});

test("reassignment declined by server keeps original court and shows error",async()=>{
 const fixture=structuredClone(data);
 fixture.courts=[{id:"c1",tournamentId:"t",name:"Sân 1",active:true},{id:"c2",tournamentId:"t",name:"Sân 2",active:true}];
 fixture.matches[0].courtId="c1";
 fixture.matches.push({id:"move-conflict",divisionId:"d",courtId:"c2",status:"wait",courtState:"scheduled",
  a:"a",b:"b",version:9,scheduledAt:"2030-01-01T02:00:00.000Z",hasHistory:false});
 const {page,context,errors}=await makePage(true,fixture,1280);
 try{
  const original=page.locator('#courtTimeline .court-column[data-drop-court="c2"] [data-match-id="move-conflict"]');
  await original.dragTo(page.locator('#courtTimeline .court-column[data-drop-court="c1"]'));
  await page.locator("#assignDialog").waitFor({state:"visible"});
  await page.evaluate(()=>window.__assignError="PLAYER_SCHEDULE_CONFLICT");
  await page.locator("#assignSave").click();
  await page.locator("#assignFeedback").getByText(/VĐV trùng lịch/).waitFor();
  assert.equal(await original.count(),1);
  assert.equal(await page.locator('#courtTimeline .court-column[data-drop-court="c1"] [data-match-id="move-conflict"]').count(),0);
  assert.deepEqual(await page.evaluate(()=>window.__assignments.map(x=>x.payload.expectedVersion)),[9]);
  assert.deepEqual(errors,[]);
 }finally{await context.close()}
});
