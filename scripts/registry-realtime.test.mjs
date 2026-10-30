import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
const source=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
function apiContext(existingIo){
  const sockets=[],timers=[],window=existingIo?{io:existingIo}:{};
  const context={window,location:{origin:"https://test.invalid",pathname:"/"},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},WebSocket:class{constructor(url){this.url=url;sockets.push(this)}close(){}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},console,fetch:async()=>({ok:true,json:async()=>({})})};
  vm.runInNewContext(source("assets/api.js"),context);return {window,sockets,timers};
}
test("same-origin Cloudflare installs reconnecting realtime adapter without replacing Node Socket.IO",()=>{
  const f=apiContext();assert.equal(typeof f.window.io,"function");
  const io=f.window.io(),hints=[];assert.equal(io.on("public:state",x=>hints.push(x)),io);
  assert.equal(f.sockets[0].url,"wss://test.invalid/api/realtime?room=public");
  f.sockets[0].onopen();assert.equal(hints.length,1);
  f.sockets[0].onclose();f.timers.at(-1)();f.sockets.at(-1).onopen();assert.equal(hints.length,2);
  const existing=()=>{};assert.equal(apiContext(existing).window.io,existing);
});
test("homepage refetches invalidation hints without replacing its state with a partial payload",async()=>{
  const listeners={},calls=[];const state={tournaments:[],divisions:[],teams:[],matches:[],audit:[]};
  const context={console,location:{pathname:"/"},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}}},window:{io:()=>({on:(e,fn)=>{listeners[e]=fn}})},io:()=>({on:(e,fn)=>{listeners[e]=fn}}),PickleAPI:{publicState:async()=>{calls.push(1);return state},publicPlayers:async()=>[],publicPosts:async()=>[],publicSponsors:async()=>[],publicBranding:async()=>({})}};
  vm.runInNewContext(source("assets/public.js"),context);await new Promise(r=>setImmediate(r));
  listeners["public:state"]({tournamentId:"own"});await new Promise(r=>setImmediate(r));
  assert.equal(calls.length,2);assert.ok(vm.runInNewContext("Array.isArray(state.matches)",context));
  listeners["public:state"]({...state,matches:[{id:"new"}]});await new Promise(r=>setImmediate(r));
  assert.equal(vm.runInNewContext("state.matches[0].id",context),"new");
});
test("PWA updates wait for user acceptance and never cache authentication or scores",async()=>{
  const handlers={},calls={skip:0},deleted=[],precache=[];
  const context={self:{location:{origin:"https://test.invalid"},addEventListener:(e,fn)=>handlers[e]=fn,skipWaiting:()=>calls.skip++,clients:{claim:async()=>{}}},caches:{open:async()=>({add:async url=>precache.push(url)}),keys:async()=>["other-app","pickleup-old"],delete:async k=>deleted.push(k)},URL,Promise};
  vm.runInNewContext(source("service-worker.js"),context);
  let wait;handlers.install({waitUntil:p=>wait=p});await wait;assert.equal(calls.skip,0);
  for(const [page,names] of [["admin.html",["styles.css","admin-app.js","bracket-ui.js","admin-crud.js","timeout-clock.js","timeout-clock.css","team-lineup.js","team-lineup.css"]],["court-board.html",["court-board.css","court-board.js","team-lineup.js"]],["referee.html",["referee-arena.css","referee-courtside.js","timeout-clock.js","timeout-clock.css","team-lineup.js","team-lineup.css"]]]){
    const urls=[...source(page).matchAll(/(?:src|href)="([^"]+)"/g)].map(match=>match[1].replace(/^\//,''));
    for(const name of names){
      const url=urls.find(value=>value.startsWith('assets/'+name+'?'));
      assert.ok(url,`missing versioned ${name} in ${page}`);
      assert.ok(precache.includes('/'+url),`missing exact offline asset ${url}`);
    }
  }
  const liveMatchJs=[...source("match.html").matchAll(/src="([^"]+)"/g)].map(m=>m[1]).find(v=>v.startsWith("assets/match-live.js?v="));
  assert.ok(liveMatchJs,"spectator screen must load a versioned live match script");
  assert.ok(precache.includes("/"+liveMatchJs),"spectator script URL must match PWA precache after changes");
  handlers.activate({waitUntil:p=>wait=p});await wait;assert.ok(!deleted.includes("other-app"));
  for(const url of ["/api/auth/session","/api/public/state","/socket.io/socket.io.js","/uploads/receipts/a.pdf"]){let cached=false;handlers.fetch({request:{method:"GET",url:"https://test.invalid"+url},respondWith:()=>cached=true});assert.equal(cached,false)}
  handlers.message({data:{type:"SKIP_WAITING"}});assert.equal(calls.skip,1);
});
test("overlapping public invalidations queue another fetch so the latest score is retained",async()=>{
  const listeners={},pending=[];
  const next=n=>({tournaments:[],divisions:[],teams:[],matches:[{id:"m",status:"wait",current:[n,0]}],audit:[]});
  const context={console,location:{pathname:"/"},document:{querySelector:()=>null,querySelectorAll:()=>[],documentElement:{style:{setProperty(){}}}},window:{io:()=>({on:(e,fn)=>listeners[e]=fn})},io:()=>({on:(e,fn)=>listeners[e]=fn}),PickleAPI:{publicState:()=>new Promise(r=>pending.push(r)),publicPlayers:async()=>[],publicPosts:async()=>[],publicSponsors:async()=>[],publicBranding:async()=>({})}};
  vm.runInNewContext(source("assets/public.js"),context);pending.shift()(next(0));await new Promise(r=>setImmediate(r));
  listeners["public:state"]({tournamentId:"own"});const old=pending.shift();listeners["public:state"]({tournamentId:"own"});
  old(next(1));await new Promise(r=>setImmediate(r));assert.equal(pending.length,1);pending.shift()(next(2));await new Promise(r=>setImmediate(r));
  assert.equal(vm.runInNewContext("state.matches[0].current[0]",context),2);
});

