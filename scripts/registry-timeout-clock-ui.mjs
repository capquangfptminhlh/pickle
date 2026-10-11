import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {scoringFixture} from '../cloudflare/tests/helpers/scoring-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'ui-artifacts/timeout-clock');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
  const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),base=`http://127.0.0.1:${server.address().port}`;

async function clockHelper(){
  const page=await browser.newPage();
  try{
    await page.clock.install({time:new Date('2030-01-01T00:00:00Z')});await page.clock.pauseAt(new Date('2030-01-01T00:00:01Z'));
    await page.setContent('<section id="clock" class="timeout-clock" hidden><span data-timeout-label></span><strong data-timeout-value role="timer"></strong><small data-timeout-status role="status" aria-live="polite"></small><i data-timeout-progress></i></section>');
    const code=await readFile(resolve(root,'assets/timeout-clock.js'),'utf8').catch(()=>null);
    assert.ok(code,'shared deadline countdown must exist');
    await page.evaluate(()=>{window.clockIntervals=new Set();const set=window.setInterval,clear=window.clearInterval;window.setInterval=(...args)=>{const id=set(...args);clockIntervals.add(id);return id};window.clearInterval=id=>{clockIntervals.delete(id);return clear(id)}});
    await page.addScriptTag({content:code});
    const clock={side:'A',startedAt:'2026-01-01T00:00:00Z',endsAt:'2026-01-01T00:01:00Z',serverNow:'2026-01-01T00:00:00Z'};
    await page.evaluate(clock=>{window.testMatch={timeoutClock:clock};PickleTimeoutClock.attach(document.querySelector('#clock'),testMatch)},clock);
    assert.equal(await page.locator('[data-timeout-value]').innerText(),'01:00','server time anchors a phone with the wrong date');
    await page.clock.runFor(2100);
    assert.equal(await page.locator('[data-timeout-value]').innerText(),'00:58');
    await page.evaluate(()=>{for(let i=0;i<5;i++)PickleTimeoutClock.attach(document.querySelector('#clock'),testMatch)});
    assert.equal(await page.locator('[data-timeout-value]').innerText(),'00:58','unchanged render must not restart countdown');
    assert.equal(await page.evaluate(()=>clockIntervals.size),1,'one active interval per target');
    await page.evaluate(()=>PickleTimeoutClock.detach(document.querySelector('#clock')));
    assert.equal(await page.evaluate(()=>clockIntervals.size),0,'closed surface clears its interval');
    await page.clock.runFor(2000);await page.evaluate(()=>PickleTimeoutClock.attach(document.querySelector('#clock'),testMatch));
    assert.equal(await page.locator('[data-timeout-value]').innerText(),'00:56','reopening keeps elapsed time');
    await page.clock.runFor(57000);
    assert.equal(await page.locator('[data-timeout-value]').innerText(),'00:00');assert.equal(await page.locator('[data-timeout-status]').innerText(),'Hết timeout');
    assert.equal(await page.evaluate(()=>clockIntervals.size),0,'expired timer stops ticking');
    await page.evaluate(()=>PickleTimeoutClock.attach(document.querySelector('#clock'),{timeoutClock:null}));
    assert.equal(await page.locator('#clock').isHidden(),true);
    console.log('PASS timeout helper: skewed device clock, elapsed time, rebind, reopen, expiry, cleanup');
  }finally{await page.close()}
}

