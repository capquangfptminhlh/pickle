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
  const handlers={},calls={skip:0},deleted=[];
  const context={self:{location:{origin:"https://test.invalid"},addEventListener:(e,fn)=>handlers[e]=fn,skipWaiting:()=>calls.skip++,clients:{claim:async()=>{}}},caches:{open:async()=>({add:async()=>{}}),keys:async()=>["other-app","pickleup-old"],delete:async k=>deleted.push(k)},URL,Promise};
  vm.runInNewContext(source("service-worker.js"),context);
  let wait;handlers.install({waitUntil:p=>wait=p});await wait;assert.equal(calls.skip,0);
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
