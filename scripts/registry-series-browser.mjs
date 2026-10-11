import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {scoringFixture} from '../cloudflare/tests/helpers/scoring-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
  const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,out=resolve(root,'ui-artifacts/series');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
  for(const [width,advance] of [[375,2],[1440,2],[375,1]]){
    const f=await scoringFixture();f.db.exec("DELETE FROM matches; DELETE FROM teams; UPDATE tournaments SET public_visible=1 WHERE id='tour'; UPDATE divisions SET format='pool_to_knockout',event_type='singles',best_of=1,points_to_win=11,win_by_two=1,advance_count=2,third_place_match=1 WHERE id='division'");
    for(let i=1;i<=4;i++)f.db.prepare("INSERT INTO courts(id,tournament_id,name,sort_order) VALUES(?,'tour',?,?)").run('court'+i,'Sân '+i,i);
    for(const group of ['A','B','C','D']){
      for(let i=1;i<=3;i++)f.db.prepare("INSERT INTO teams(id,division_id,name,group_code,seed) VALUES(?,'division',?,?,?)").run(group+i,group+' đội '+i,group,i);
      for(let a=1;a<=3;a++)for(let b=a+1;b<=3;b++){
        const id=group+a+b;f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status) VALUES(?,'division',?,?,?,?,'completed')").run(id,group+a,group+b,group+a,'Bảng '+group);
        f.db.prepare("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,1,11,3,1)").run('set'+id,id);
      }
    }
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.admin);
    await page.route('**/api/**',async route=>{
      const r=route.request(),response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    try{
      await page.goto(base+'/admin.html');await page.locator('button[data-open-tournament="tour"]').click();
      await page.locator('[data-auto-draw="division"]').click();
      await page.locator('[data-flex-series-b]').check();await page.locator('[data-flex-series-b-third]').check();
      await page.locator('[data-flex-groups]').fill('4');
      await page.locator('[data-flex-advance]').fill(String(advance));
      const saved=page.waitForResponse(r=>r.url().endsWith('/draw-config')&&r.request().method()==='PUT');await page.locator('[data-flex-save]').click();assert.equal((await saved).status(),200);
      assert.equal(f.db.prepare("SELECT series_b_enabled FROM divisions WHERE id='division'").get().series_b_enabled,1);
      assert.equal(f.db.prepare("SELECT series_b_third_place_match FROM divisions WHERE id='division'").get().series_b_third_place_match,1);
      await page.locator('[data-flex-close]').click();
      const generation=page.waitForResponse(r=>r.url().endsWith('/generate-bracket'));await page.locator('[data-top2-bracket="division"]').click();assert.equal((await generation).status(),200);
      const a=page.locator('#genericBody [data-bracket-series="A"]'),b=page.locator('#genericBody [data-bracket-series="B"]');
      await b.waitFor();assert.equal(await a.locator('[data-bracket-match]').count(),advance===2?8:4);assert.equal(await b.locator('[data-bracket-match]').count(),4);
      assert.match(await b.locator('.bracket-round-pro h3').first().innerText(),/bán kết/i);assert.match(await b.innerText(),/A đội 3/i);
      await b.scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`admin-${width}-top${advance}.png`)});
      await page.goto(base+'/tournament.html?id=tour');await page.locator('#tourBracket [data-bracket-series="B"]').waitFor();
      assert.equal(await page.locator('#tourBracket [data-bracket-series="B"] [data-bracket-match]').count(),4);
      assert.equal(await page.locator('#tourBracket [data-score-match]').count(),0,'public viewers cannot enter scores');
      assert.match(await page.locator('#tourStandings').innerText(),/Serie B/i);
      await page.locator('#tourBracket [data-bracket-series="B"]').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`public-${width}-top${advance}.png`)});
      const match=f.db.prepare("SELECT id FROM matches WHERE bracket_series='B' AND round_no=1 LIMIT 1").get();
      f.db.prepare("UPDATE matches SET referee_user_id='ref',court_id='court1' WHERE id=?").run(match.id);
      await page.evaluate(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.ref);
      await page.goto(base+'/referee.html?match='+match.id);await page.locator('#stageLabel').waitFor();
      await page.waitForFunction(()=>document.querySelector('#stageLabel')?.textContent.includes('Serie B'));
      assert.match(await page.locator('#stageLabel').innerText(),/Serie B.*Bán kết/i);
      const beforeA=f.db.prepare("SELECT * FROM matches WHERE bracket_series='A' ORDER BY id").all();
      const point=page.waitForResponse(r=>r.url().endsWith('/point'));await page.locator('[data-correct="A"][data-delta="1"]').click();assert.equal((await point).status(),200);
      assert.equal(f.db.prepare('SELECT current_score_a FROM matches WHERE id=?').get(match.id).current_score_a,1);
      assert.deepEqual(f.db.prepare("SELECT * FROM matches WHERE bracket_series='A' ORDER BY id").all(),beforeA,'Referee scoring Serie B does not touch A');
      await page.waitForFunction(()=>document.querySelector('#refScoreA')?.textContent==='1');
      const undo=page.waitForResponse(r=>r.url().endsWith('/undo'));await page.locator('#undoBtn').click();assert.equal((await undo).status(),200);
      assert.equal(f.db.prepare('SELECT current_score_a FROM matches WHERE id=?').get(match.id).current_score_a,0);
      assert.deepEqual(errors,[]);console.log('SERIES_BROWSER_PASS',width,'Top',advance,'setup, generation, two brackets, public and referee labels');
    }catch(error){await page.screenshot({path:resolve(out,`failure-${width}.png`),fullPage:true});throw error}
    finally{await page.close();f.db.close()}
  }
}finally{await browser.close();await new Promise(r=>server.close(r))}
console.log('SERIES_BROWSER_OK');