test("live match animates only a confirmed score change and ignores identical socket snapshots",async()=>{
  const listeners={},timers=[],calls=[];
  const match={id:"m<&",version:1,status:"live",a:"a",b:"b",current:[4,3],sets:[],courtId:"c",time:"10:00"};
  const state=()=>({matches:[{...match,current:[...match.current]}],teams:[{id:"a",name:"Alpha"},{id:"b",name:"Beta"}],divisions:[{id:"d",tournamentId:"t"}],tournaments:[{id:"t",name:"Open"}],courts:[{id:"c",name:"Court 1"}]});
  const nodes=new Map(),node=()=>({hidden:false,textContent:"",innerHTML:"",className:"",href:"",dataset:{},classList:{add(){},remove(){}}});
  const document={title:"",querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}};
  const context={console,URLSearchParams,location:{search:"?id=m%3C%26"},document,window:{PickleAPI:{publicState:async()=>state()},io:()=>({on:(name,fn)=>listeners[name]=fn}),PickleMotion:{scoreChange:(...args)=>calls.push(args)}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},Date,Number,Boolean,String};
  vm.runInNewContext(source("assets/match-live.js"),context);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,0,"initial state is static");
  const update=async()=>{listeners["match:update"]({id:match.id});await timers.at(-1)();await new Promise(resolve=>setImmediate(resolve))};
  await update();
  assert.equal(calls.length,0,"same persisted match version does not replay");
  match.current[0]=5;match.version++;await update();
  assert.equal(calls.length,1,"one changed score produces one score motion");
  assert.equal(calls[0][0],nodes.get("#matchScoreA"),"only the changed side is animated");
  assert.equal(nodes.get("#matchScoreA").textContent,"5","confirmed score remains final text");
  assert.equal(nodes.get("#matchScoreA").dataset.motionKey,"match:m<&:score:A","score motion key keeps the real match ID");
});
test("live match derives a stable persisted signature when the response has no version",async()=>{
  const listeners={},timers=[],calls=[];
  const match={id:"legacy",status:"live",a:"a",b:"b",current:[7,6],sets:[[11,9]],courtId:"c",time:"10:30"};
  const state=()=>({matches:[{...match,current:[...match.current],sets:match.sets.map(set=>[...set])}],teams:[],divisions:[],tournaments:[],courts:[]});
  const nodes=new Map(),node=()=>({hidden:false,textContent:"",innerHTML:"",className:"",href:"",dataset:{},classList:{add(){},remove(){}}});
  const document={title:"",querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)}};
  const context={console,URLSearchParams,location:{search:"?id=legacy"},document,window:{PickleAPI:{publicState:async()=>state()},io:()=>({on:(name,fn)=>listeners[name]=fn}),PickleMotion:{scoreChange:(...args)=>calls.push(args)}},setTimeout:fn=>{timers.push(fn);return timers.length},clearTimeout(){},Date,Number,Boolean,String};
  vm.runInNewContext(source("assets/match-live.js"),context);await new Promise(resolve=>setImmediate(resolve));
  match.current[1]=7;listeners["match:update"]({id:"legacy"});await timers.at(-1)();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1,"persisted scores provide a change signature without a version field");
  assert.equal(calls[0][0],nodes.get("#matchScoreB"));
  assert.equal(nodes.get("#matchScoreB").textContent,"7");
  listeners["match:update"]({id:"legacy"});await timers.at(-1)();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.length,1,"identical unversioned snapshots do not replay");
});

