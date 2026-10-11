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
      assert.ok(await confirm.locator('[data-reset-submit]').evaluate(button=>{const r=button.getBoundingClientRect();return r.width>=44&&r.height>=44}));
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
