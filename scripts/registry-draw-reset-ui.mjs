import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {accountFixture} from '../cloudflare/tests/helpers/accounts-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
    const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
  }catch{res.writeHead(404).end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
await mkdir(resolve(root,'ui-artifacts/draw-reset'),{recursive:true});
const motionPage=await browser.newPage();
try{
  await motionPage.goto(base+'/index.html');
  const probe=await motionPage.evaluate(async()=>{
    const root=document.createElement('div'),completedRoot=document.createElement('div'),multiRoot=document.createElement('div'),resizeRoot=document.createElement('div'),failedResetRoot=document.createElement('div');resizeRoot.id='publicBracket';document.body.append(root,completedRoot,multiRoot,resizeRoot,failedResetRoot);
    const group='<div class="group-results"><b>Bảng A</b><span>Đã đấu 3 trận</span></div>';
    const matches=(winner=null,empty=false)=>[
      {id:'semi-1',divisionId:'motion-test',bracketSlot:'SE-R1-1',stage:'Bán kết',a:empty?'':'t1',b:empty?'':'t2',winner,status:winner?'done':'wait'},
      {id:'semi-2',divisionId:'motion-test',bracketSlot:'SE-R1-2',stage:'Bán kết',a:empty?'':'t3',b:empty?'':'t4',status:'wait'},
      {id:'final',divisionId:'motion-test',bracketSlot:'SE-R2-1',stage:'Chung kết',a:empty?'':winner||'TBD',b:empty?'':'TBD',status:'wait'}
    ];
    const render=(winner=null,empty=false)=>window.PickleBracket.render(matches(winner,empty),id=>id,{admin:true});
    const multiMatches=(winner=null,prefix='')=>[
      {id:prefix+'q1',divisionId:'motion-test',bracketSlot:'SE-R1-M1',stage:'Tứ kết',a:'t1',b:'t2',winner:'t1',status:'done'},
      {id:prefix+'q2',divisionId:'motion-test',bracketSlot:'SE-R1-M2',stage:'Tứ kết',a:'t3',b:'t4',winner:'t3',status:'done'},
      {id:prefix+'q3',divisionId:'motion-test',bracketSlot:'SE-R1-M3',stage:'Tứ kết',a:'t5',b:'t6',winner:'t5',status:'done'},
      {id:prefix+'q4',divisionId:'motion-test',bracketSlot:'SE-R1-M4',stage:'Tứ kết',a:'t7',b:'t8',winner:'t7',status:'done'},
      {id:prefix+'s1',divisionId:'motion-test',bracketSlot:'SE-R2-M1',stage:'Bán kết',a:'t1',b:'t3',winner,status:winner?'done':'wait'},
      {id:prefix+'s2',divisionId:'motion-test',bracketSlot:'SE-R2-M2',stage:'Bán kết',a:'t5',b:'t7',status:'wait'},
      {id:prefix+'f',divisionId:'motion-test',bracketSlot:'SE-R3-M1',stage:'Chung kết',a:winner||'TBD',b:'TBD',status:'wait'}
    ];
    const renderMulti=(winner=null,prefix='')=>window.PickleBracket.render(multiMatches(winner,prefix),id=>id,{admin:true});
    const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    completedRoot.innerHTML=render('t1');window.PickleBracketMotion.reconcile(completedRoot);await settle();
    const completedInitial=completedRoot.querySelector('[data-motion-state="advanced"]')!==null;
    root.innerHTML=group+'<div class="bracket-motion-host"></div>';
    const bracket=root.querySelector('.bracket-motion-host');bracket.innerHTML=render();window.PickleBracketMotion.reconcile(root);await settle();
    const keys=[...root.querySelectorAll('[data-motion-key]')].map(el=>el.getAttribute('data-motion-key'));
    const initialCelebration=root.querySelector('[data-motion-state="advanced"], [data-motion-state="reset"]')!==null;
    bracket.innerHTML=render('t1');window.PickleBracketMotion.reconcile(root);await settle();
    const advanced=root.querySelectorAll('.bracket-team-slot[data-motion-state="advanced"]').length;
    await new Promise(resolve=>setTimeout(resolve,850));
    bracket.innerHTML=render('t1');window.PickleBracketMotion.reconcile(root);await settle();
    const duplicate=root.querySelectorAll('.bracket-team-slot[data-motion-state="advanced"]').length;
    const groupBefore=root.querySelector('.group-results').outerHTML;
    const uncertain=document.createElement('div');document.body.append(uncertain);uncertain.innerHTML=render('t1');window.PickleBracketMotion.reconcile(uncertain);
    uncertain.innerHTML=render(null,true);window.PickleBracketMotion.reconcile(uncertain);await settle();
    const unconfirmedReset=uncertain.querySelectorAll('[data-motion-state="reset"]').length;uncertain.remove();
    root.dataset.bracketResetConfirmed='motion-test';
    bracket.innerHTML=render(null,true);window.PickleBracketMotion.reconcile(root);await settle();
    const reset=root.querySelectorAll('.bracket-team-slot[data-motion-state="reset"]').length;
    const groupAfter=root.querySelector('.group-results').outerHTML;
    multiRoot.innerHTML=renderMulti();window.PickleBracketMotion.reconcile(multiRoot);await settle();
    multiRoot.innerHTML=renderMulti('t1');window.PickleBracketMotion.reconcile(multiRoot);await settle();
    const highlighted=[...multiRoot.querySelectorAll('[data-motion-state="advanced"]')].map(el=>el.closest('.bracket-match')?.dataset.matchId);
    const advancingPaths=[...multiRoot.querySelectorAll('.bracket-connectors .is-advancing')].map(path=>({source:path.dataset.connectorSource,destination:path.dataset.connectorDestination}));
    await new Promise(resolve=>setTimeout(resolve,850));
    multiRoot.innerHTML=renderMulti('t1','other-');window.PickleBracketMotion.reconcile(multiRoot);await settle();
    const viewSwitchCelebration=multiRoot.querySelector('[data-motion-state="advanced"]')!==null;
    resizeRoot.innerHTML=renderMulti();window.PickleBracketMotion.reconcile(resizeRoot);await settle();
    const connectorBefore=resizeRoot.querySelector('.bracket-connectors');window.dispatchEvent(new Event('resize'));await settle();
    const connectorAfter=resizeRoot.querySelector('.bracket-connectors');
    failedResetRoot.innerHTML=render();window.PickleBracketMotion.reconcile(failedResetRoot);await settle();
    const fakeDialog=document.createElement('div');fakeDialog.className='draw-reset-dialog';fakeDialog.innerHTML='<button data-reset-submit>submit</button>';document.body.append(fakeDialog);fakeDialog.querySelector('button').click();fakeDialog.remove();await settle();
    failedResetRoot.innerHTML=render(null,true);window.PickleBracketMotion.reconcile(failedResetRoot);await settle();
    const failedResetAnimation=failedResetRoot.querySelector('[data-motion-state="reset"]')!==null;
    root.remove();completedRoot.remove();multiRoot.remove();resizeRoot.remove();failedResetRoot.remove();
    await new Promise(resolve=>setTimeout(resolve,850));
    const renderSuccess=(winner=null,empty=false)=>render(winner,empty).replaceAll('motion-test','motion-success');
    const explicitRoot=document.createElement('div');explicitRoot.id='tourBracket';document.body.append(explicitRoot);explicitRoot.innerHTML=renderSuccess();window.PickleBracketMotion.reconcile(explicitRoot);await settle();
    document.dispatchEvent(new CustomEvent('pickle:knockout-reset',{detail:{divisionId:'motion-success'}}));
    const explicitMarked=explicitRoot.dataset.bracketResetConfirmed;
    explicitRoot.innerHTML=renderSuccess(null,true);window.PickleBracketMotion.reconcile(explicitRoot);await settle();
    const explicitReset=explicitRoot.querySelectorAll('[data-motion-state="reset"]').length;
    const explicitResetKeys=[...explicitRoot.querySelectorAll('[data-motion-state="reset"]')].map(el=>el.dataset.motionKey);
    const safe=keys.every(key=>key.includes('motion-test')&&!key.includes('"')&&!key.includes('<'));
    explicitRoot.remove();return {keys,safe,completedInitial,initialCelebration,advanced,duplicate,unconfirmedReset,reset,groupBefore,groupAfter,highlighted,advancingPaths,viewSwitchCelebration,connectorRebuilt:connectorBefore!==connectorAfter,failedResetAnimation,explicitMarked,explicitReset,explicitResetKeys};
  });
  assert.ok(probe.keys.length>=3,'bracket rounds, matches and team slots expose stable motion keys');
  assert.ok(probe.safe,'motion keys include division identity and serialize safely');
  assert.equal(probe.completedInitial,false,'completed initial load does not celebrate');
  assert.equal(probe.initialCelebration,false,'initial bracket draw has no fake advancement/reset');
  assert.equal(probe.advanced,1,'confirmed winner transition advances exactly one destination slot');
  assert.equal(probe.duplicate,0,'duplicate confirmed state does not replay advancement');
  assert.equal(probe.unconfirmedReset,0,'cleared slots do not animate without a confirmed knockout reset');
  assert.equal(probe.reset,5,'knockout reset marks only populated knockout team slots');
  assert.equal(probe.groupAfter,probe.groupBefore,'knockout reset preserves group results DOM bit-for-bit');
  assert.deepEqual(probe.highlighted,['f'],'a semifinal winner advances only into the final, never back into an earlier round');
  assert.equal(probe.advancingPaths.length,2,'only the glow and line for the exact semifinal-to-final connector animate');
  assert.ok(probe.advancingPaths.every(path=>path.source.includes('SE-R2-M1')&&path.destination.includes('SE-R3-M1')),'animated connector follows the exact next-round route');
  assert.equal(probe.viewSwitchCelebration,false,'switching to a newly rendered completed bracket does not replay historic winners');
  assert.equal(probe.connectorRebuilt,true,'resize rebuilds connector geometry');
  assert.equal(probe.failedResetAnimation,false,'closing a submitted dialog without API success never animates a reset');
  assert.equal(probe.explicitMarked,'motion-success','an explicit successful knockout reset event marks the matching rendered division');
  assert.ok(probe.explicitReset>0,'an explicit successful knockout reset event animates cleared slots: '+probe.explicitResetKeys.join(','));
}finally{await motionPage.close()}
try{
  for(const actor of ['admin','organizer'])for(const width of [1440,375]){
    const f=await accountFixture();
    f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
    f.db.exec("INSERT INTO divisions(id,tournament_id,name,event_type) VALUES('division','own','MLP 3 nữ','team'); INSERT INTO courts(id,tournament_id,name) VALUES('court','own','Sân 1')");
    for(let i=0;i<16;i++)f.db.prepare('INSERT INTO teams(id,division_id,name,group_code) VALUES(?,?,?,?)').run('t'+i,'division','Đội '+(i+1),String.fromCharCode(65+Math.floor(i/4)));
    f.db.exec(`INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,stage,status,current_score_a,version) VALUES('played','division','t0','t1','court','Bảng A','live',3,2);
      INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,bracket_slot) VALUES('final','division','t2','t3','Chung kết','F-1');
      INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('set','played',1,27,24,1);
      INSERT INTO score_events(match_id,event_type,match_version) VALUES('played','POINT',2);`);
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens[actor]);
    let writes=0,previewGate=null,previewStarted=null;
    await page.route('**/api/**',async route=>{
      const r=route.request();if(r.method()==='POST'&&r.url().endsWith('/reset-draw'))writes++;
      const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
      if(r.method()==='GET'&&r.url().endsWith('/reset-draw')&&previewGate){previewStarted();await previewGate}
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    const count=()=>f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='division'").get().n;
    try{
      await page.goto(base+'/admin.html');if(width<=760)await page.locator('#mobileMenu').click();
      await page.locator('[data-page="bracket"]').click();
      await page.locator('[data-reset-knockout="division"]').click();
      await page.locator('.draw-reset-dialog [data-reset-confirmation]').waitFor();
      await page.locator('.draw-reset-dialog [data-reset-cancel]').click();
      assert.equal(count(),2);assert.equal(writes,0,'bracket reset entry preserves data until confirmed');
      const poolBefore={...f.db.prepare("SELECT * FROM matches WHERE id='played'").get()};
      await page.evaluate(()=>{window.__knockoutResetEvents=[];document.addEventListener('pickle:knockout-reset',event=>window.__knockoutResetEvents.push(event.detail?.divisionId))});
      await page.locator('[data-reset-knockout="division"]').click();
      await page.locator('.draw-reset-dialog [data-reset-confirmation]').fill('DAT LAI');
      await page.locator('.draw-reset-dialog [data-reset-submit]').click();
      await page.waitForFunction(()=>!document.querySelector('.draw-reset-dialog'));
      assert.equal(count(),1);assert.deepEqual({...f.db.prepare("SELECT * FROM matches WHERE id='played'").get()},poolBefore);
      assert.equal(f.db.prepare("SELECT count(*) n FROM match_sets WHERE match_id='played'").get().n,1);
      assert.deepEqual(await page.evaluate(()=>window.__knockoutResetEvents),['division'],'successful knockout reset dispatches one explicit confirmation event');
      f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,bracket_slot) VALUES('final','division','t2','t3','Chung kết','F-1')");
      if(width<=760)await page.locator('#mobileMenu').click();
      await page.locator('[data-page="tournaments"]').click();await page.locator('.tour-card[data-open-tournament="own"]').click();
      await page.locator('[data-reset-draw="division"]').waitFor();
      let releasePreview;
      const started=new Promise(resolve=>{previewStarted=resolve});
      previewGate=new Promise(resolve=>{releasePreview=resolve});
      await page.locator('[data-reset-draw="division"]').click();await started;
      try{
        await page.locator('.draw-reset-dialog [data-reset-close]').click();
        await page.locator('.draw-reset-dialog').waitFor({state:'detached',timeout:2000});
        assert.equal(count(),2);assert.equal(writes,0,'cancel during a slow preview must never mutate data');
      }finally{releasePreview();previewGate=null}
      await page.locator('[data-reset-draw="division"]').click();
      await page.locator('.draw-reset-dialog [data-reset-cancel]').click();
      assert.equal(count(),2);assert.equal(writes,0,'the direct division button must also support cancellation');
      await page.locator('[data-center-draw]').click();
      const settings=page.locator('.draw-setup-overlay').filter({has:page.locator('[data-flex-run]')});
      const resetButton=settings.locator('[data-flex-reset]');await resetButton.waitFor();
      assert.match(await resetButton.innerText(),/Đặt lại bảng.*quay lại/);
      await resetButton.click();
      const confirm=page.locator('.draw-reset-dialog');await confirm.locator('[data-reset-confirmation]').waitFor();
      assert.match(await confirm.innerText(),/MLP 3 nữ/);assert.match(await confirm.innerText(),/1 trận đang live/);
      await confirm.locator('[data-reset-cancel]').click();assert.equal(count(),2);assert.equal(writes,0);
      await resetButton.click();await confirm.locator('[data-reset-confirmation]').fill('sai');
      assert.equal(await confirm.locator('[data-reset-submit]').isDisabled(),true);
      assert.equal(writes,0,'bad confirmation must never send reset');
      await confirm.locator('[data-reset-confirmation]').fill('QUAY LAI');
      f.db.exec("UPDATE matches SET current_score_a=4,version=3 WHERE id='played'");
      await confirm.locator('[data-reset-submit]').click();
      await confirm.locator('[data-reset-error]').filter({hasText:/đã thay đổi/}).waitFor();
      assert.equal(count(),2);assert.equal(f.db.prepare("SELECT current_score_a FROM matches WHERE id='played'").get().current_score_a,4);
      assert.equal(await confirm.locator('[data-reset-submit]').isDisabled(),true,'stale preview must not allow resubmission');
      await confirm.locator('[data-reset-reload]').click();
      await confirm.locator('[data-reset-confirmation]').waitFor();assert.equal(await confirm.locator('[data-reset-confirmation]').inputValue(),'');
      await confirm.locator('[data-reset-confirmation]').fill('QUAY LAI');
      await page.screenshot({path:resolve(root,`ui-artifacts/draw-reset/${actor}-${width}-confirmation.png`)});
      // Reload re-renders the dialog asynchronously; wait for a stable size.
      await confirm.locator('[data-reset-submit]').waitFor({state:'visible'});
      await page.waitForFunction(()=>{
        const button=document.querySelector('.draw-reset-dialog [data-reset-submit]');
        if(!button)return false;
        const r=button.getBoundingClientRect();
        return r.width>=44&&r.height>=44;
      },null,{timeout:5000});
      assert.ok(await confirm.locator('[data-reset-submit]').evaluate(button=>{
        const r=button.getBoundingClientRect();return r.width>=44&&r.height>=44;
      }),"reset confirmation must remain at least 44px in both directions");
      await confirm.locator('[data-reset-submit]').click();
      await page.waitForFunction(()=>!document.querySelector('.draw-reset-dialog'),null,{timeout:12000});
      await page.locator('[data-flex-run]').waitFor();assert.equal(count(),0);
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM teams WHERE division_id='division' AND group_code IS NOT NULL").get().n,0);
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM teams WHERE division_id='division'").get().n,16);
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='RESET_GROUP_DRAW'").get().n,1);
      await page.locator('[data-flex-run]').click();
      await page.waitForFunction(()=>!document.querySelector('.draw-setup-overlay'),null,{timeout:12000});
      await page.locator('#genericBody .tournament-insight-grid strong').filter({hasText:/^0\/24$/}).waitFor();
      assert.equal(count(),24,'reset must allow a new four-group schedule');
      assert.deepEqual(errors,[]);console.log('PASS',actor,width,'reset cancel, stale score, archive and redraw');
    }catch(error){await page.screenshot({path:resolve(root,`ui-artifacts/draw-reset/${actor}-${width}-failure.png`)});throw error}
    finally{await page.close();f.db.close()}
  }
}finally{await browser.close();await new Promise(r=>server.close(r))}
console.log('DRAW_RESET_UI_OK');