test("spectator live match polls visible tab and refreshes immediately after mobile resume",async()=>{
  const callbacks={},events={},intervals=[],scheduled=[];
  const match={id:"court-1",version:1,status:"live",a:"a",b:"b",current:[4,3],sets:[],divisionId:"division"};
  let fetches=0;
  const live=()=>({matches:[{...match,current:[...match.current]}],teams:[{id:"a",name:"A"},{id:"b",name:"B"}],
    divisions:[{id:"division",tournamentId:"event"}],tournaments:[{id:"event",name:"Giải kiểm thử"}],courts:[]});
  const nodes=new Map(),node=()=>({hidden:false,textContent:"",innerHTML:"",className:"",href:"",dataset:{},classList:{add(){},remove(){}}});
  const document={title:"",visibilityState:"visible",querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)},
    addEventListener(name,fn){events[name]=fn}};
  const context={console,URLSearchParams,location:{search:"?id=court-1"},document,
    window:{PickleAPI:{publicState:async()=>{fetches++;return live()}},io:()=>({on(name,fn){callbacks[name]=fn}})},
    setTimeout:fn=>{scheduled.push(fn);return scheduled.length},clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},
    Date,Number,Boolean,String};
  vm.runInNewContext(source("assets/match-live.js"),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  await tick();
  assert.equal(fetches,1);
  assert.equal(nodes.get("#matchScoreA").textContent,"4");
  assert.match(nodes.get("#matchConnection").textContent,/Tự cập nhật/,"no WebSocket confirmation is not labelled realtime");
  assert.equal(intervals.length,1);
  assert.equal(intervals[0].ms,15000);
  callbacks.connect();assert.match(nodes.get("#matchConnection").textContent,/Trực tiếp/);
  callbacks.disconnect();assert.match(nodes.get("#matchConnection").textContent,/Tự cập nhật/);
  match.current[0]=5;match.version++;
  intervals[0].fn();await tick();
  assert.equal(fetches,2);
  assert.equal(nodes.get("#matchScoreA").textContent,"5","score updates without any socket message");
  document.visibilityState="hidden";intervals[0].fn();await tick();
  assert.equal(fetches,2,"background polling is suspended");
  match.current[1]=6;match.version++;
  document.visibilityState="visible";events.visibilitychange();await tick();
  assert.equal(fetches,3);
  assert.equal(nodes.get("#matchScoreB").textContent,"6","resume immediately fetches current score");
  const before=scheduled.length;
  callbacks["match:update"]({id:"another-match"});
  assert.equal(scheduled.length,before,"unrelated matches do not trigger refresh");
});

test("spectator link missing match ID never polls or starts a socket",async()=>{
  let polls=0,starts=0;
  const intervals=[],nodes=new Map(),node=()=>({hidden:false,textContent:"",className:"",dataset:{},classList:{add(){},remove(){}}});
  const context={console,URLSearchParams,location:{search:""},document:{querySelector(selector){
    if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector)
  }},window:{PickleAPI:{publicState:async()=>{polls++;return {}}},io:()=>{starts++;return {on(){}}}},
    setTimeout(){},clearTimeout(){},setInterval:fn=>intervals.push(fn)};
  vm.runInNewContext(source("assets/match-live.js"),context);
  assert.equal(polls,0);assert.equal(starts,0);assert.equal(intervals.length,0);
  assert.equal(nodes.get("#matchNotFound strong").textContent,"Thiếu mã trận");
});

