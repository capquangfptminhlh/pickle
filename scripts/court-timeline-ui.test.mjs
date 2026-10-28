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
async function makePage(organizer){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const page=await context.newPage(),errors=[];
 page.on("pageerror",e=>errors.push(e.message));
 await page.addInitScript(({data,organizer})=>{
   window.__fixture=data;window.__organizer=organizer;window.__scheduled=[];
   window.confirm=()=>true;
 },{data,organizer});
 await page.route("**/assets/api.js*",route=>route.fulfill({contentType:"text/javascript",body:`
window.PickleAPI={
 optionalAdminState:async()=>window.__organizer?window.__fixture:null,
 publicState:async()=>window.__fixture,
 session:async()=>({user:{role:window.__organizer?"organizer":"player"}}),
 autoScheduleCourts:async id=>{window.__scheduled.push(id);return {updated:1,courts:1}}
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
