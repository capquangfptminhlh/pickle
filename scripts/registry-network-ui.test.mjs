import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {scoringFixture} from '../cloudflare/tests/helpers/scoring-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
let server,browser,base;
before(async()=>{
 server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
  const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
 }catch{res.writeHead(404).end()}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch();
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r))});

async function harness(path){
 const f=await scoringFixture();f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'; INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Sân 1'); UPDATE matches SET court_id='court',status='live',current_score_a=1,version=2 WHERE id='match'");
 const context=await browser.newContext({viewport:{width:375,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[],posts=[];
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(4000);
 await page.addInitScript(token=>{
  localStorage.setItem('pickle-api-token-v1',token);window.__socketListeners={};window.io=()=>({on:(event,fn)=>{window.__socketListeners[event]=fn}});
  window.__stateReads=0;const originalFetch=window.fetch.bind(window);
  window.fetch=async(...args)=>{const response=await originalFetch(...args);if(new URL(String(args[0]),location.href).pathname.endsWith('/state')){const json=response.json.bind(response);response.json=async()=>{const data=await json();window.__stateReads++;return data}}return response};
 },f.tokens.admin);
 let nextHold=null,writeMode=null;
 await page.route('**/api/**',async route=>{
  const r=route.request(),url=new URL(r.url());
  if(r.method()==='POST'){
   posts.push({path:url.pathname,body:r.postDataJSON()});
   if(writeMode==='offline'){writeMode=null;await route.abort('internetdisconnected');return}
  }
  const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
  const saved={status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()};
  if(url.pathname.endsWith('/state')&&nextHold){const hold=nextHold;nextHold=null;hold.captured();await hold.gate}
  if(r.method()==='POST'&&writeMode==='drop-response'){writeMode=null;await route.abort('failed');return}
  await route.fulfill(saved);
 });
 await page.goto(base+path);await page.waitForLoadState('networkidle');
 const holdNextState=()=>{let release,captured;const gate=new Promise(r=>release=r),read=new Promise(r=>captured=r);nextHold={gate,captured};return {read,release}};
 const emit=()=>page.evaluate(()=>window.__socketListeners['match:update']?.({id:'match'}));
 return {...f,page,context,errors,posts,holdNextState,emit,setWriteMode:value=>writeMode=value,close:async()=>{await context.close();f.db.close()}};
}

for(const [name,path,score] of [['referee','/referee.html?match=match','#refScoreA'],['TV board','/court-board.html?tournament=tour','.tv-score b:first-child'],['spectator','/match.html?id=match','#matchScoreA']]){
 test(`${name} retains the newest score when an older state response arrives last`,async()=>{
  const h=await harness(path);try{
   assert.equal(await h.page.locator(score).innerText(),'1');const reads=await h.page.evaluate(()=>window.__stateReads),pending=h.holdNextState();
   if(name==='referee')await h.page.locator('#refreshBtn').click();else await h.emit();await pending.read;
   if(name==='referee')await h.page.locator('[data-correct="A"][data-delta="1"]').click();
   else{assert.equal((await h.api('point',{side:'A',delta:1,expectedVersion:2})).status,200);await h.emit()}
   await h.page.waitForFunction(selector=>document.querySelector(selector)?.textContent==='2',score);
   pending.release();await h.page.waitForFunction(n=>window.__stateReads>=n,reads+2);
   await h.page.evaluate(()=>new Promise(requestAnimationFrame));
   assert.equal(await h.page.locator(score).innerText(),'2');assert.deepEqual(h.errors,[]);
  }finally{await h.close()}
 });
}

test('a lost score response followed by retry never commits the point twice',async()=>{
 const h=await harness('/referee.html?match=match');try{
  h.setWriteMode('drop-response');await h.page.locator('[data-correct="A"][data-delta="1"]').click();
  await h.page.locator('#refToast').filter({hasText:'Không thể thực hiện'}).waitFor();assert.equal(h.match().current_score_a,2);
  await h.page.locator('[data-correct="A"][data-delta="1"]').click();
  await h.page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='2');
  assert.equal(h.match().current_score_a,2);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM score_events').get().n,1);assert.equal(h.posts.length,2);
 }finally{await h.close()}
});

test('offline before commit leaves the score unchanged and reconnect allows one valid point',async()=>{
 const h=await harness('/referee.html?match=match');try{
  h.setWriteMode('offline');await h.page.locator('[data-correct="A"][data-delta="1"]').click();
  await h.page.locator('#refToast').filter({hasText:'Không thể thực hiện'}).waitFor();assert.equal(h.match().current_score_a,1);
  await h.page.locator('[data-correct="A"][data-delta="1"]').click();await h.page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='2');
  assert.equal(h.db.prepare('SELECT COUNT(*) n FROM score_events').get().n,1);
 }finally{await h.close()}
});

test('an account locked while scoring loses write access immediately',async()=>{
 const h=await harness('/referee.html?match=match');try{
  h.db.exec("UPDATE app_users SET active=0 WHERE id='admin'");await h.page.locator('[data-correct="A"][data-delta="1"]').click();
  await h.page.waitForURL(/login\.html/);assert.equal(h.match().current_score_a,1);assert.equal(h.db.prepare('SELECT COUNT(*) n FROM score_events').get().n,0);
 }finally{await h.close()}
});