async function scoringSurface(kind,width){
  const f=await scoringFixture(),context=await browser.newContext({viewport:{width,height:900},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
  const admin=kind==='admin',clock=page.locator(admin?'#scoreTimeoutClock':'#refTimeoutClock');
  const service=(side,no)=>page.locator(admin?`[data-service-side="${side}"][data-server-number="${no}"]`:`[data-service="${side}"][data-server="${no}"]`);
  const timeout=(side,medical=false)=>page.locator(admin?`[data-timeout-side="${side}"][data-timeout-kind="${medical?'medical':'standard'}"]`:`[data-timeout="${side}"][data-kind="${medical?'medical':'standard'}"]`);
  const refresh=async()=>{
    if(admin)return page.evaluate(()=>refresh({keepDialog:true}));
    await page.evaluate(()=>document.querySelector('#connectionState').textContent='Đang cập nhật');
    await page.locator('#refreshBtn').click();await page.waitForFunction(()=>document.querySelector('#connectionState').textContent==='Đã cập nhật');
  };
  const undo=()=>page.locator(admin?'#undoScore':'#undoBtn').click();
  let failTimeout=false;
  page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(token=>{localStorage.setItem('pickle-api-token-v1',token);localStorage.setItem('pickleup-theme-v2','light')},f.tokens[admin?'admin':'ref']);
  await page.route('**/api/**',async route=>{
    const req=route.request();
    if(failTimeout&&req.url().endsWith('/timeout')){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEST_UNAVAILABLE'})});return}
    const response=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),f.env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  try{
    f.db.exec("UPDATE divisions SET scoring_mode='rally',event_type='team' WHERE id='division'; INSERT INTO players(id,full_name) VALUES ('a1','Nguyễn Minh'),('a2','Trần Thuỳ Anh'),('a3','Vũ An'),('b1','Hoàng Nam'),('b2','Lê Thanh Hà'),('b3','Đặng Mai'); INSERT INTO team_players(team_id,player_id,slot_no) VALUES ('a','a1',1),('a','a2',2),('a','a3',3),('b','b1',1),('b','b2',2),('b','b3',3)");
    await page.goto(base+(admin?'/admin.html':'/referee.html?match=match'));
    const openAdmin=async()=>{await page.evaluate(()=>{page='scores';return refresh()});await page.locator('[data-score-match="match"]').click();await page.locator('#scoreDialog').waitFor()};
    if(admin){await page.locator('#userName').filter({hasText:'Admin'}).waitFor({state:'attached'});await openAdmin()}else await page.locator('#scoreSurface').waitFor();
    for(const eventType of ['doubles','mixed_doubles','team']){
      f.db.prepare("UPDATE divisions SET event_type=? WHERE id='division'").run(eventType);await refresh();
      for(const side of ['A','B']){
        assert.equal(await service(side,2).isEnabled(),true,`${eventType} rally ${side}-S2 is selectable`);
        await service(side,2).click();await page.waitForFunction(({admin,side})=>document.querySelector(admin?`[data-service-side="${side}"][data-server-number="2"]`:`[data-service="${side}"][data-server="2"]`).classList.contains('active'),{admin,side});
        assert.equal(await page.locator(admin?'[data-service-side].active':'[data-service].active').count(),1,'exactly one selected server');
        assert.match(await page.locator(admin?'#serveStatus':'#serveBanner').innerText(),/2/,'selected server number stays visible in rally mode');
        assert.match(await page.locator(admin?'#serveStatus':'#serveBanner').innerText(),side==='A'?/Trần Thuỳ Anh/:/Lê Thanh Hà/,'selected player name comes from persisted roster order');
      }
    }
    f.db.exec("UPDATE divisions SET points_to_win=27,relay_segment_points=9,relay_team_size=3 WHERE id='division'; UPDATE matches SET current_score_a=9 WHERE id='match'");await refresh();
    assert.match(await page.locator(admin?'#serveStatus':'#serveBanner').innerText(),/Người giao 2 · Đặng Mai/,'relay server is indexed in the current BC pair');
    f.db.exec("UPDATE divisions SET points_to_win=11,relay_segment_points=0,relay_team_size=0 WHERE id='division'; UPDATE matches SET current_score_a=0 WHERE id='match'");
    f.db.exec("UPDATE divisions SET event_type='singles' WHERE id='division'");await refresh();assert.equal(await service('A',2).isDisabled(),true);assert.equal(await service('B',2).isDisabled(),true);
    f.db.exec("UPDATE divisions SET event_type='team' WHERE id='division'");await refresh();
    if(process.env.TIMEOUT_UI_PHASE==='service'){assert.deepEqual(errors,[]);console.log('PASS service selection',kind,width);return}
    assert.equal(await clock.isHidden(),true,'no countdown before server timer');
    await timeout('A').click();await clock.waitFor();
    const first=await clock.locator('[data-timeout-value]').innerText(),deadline=f.match().timeout_ends_at;
    assert.ok(deadline,'Worker persists timeout deadline');assert.match(first,/^(01:00|00:59)$/);assert.match(await clock.innerText(),/A/);
    await page.waitForTimeout(1200);assert.notEqual(await clock.locator('[data-timeout-value]').innerText(),first,'countdown updates without network');
    await refresh();assert.equal(f.match().timeout_ends_at,deadline,'refresh cannot restart persisted timer');assert.notEqual(await clock.locator('[data-timeout-value]').innerText(),'01:00');
    await page.reload();if(admin){await page.locator('#userName').filter({hasText:'Admin'}).waitFor({state:'attached'});await openAdmin()}else await page.locator('#scoreSurface').waitFor();
    await clock.waitFor();assert.equal(f.match().timeout_ends_at,deadline);assert.notEqual(await clock.locator('[data-timeout-value]').innerText(),'01:00','reload uses original server deadline');
    await page.evaluate(()=>document.fonts.ready);await clock.screenshot({path:resolve(out,`${kind}-${width}-clock.png`)});
    if(admin){await page.locator('#scoreDialog .icon-btn').click();await page.locator('#scoreDialog').waitFor({state:'hidden'})}else await page.locator('#backToMatches').click();
    const closedValue=await clock.locator('[data-timeout-value]').textContent();await page.waitForTimeout(1200);
    assert.equal(await clock.locator('[data-timeout-value]').textContent(),closedValue,'closed scoring surface stops its interval');
    if(admin)await openAdmin();else await page.locator('[data-open="match"]').click();await clock.waitFor();
    assert.equal(f.match().timeout_ends_at,deadline,'reopening preserves the same timeout');
    assert.notEqual(await clock.locator('[data-timeout-value]').innerText(),closedValue,'reopening catches up elapsed time');
    failTimeout=true;await timeout('B').click();await page.locator(admin?'.toast':'#refToast').filter({hasText:/Không thể/}).waitFor();
    assert.equal(f.match().timeout_ends_at,deadline,'failed timeout leaves the existing deadline intact');assert.equal(await clock.isVisible(),true);assert.equal(await clock.getAttribute('data-timeout-side'),'A');failTimeout=false;
    await undo();await clock.waitFor({state:'hidden'});assert.equal(f.match().timeout_side,null);
    await timeout('A',true).click();assert.equal(await clock.isHidden(),true,'medical timeout never invents a one-minute clock');await undo();
    failTimeout=true;await timeout('B').click();await page.locator(admin?'.toast':'#refToast').filter({hasText:/Không thể/}).waitFor();assert.equal(await clock.isHidden(),true);assert.equal(f.match().timeout_side,null);failTimeout=false;
    await timeout('B').click();await clock.waitFor();
    const ended=new Date(Date.now()-1000).toISOString();f.db.prepare("UPDATE matches SET timeout_ends_at=? WHERE id='match'").run(ended);await refresh();
    await clock.locator('[data-timeout-status]').filter({hasText:'Hết timeout'}).waitFor();assert.equal(await clock.locator('[data-timeout-value]').innerText(),'00:00');
    await refresh();assert.match(await clock.innerText(),/Hết timeout/,'expiration remains visible until play resumes');
    const contrast=await clock.locator('[data-timeout-status]').evaluate(el=>{
      const luminance=color=>{const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722};
      const text=luminance(getComputedStyle(el).color),paper=luminance(getComputedStyle(el.closest('.timeout-clock')).backgroundColor);return (Math.max(text,paper)+.05)/(Math.min(text,paper)+.05);
    });assert.ok(contrast>=4.5,`${kind} expired timeout text requires readable contrast, got ${contrast}`);
    await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});await page.screenshot({path:resolve(out,`${kind}-${width}-expired.png`),fullPage:true});
    await page.locator('[data-rally="A"]').click();await clock.waitFor({state:'hidden'});
    await undo();await clock.waitFor();assert.equal(await clock.locator('[data-timeout-value]').innerText(),'00:00','Undo restores original expired deadline');
    if(admin){const result=await f.api('reset',{expectedVersion:f.match().version});assert.equal(result.status,200);await refresh()}else await page.locator('#resetMatchBtn').click();
    await clock.waitFor({state:'hidden'});assert.equal(f.match().timeout_side,null);
    await undo();await clock.waitFor();assert.equal(await clock.locator('[data-timeout-value]').innerText(),'00:00','Undo reset restores saved clock');
    const geometry=await clock.evaluate(el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:innerWidth}});assert.ok(geometry.left>=0&&geometry.right<=geometry.width+1,'clock fits mobile surface');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow');
    if(admin){await page.locator('#scoreDialog .icon-btn').click();await page.locator('#scoreDialog').waitFor({state:'hidden'})}else await page.locator('#backToMatches').click();
    assert.deepEqual(errors,[]);console.log('PASS timeout real Worker UI',kind,width,'S2, deadline, countdown, refresh/reload, expired, medical, failure, Undo/reset');
  }finally{await context.close();f.db.close()}
}

try{
  if(process.env.TIMEOUT_UI_PHASE!=='service')await clockHelper();
  if(process.env.TIMEOUT_UI_PHASE!=='helper')for(const [kind,width] of [['admin',375],['admin',1440],['referee',320],['referee',375]])if(!process.env.TIMEOUT_UI_KIND||process.env.TIMEOUT_UI_KIND===kind)await scoringSurface(kind,width);
}finally{await browser.close();await new Promise(r=>server.close(r))}
console.log('TIMEOUT_CLOCK_UI_OK');
