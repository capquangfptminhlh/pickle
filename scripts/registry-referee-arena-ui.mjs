import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {scoringFixture} from '../cloudflare/tests/helpers/scoring-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'ui-artifacts/referee-arena');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
 const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browserOptions=process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{};
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch(browserOptions);
try{
 for(const reducedMotion of ['no-preference','reduce']){
  const f=await scoringFixture();f.db.exec(`UPDATE divisions SET points_to_win=15,best_of=3,scoring_mode='rally',win_by_two=1 WHERE id='division';
    UPDATE teams SET name='Nguyễn Minh / Trần Thuỳ Anh' WHERE id='a'; UPDATE teams SET name='Hoàng Nam / Lê Thanh Hà' WHERE id='b';
    INSERT INTO players(id,full_name,rating,skill_level,avatar_url) VALUES
      ('pa1','Nguyễn Minh',3.8,'A','/assets/app-icon-v2.svg'),('pa2','Trần Thuỳ Anh',3.2,'B',NULL),
      ('pb1','Hoàng Nam',3.7,'A','/assets/app-icon-v2.svg'),('pb2','Lê Thanh Hà',3.1,'B',NULL);
    INSERT INTO team_players(team_id,player_id,slot_no) VALUES('a','pa1',1),('a','pa2',2),('b','pb1',1),('b','pb2',2);`);
  const context=await browser.newContext({viewport:{width:375,height:900},reducedMotion,serviceWorkers:'block',...(process.env.REFEREE_VIDEO&&reducedMotion==='no-preference'?{recordVideo:{dir:resolve(out,'video'),size:{width:375,height:900}}}:{})}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(token=>{localStorage.setItem('pickle-api-token-v1',token);localStorage.setItem('pickleup-theme-v2','light');window.motionCalls=[];const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){window.motionCalls.push({id:this.id,cls:this.className,frames});return animate.call(this,frames,options)}},f.tokens.ref);
  // Capture referee-only fallback polling without creating 15-second timers in CI.
  await page.addInitScript(()=>{
    window.__refereeSyncTicks=[];
    const original=window.setInterval.bind(window);
    window.setInterval=(fn,ms,...args)=>{
      if(ms===15000){window.__refereeSyncTicks.push(fn);return 9001}
      return original(fn,ms,...args);
    };
  });
  let rejectPoint=false,slowState=false;
  await page.route('**/api/**',async route=>{
   const req=route.request();if(rejectPoint&&req.url().endsWith('/point')){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'TEST_UNAVAILABLE'})});return}
   if(slowState&&req.url().endsWith('/api/admin/state'))await new Promise(r=>setTimeout(r,1400));
   const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),f.env);await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
  });
  await page.goto(base+'/referee.html');await page.locator('#matchPicker .picker-card').waitFor();
  await page.evaluate(()=>{for(const name of ['scoreChange','serviceChange','setWin','matchWin']){const original=PickleMotion[name];PickleMotion[name]=(...args)=>{if(!PickleMotion.reduced())window.motionCalls.push({id:(name==='serviceChange'?args[1]:args[0])?.id,name,delta:args[1],direction:document.querySelector('#scoreSurface').dataset.motionDirection});return original(...args)}}});

  assert.equal(await page.locator('#matchPicker .picker-athlete').count(),4,'match list shows every athlete identity');
  assert.equal(await page.locator('#matchPicker .picker-athlete img').count(),2,'match list uses stored athlete avatars');
  assert.deepEqual(await page.locator('#matchPicker .picker-athlete-fallback').allTextContents(),['TA','TH'],'missing avatars use athlete initials');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'athlete identities do not overflow the match list');
  if(reducedMotion==='no-preference')await page.screenshot({path:resolve(out,'match-list-375.png'),fullPage:true});
  await page.locator('#matchPicker .picker-card').click();await page.locator('#scoreSurface').waitFor();
  assert.equal(await page.locator('#refRosterA .lineup-player').count(),2,'standard doubles shows both athletes on side A');
  assert.equal(await page.locator('#refRosterB .lineup-player').count(),2,'standard doubles shows both athletes on side B');
  assert.equal(await page.locator('.ref-team-roster .lineup-avatar img').count(),2,'score cards use stored athlete avatars');
  assert.deepEqual(await page.locator('.ref-team-roster .lineup-avatar-fallback').allTextContents(),['TA','TH'],'score cards use initials when no avatar exists');
  assert.deepEqual(await page.locator('#refRosterA .lineup-slot').allTextContents(),['Ô 1','Ô 2'],'athletes expose their initial court slots');
  assert.equal(await page.locator('#refRosterA [data-service-player="A"][data-server-number="2"]').getAttribute('aria-pressed'),'true','initial server is highlighted on the athlete');
  await page.locator('#refRosterB [data-service-player="B"][data-server-number="1"]').click();
  await page.waitForFunction(()=>document.querySelector('#refRosterB [data-server-number="1"]')?.getAttribute('aria-pressed')==='true');
  assert.equal(f.match().serving_side,'B');assert.equal(f.match().server_number,1);
  await page.locator('#refRosterA [data-service-player="A"][data-server-number="2"]').click();
  await page.waitForFunction(()=>document.querySelector('#refRosterA [data-server-number="2"]')?.getAttribute('aria-pressed')==='true');
  assert.match(await page.locator('#refRules').innerText(),/15/);assert.match(await page.locator('#refRules').innerText(),/Cách 2/);assert.match(await page.locator('#refRules').innerText(),/Thắng 2\/3/);
  assert.equal(await page.locator('#refScoreA').innerText(),'0');
  assert.equal(await page.evaluate(()=>window.__refereeSyncTicks.length),1,'referee keeps one fallback poll for long sessions');
  // Two devices can update a match while the referee's phone is asleep.
  // On visibility resume the current persisted score AND version must return.
  f.db.exec("UPDATE matches SET current_score_a=2, version=version+1 WHERE id='match'");
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForFunction(()=>document.querySelector('#refScoreA')?.textContent==='2');
  assert.equal(await page.locator('#connectionState').innerText(),'Tự đồng bộ 15 giây','no socket must not claim realtime');
  f.db.exec("UPDATE matches SET current_score_a=0, version=version+1 WHERE id='match'");
  await page.evaluate(()=>window.__refereeSyncTicks[0]());
  await page.waitForFunction(()=>document.querySelector('#refScoreA')?.textContent==='0');
  // Polling pauses while backgrounded; no hidden tab should race a mutation.
  await page.evaluate(()=>Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'}));
  f.db.exec("UPDATE matches SET current_score_b=3, version=version+1 WHERE id='match'");
  await page.evaluate(()=>window.__refereeSyncTicks[0]());
  await page.waitForTimeout(80);
  assert.equal(await page.locator('#refScoreB').innerText(),'0','hidden referee screen does not poll');
  await page.evaluate(()=>{delete document.visibilityState;document.dispatchEvent(new Event('visibilitychange'))});
  await page.waitForFunction(()=>document.querySelector('#refScoreB')?.textContent==='3');
  f.db.exec("UPDATE matches SET current_score_b=0, version=version+1 WHERE id='match'");
  await page.evaluate(()=>window.__refereeSyncTicks[0]());
  await page.waitForFunction(()=>document.querySelector('#refScoreB')?.textContent==='0');

  if(process.env.REFEREE_VIDEO)await page.waitForTimeout(400);
  await page.evaluate(()=>window.motionCalls=[]);
  slowState=true;const pointStarted=Date.now();
  await page.locator('[data-correct="A"][data-delta="1"]').click();await page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='1',null,{timeout:800});
  assert.ok(Date.now()-pointStarted<1000,'confirmed point must render from its mutation response without waiting for a full state reload');slowState=false;
  const points=await page.evaluate(()=>window.motionCalls.filter(c=>c.id==='refScoreA'||c.id==='refScoreB'));
  assert.equal(points.length,reducedMotion==='reduce'?0:1,'one confirmed point animates only its score');
  if(points.length)assert.equal(points[0].id,'refScoreA');
  assert.equal(await page.locator('#resetMatchBtn').isVisible(),true,'reset must stay available on the scoring surface');
  await page.evaluate(()=>window.motionCalls=[]);await page.locator('#resetMatchBtn').click();await page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='0');
  const resetMotion=await page.evaluate(()=>window.motionCalls.find(c=>c.name==='scoreChange'));
  if(reducedMotion!=='reduce'){assert.equal(resetMotion?.delta,-1,'reset uses a decreasing score transition');assert.equal(resetMotion?.direction,'reverse','reset is visibly marked as reverse motion')}
  assert.equal(f.match().status,'scheduled');assert.deepEqual(f.sets(),[]);
  await page.locator('#undoBtn').click();await page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='1');
  await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(500);await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});
  await page.screenshot({path:resolve(out,`live-375-${reducedMotion}.png`)});
  await page.evaluate(()=>window.motionCalls=[]);await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/admin/state')),page.locator('#refreshBtn').click()]);
  assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.id.startsWith('refScore')).length),0,'unchanged refresh has no score animation');
  await page.locator('#undoBtn').click();await page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='0');
  const undoMotion=await page.evaluate(()=>window.motionCalls.find(c=>c.name==='scoreChange'&&c.id==='refScoreA'));
  assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.id==='refScoreA').length),reducedMotion==='reduce'?0:1,'Undo animates confirmed decrease');
  if(reducedMotion!=='reduce')assert.equal(undoMotion?.direction,'reverse','Undo is visibly marked as reverse motion');
  if(process.env.REFEREE_VIDEO)await page.waitForTimeout(550);
  rejectPoint=true;await page.evaluate(()=>window.motionCalls=[]);await page.locator('[data-correct="A"][data-delta="1"]').click();await page.locator('#refToast').filter({hasText:'Không thể thực hiện'}).waitFor();
  assert.equal(f.match().current_score_a,0);assert.equal(await page.locator('#refScoreA').innerText(),'0');assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.id.startsWith('refScore')).length),0,'failed point does not animate fake score');rejectPoint=false;
  // A side-out without a point must still give visible service feedback.
  f.db.exec("UPDATE divisions SET scoring_mode='side_out' WHERE id='division'");await page.locator('#refreshBtn').click();await page.waitForFunction(()=>document.querySelector('#modeBanner').textContent.includes('Side-out'));
  await page.evaluate(()=>window.motionCalls=[]);await page.locator('[data-rally="B"]').click();await page.waitForFunction(()=>document.querySelector('[data-service="B"][data-server="1"]').classList.contains('active'));
  assert.equal(f.match().current_score_b,0);assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.id==='serveBanner').length),reducedMotion==='reduce'?0:1,'service change animates without fake point');
  // A confirmed set close celebrates once; first render and reset never replay it.
  f.db.exec("UPDATE divisions SET points_to_win=11,best_of=3,scoring_mode='rally',win_by_two=1 WHERE id='division'; UPDATE matches SET current_score_a=11,current_score_b=9 WHERE id='match'");await page.locator('#refreshBtn').click();await page.waitForFunction(()=>!document.querySelector('#finishSetBtn').disabled);
  await page.evaluate(()=>window.motionCalls=[]);await page.locator('#finishSetBtn').click();await page.waitForFunction(()=>document.querySelectorAll('#setHistory span').length===1&&!document.querySelector('#setHistory').textContent.includes('Chưa có'));
  assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.name==='setWin').length),reducedMotion==='reduce'?0:1,'confirmed set completion animates once');
  await page.locator('#resetMatchBtn').click();await page.waitForFunction(()=>document.querySelector('#setHistory').textContent.includes('Chưa có set'));
  assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.name==='setWin').length),reducedMotion==='reduce'?0:1,'reset does not replay a set celebration');
  // Rules follow setup, including relay and its final-point constraint.
  f.db.exec("UPDATE divisions SET points_to_win=27,best_of=1,scoring_mode='rally',win_by_two=0,relay_segment_points=9,relay_team_size=3,final_point_on_serve=1 WHERE id='division'");await page.locator('#refreshBtn').click();await page.waitForFunction(()=>document.querySelector('#refRules').textContent.includes('27'));
  assert.match(await page.locator('#refRules').innerText(),/Chạm 27/);assert.match(await page.locator('#refRules').innerText(),/Không cách 2/);assert.match(await page.locator('#modeBanner').innerText(),/cầm giao/);
  f.db.exec("UPDATE divisions SET points_to_win=11,best_of=1,relay_segment_points=0,relay_team_size=0,final_point_on_serve=0,win_by_two=1 WHERE id='division'; UPDATE matches SET current_score_a=11,current_score_b=9 WHERE id='match'");await page.locator('#refreshBtn').click();await page.locator('#finishMatchBtn').waitFor();await page.waitForFunction(()=>!document.querySelector('#finishMatchBtn').disabled);
  await page.evaluate(()=>{window.motionCalls=[];window.celebrationAdds=0;new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)if(node instanceof Element&&node.matches('.motion-celebration'))window.celebrationAdds++}).observe(document.body,{childList:true})});await page.locator('#finishMatchBtn').click();await page.locator('#queueLabel').filter({hasText:'HOÀN TẤT'}).waitFor();
  assert.match(await page.locator('#scoreHint').innerText(),/Thắng trận/);assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.id==='scoreHint').length),reducedMotion==='reduce'?0:1,'completion banner animates on confirmed finish');
  assert.equal(f.match().winner_team_id,'a');
  assert.equal(await page.evaluate(()=>window.celebrationAdds),reducedMotion==='reduce'?0:1,'winner transition creates at most one celebration canvas');
  if(reducedMotion==='reduce')assert.equal(await page.locator('.motion-celebration').count(),0,'reduced motion never creates a celebration canvas');
  else{assert.equal(await page.locator('.motion-celebration').count(),1,'live winner transition creates one inert canvas');await page.waitForFunction(()=>!document.querySelector('.motion-celebration'),null,{timeout:3000})}
  assert.equal(await page.locator('#refRosterA [data-service-player]').first().getAttribute('aria-disabled'),'true','finished matches disable direct server selection');
  assert.equal(await page.locator('#refScoreA').innerText(),'11','finished scoreboard retains final game result');assert.equal(await page.locator('#refScoreB').innerText(),'9');
  await page.evaluate(()=>window.motionCalls=[]);await page.locator('#refreshBtn').click();await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.motionCalls.filter(c=>c.name).length),0,'unchanged completed match never replays any motion');
  for(const theme of ['light','dark'])for(const width of [320,375,844,1440]){
   await page.setViewportSize({width,height:width===844?390:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);await page.evaluate(()=>document.fonts.ready);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${theme} ${width} no overflow`);
   const heights=await page.locator('[data-rally],[data-correct],#resetMatchBtn,#undoBtn,#finishSetBtn,#finishMatchBtn').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().height));assert.ok(heights.every(h=>h>=44),'44px touch targets');
   await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0)});
   if(width===375||width===1440)await page.screenshot({path:resolve(out,`${theme}-${width}-${reducedMotion}.png`),fullPage:true});
  }
  // A special result must not reuse a prior game's score as its final result.
  f.db.exec("UPDATE matches SET winner_team_id='b',result_reason='injury' WHERE id='match'");await page.locator('#refreshBtn').click();await page.locator('#scoreHint').filter({hasText:'Đối thủ chấn thương'}).waitFor();
  assert.equal(await page.locator('#refScoreA').innerText(),'—');assert.equal(await page.locator('#refScoreB').innerText(),'—');assert.match(await page.locator('#scoreHint').innerText(),/Hoàng Nam/);
  f.db.exec("DELETE FROM match_sets WHERE match_id='match'; UPDATE matches SET status='live',winner_team_id=NULL,result_reason=NULL,current_score_a=99,current_score_b=99 WHERE id='match'");await page.setViewportSize({width:320,height:900});await page.locator('#refreshBtn').click();await page.locator('#refScoreA').filter({hasText:'99'}).waitFor();
  await page.locator('[data-rally="A"]').click();await page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='100');
  assert.ok(await page.locator('#finishMatchBtn').isDisabled(),'100-99 cannot finish a win-by-two game');
  await page.locator('[data-rally="A"]').click();await page.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='101');await page.waitForTimeout(300);
  const fits=await page.locator('#refScoreA').evaluate(el=>{const score=el.getBoundingClientRect(),card=el.closest('.ref-team-card').getBoundingClientRect();return score.x>=card.x&&score.right<=card.right});assert.ok(fits,'three digit deuce fits a 320px screen');
  assert.deepEqual(errors,[]);await context.close();f.db.close();console.log('PASS referee arena',reducedMotion,'score, Undo, refresh, failure, service, relay, finish, special result, 8 responsive layouts');
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
console.log('REFEREE_ARENA_UI_OK');