test("court TV board refreshes without socket hints, pauses while hidden, and resumes with current scores",async()=>{
  const listeners={},events={},intervals=[],timers=[],nodes=new Map();
  const mockNode=()=>({
    textContent:"",innerHTML:"",hidden:false,dataset:{},options:[],
    classList:{toggle(){},add(){},remove(){}},
    querySelectorAll(){return []},getBoundingClientRect(){return {x:0,y:0,width:0,height:0}}
  });
  const document={visibilityState:"visible",querySelector(sel){
    if(!nodes.has(sel))nodes.set(sel,mockNode());return nodes.get(sel)
  },addEventListener(name,handler){events[name]=handler}};
  const match={id:"tv-match",divisionId:"division",courtId:"court",a:"a",b:"b",
    status:"live",current:[4,3],scheduledAt:"2026-10-30T10:00:00Z",version:1};
  let reads=0,fail=false;
  const snapshot=()=>({
    tournaments:[{id:"tour",name:"Giải thử nghiệm",publicVisible:true}],
    divisions:[{id:"division",name:"Đôi",tournamentId:"tour"}],
    courts:[{id:"court",tournamentId:"tour",name:"Sân 1"}],
    teams:[{id:"a",name:"Đội A"},{id:"b",name:"Đội B"}],
    matches:[{...match,current:[...match.current]}]
  });
  const context={console,document,URL,URLSearchParams,Date,
    location:{search:"",href:"https://test.invalid/court-board.html"},
    localStorage:{getItem:()=>null,setItem(){}},history:{replaceState(){}},
    window:{PickleAPI:{optionalAdminState:async()=>null,publicState:async()=>{
      reads++;if(fail)throw Error("NETWORK_OFFLINE");return snapshot()
    }},io:()=>({on(name,handler){listeners[name]=handler}})},
    setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length},
    setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length},clearTimeout(){}};
  vm.runInNewContext(source("assets/court-board.js"),context);
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  await tick();
  assert.equal(reads,1,"initial public state is fetched");
  assert.match(nodes.get("#courtGrid").innerHTML,/tv-score/,"live court shows a scoreboard");
  assert.match(nodes.get("#courtGrid").innerHTML,/>4</,"initial score shown");
  assert.match(nodes.get("#boardConnection").textContent,/Tự cập nhật 15 giây/,"HTTP success alone is not realtime");
  const poll=intervals.find(item=>item.ms===15000);
  assert.ok(poll,"TV board has a 15-second fallback poll");
  listeners.connect();
  assert.match(nodes.get("#boardConnection").textContent,/Trực tiếp/);
  listeners.disconnect();
  assert.match(nodes.get("#boardConnection").textContent,/Tự cập nhật/,"socket loss keeps HTTP fallback active");
  match.current[0]=5;match.version++;
  poll.fn();await tick();
  assert.equal(reads,2);
  assert.match(nodes.get("#courtGrid").innerHTML,/>5</,"scoreboard updates without socket messages");
  document.visibilityState="hidden";poll.fn();await tick();
  assert.equal(reads,2,"poll stops while display is hidden");
  match.current[1]=6;match.version++;
  document.visibilityState="visible";events.visibilitychange();await tick();
  assert.equal(reads,3);
  assert.match(nodes.get("#courtGrid").innerHTML,/>6</,"display resumes with current score");
  fail=true;poll.fn();await tick();
  assert.match(nodes.get("#boardConnection").textContent,/Mất kết nối/,"failed HTTP fallback must not say realtime");
  assert.match(nodes.get("#courtGrid").innerHTML,/>6</,"keep last confirmed data during network loss");
  fail=false;poll.fn();await tick();
  assert.match(nodes.get("#boardConnection").textContent,/Tự cập nhật/,"connection recovers through HTTP polling");
  assert.equal(reads,5);
});
