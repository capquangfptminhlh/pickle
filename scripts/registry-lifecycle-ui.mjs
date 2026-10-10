import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {accountFixture} from '../cloudflare/tests/helpers/accounts-fixture.mjs';
import {hashPassword} from '../cloudflare/src/auth.js';

// All mutations use the real Worker and isolated SQLite. Only realtime transport
// and service-worker installation are excluded here; they have separate tests.
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    const pathname=new URL(req.url,'http://localhost').pathname;
    if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(pathname)){res.end('');return}
    const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if(!path.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');
    res.end(await readFile(path));
  }catch{res.writeHead(404).end()}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})}),failures=[];
await mkdir(resolve(root,'ui-artifacts/lifecycle'),{recursive:true});
const cases=[
  {actor:'admin',width:1440,type:'singles',target:11,best:1},
  {actor:'organizer',width:375,type:'doubles',target:15,best:1},
  {actor:'organizer',width:1440,type:'team',target:27,best:1,mlp:true},
  {actor:'admin',width:375,type:'doubles',target:11,best:3},
];
try{
 for(const cfg of cases){
  const tag=`${cfg.actor}-${cfg.width}-${cfg.type}-${cfg.target}`,f=await accountFixture(),errors=[];
  const password='LifecycleLocal123!';
  f.db.prepare('UPDATE app_users SET password_hash=? WHERE id=?').run(await hashPassword(password),cfg.actor);
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  const context=await browser.newContext({viewport:{width:cfg.width,height:900}});
  context.on('page',p=>{p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('dialog',d=>d.accept())});
  await context.route('**/api/**',async route=>{
    const r=route.request();
    const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  const page=await context.newPage();
  const note=step=>console.log('PASS',tag,step);
  const verify=async(step,fn)=>{try{await fn();note(step)}catch(e){failures.push(`${tag} ${step}: ${e.message}`);console.error('FAIL',failures.at(-1))}};
  const nav=async id=>{
    await page.locator(`[data-page="${id}"]`).waitFor({state:'attached'});
    if(cfg.width<=760&&!(await page.locator(`[data-page="${id}"]`).isVisible()))await page.locator('#mobileMenu').click();
    await page.locator(`[data-page="${id}"]`).click();
  };
  const login=async(p,email)=>{
    await p.goto(base+'/login.html');await p.locator('#email').fill(email);await p.locator('#password').fill(password);
    await p.locator('#loginForm button').click();await p.waitForURL(/(?:admin|referee)\.html/);
  };
  let tid,did,refId;
  const center=async()=>{
    await page.goto(base+'/admin.html');await nav('tournaments');
    await page.locator(`[data-open-tournament="${tid}"]`).click();await page.locator('[data-center-draw]').waitFor();
  };
  try{
    await login(page,cfg.actor==='admin'?'admin@test.vn':'org@test.vn');
    await nav('tournaments');await page.locator('[data-action="newTournament"]').click();
    await page.locator('#fName').fill('QA '+tag);await page.locator('#fCourtCount').fill('2');await page.locator('#fType').selectOption(cfg.type);
    await page.locator('#saveTournament').click();await page.locator('#genericDialog').waitFor({state:'hidden'});
    tid=f.db.prepare('SELECT id FROM tournaments WHERE name=?').get('QA '+tag).id;
    assert.equal(f.db.prepare('SELECT count(*) n FROM courts WHERE tournament_id=?').get(tid).n,2);note('login-and-create-tournament');
    await page.locator('[data-action="newDivision"]').click();await page.locator('#dTournament').selectOption(tid);
    await page.locator('#dName').fill('Nội dung QA');await page.locator('#dType').selectOption(cfg.type);
    await page.locator('#dBest').selectOption(String(cfg.best));await page.locator('#dPoints').selectOption(String(cfg.target));
    await page.locator('#dScoring').selectOption('rally');await page.locator('#dRest').fill('0');
    if(cfg.mlp)await page.locator('[data-mlp-preset="dRule"]').click();
    await page.locator('#saveDivision').click();await page.locator('#genericDialog').waitFor({state:'hidden'});
    did=f.db.prepare('SELECT id FROM divisions WHERE tournament_id=? AND name=?').get(tid,'Nội dung QA').id;
    const rule=f.db.prepare('SELECT * FROM divisions WHERE id=?').get(did);
    assert.equal(rule.points_to_win,cfg.target);assert.equal(rule.best_of,cfg.best);note('configure-rules-ui');
    const size=cfg.type==='singles'?1:cfg.type==='team'?3:2;
    await nav('players');await page.locator('[data-action="newPlayer"]').click();await page.locator('#pName').fill('QA athlete 0');
    await page.locator('#pGender').selectOption('female');await page.locator('#savePlayer').click();await page.locator('#genericDialog').waitFor({state:'hidden'});
    const ids=[f.db.prepare("SELECT id FROM players WHERE full_name='QA athlete 0'").get().id];
    // The first athlete is created through the UI; the remaining independent
    // profiles use the real API to keep this end-to-end test bounded.
    for(let i=1;i<4*size;i++){
      const r=await f.api('/api/players',{fullName:'QA athlete '+i,gender:'female',rating:3,skillLevel:'B'},'POST',cfg.actor);
      assert.equal(r.status,201,JSON.stringify(r.data));ids.push(r.data.id);
    }
    for(let i=0;i<4;i++){
      await center();await page.locator(`[data-add-participants="${did}"]`).click();await page.locator('#teamPlayerPicker').waitFor();
      for(let j=0;j<size;j++){
        await page.locator(`[data-player-search="${j}"]`).fill('QA athlete '+(i*size+j));
        await page.locator(`[data-player-results="${j}"] [data-player-id="${ids[i*size+j]}"]`).click();
      }
      await page.locator('#teamName').fill('QA đội '+i);await page.locator('#saveTeam').click();
      await page.locator(`[data-add-participants="${did}"]`).waitFor();
    }
    assert.equal(f.db.prepare('SELECT count(*) n FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE t.division_id=?').get(did).n,4*size);note('create-athletes-teams-and-registrations');
    await verify('blocked-bracket-keeps-center-open',async()=>{
      const response=page.waitForResponse(r=>r.url().endsWith('/generate-bracket'));
      await page.locator(`[data-top2-bracket="${did}"]`).click();await response;
      assert.equal(await page.locator('#genericDialog').evaluate(el=>el.open),true,'an unsuccessful bracket action must keep the operator center open');
    });
    await center();
    await verify('center-selects-populated-division',async()=>{
      await page.locator('[data-center-draw]').click();await page.locator('[data-flex-run]').waitFor({timeout:2500});
      assert.match(await page.locator('.draw-setup-overlay').getAttribute('aria-label'),/Nội dung QA/);
    });
    if(await page.locator('.draw-setup-overlay').count())await page.keyboard.press('Escape');
    await page.locator(`[data-auto-draw="${did}"]`).click();await page.locator('[data-flex-run]').waitFor();
    await page.locator('[data-flex-groups]').fill('2');await page.locator('[data-flex-per-group]').fill('2');
    await page.locator('[data-flex-run]').click();
    await page.locator('#genericBody .tournament-insight-grid strong').filter({hasText:/^0\/2$/}).waitFor({timeout:12000});
    assert.equal(f.db.prepare('SELECT count(*) n FROM matches WHERE division_id=?').get(did).n,2);note('draw-two-groups');
    await page.locator('[data-center-referees]').click();await page.locator('#rName').fill('QA referee');
    const email='qa-'+tag;await page.locator('#rEmail').fill(email);await page.locator('#rPassword').fill(password);await page.locator('#saveReferee').click();
    await page.locator('#genericDialog').waitFor({state:'hidden'});refId=f.db.prepare('SELECT id FROM app_users WHERE email=?').get(email).id;
    const refContext=await browser.newContext({viewport:{width:cfg.width,height:900}});
    refContext.on('page',p=>{p.setDefaultTimeout(6000);p.on('pageerror',e=>errors.push(e.stack||e.message));p.on('dialog',d=>d.accept())});
    await refContext.route('**/api/**',async route=>{
      const r=route.request(),response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    const ref=await refContext.newPage();await login(ref,email);await ref.locator('.empty-ref').waitFor();note('new-referee-real-login');
    let scoredMatches=0;
    const scoreMatch=async match=>{
      await center();await page.locator(`[data-center-assign="${match.id}"]`).click();await page.locator('#detailRef').selectOption(refId);
      await page.locator('#saveAssignment').click();await page.locator('#genericDialog').waitFor({state:'hidden'});
      assert.equal(f.db.prepare('SELECT referee_user_id FROM matches WHERE id=?').get(match.id).referee_user_id,refId);
      await ref.goto(base+'/referee.html?match='+match.id);await ref.locator('#scoreSurface').waitFor();
      assert.match(await ref.locator('#refRules').innerText(),new RegExp('Chạm '+cfg.target));
      const firstMatch=scoredMatches++===0;
      const point=async side=>{
        const field=side==='A'?'current_score_a':'current_score_b',selector='#refScore'+side;
        const previous=f.db.prepare(`SELECT ${field} FROM matches WHERE id=?`).get(match.id)[field];
        await ref.locator(`[data-rally="${side}"]`).click();
        await ref.waitForFunction(([s,value])=>document.querySelector(s).textContent===String(value),[selector,previous+1]);
      };
      for(let game=0;game<Math.ceil(cfg.best/2);game++){
        const deuce=firstMatch&&game===0&&!cfg.mlp;
        if(deuce)for(let i=0;i<cfg.target-1;i++)await point('B');
        for(let i=0;i<cfg.target;i++){
          await point('A');
          if(cfg.mlp&&[9,18].includes(i+1))assert.match(await ref.locator('#legBanner').innerText(),new RegExp(i+1===9?'BC':'CA'));
        }
        if(deuce){assert.equal(await ref.locator('#finishMatchBtn').isDisabled(),true,'one-point margin must not finish a win-by-two game');await point('A')}
        if(game<Math.ceil(cfg.best/2)-1){await ref.locator('#finishSetBtn').click();await ref.waitForFunction(()=>document.querySelector('#refScoreA').textContent==='0')}
      }
      await ref.locator('#finishMatchBtn').click();await ref.locator('#scoreHint').filter({hasText:'Thắng trận'}).waitFor();
      const saved=f.db.prepare('SELECT * FROM matches WHERE id=?').get(match.id);assert.equal(saved.status,'completed');assert.equal(saved.winner_team_id,match.team_a_id);
    };
    for(const m of f.db.prepare('SELECT * FROM matches WHERE division_id=? ORDER BY id').all(did))await scoreMatch(m);
    note('referee-assignment-deuce-or-relay-and-complete-pools');
    await center();
    await verify('pools-do-not-finish-tournament',async()=>assert.equal(await page.locator(`.tour-card[data-open-tournament="${tid}"]`).count(),1,'the tournament must stay in the active list until knockout finishes'));
    await page.locator(`[data-top2-bracket="${did}"]`).click();
    await page.locator('#genericBody .tournament-insight-grid strong').filter({hasText:/^2\/5$/}).waitFor({timeout:10000});
    const brackets=f.db.prepare('SELECT * FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL').all(did);
    assert.equal(brackets.length,3);
    for(let round=0;round<3;round++){
      const ready=f.db.prepare("SELECT * FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL AND status='scheduled' AND team_a_id IS NOT NULL AND team_b_id IS NOT NULL ORDER BY round_no").all(did);
      if(!ready.length)break;for(const m of ready)await scoreMatch(m);
    }
    assert.equal(f.db.prepare("SELECT count(*) n FROM matches WHERE division_id=? AND status='completed'").get(did).n,5);note('auto-qualification-bracket-and-final');
    const publicPage=await context.newPage();await publicPage.goto(base+'/tournament.html?id='+tid);
    await publicPage.locator('.public-champion strong').waitFor();
    const final=f.db.prepare('SELECT m.winner_team_id,t.name FROM matches m JOIN teams t ON t.id=m.winner_team_id WHERE m.division_id=? AND m.round_no=2').get(did);
    assert.equal(await publicPage.locator('.public-champion strong').innerText(),final.name);
    await publicPage.screenshot({path:resolve(root,`ui-artifacts/lifecycle/${tag}-final.png`)});
    assert.deepEqual(errors,[]);note('public-final-and-no-browser-errors');await refContext.close();
  }catch(e){failures.push(`${tag} lifecycle: ${e.stack||e.message}`);console.error('FAIL',failures.at(-1));await page.screenshot({path:resolve(root,`ui-artifacts/lifecycle/${tag}-failure.png`)})}
  finally{await context.close();f.db.close()}
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
assert.deepEqual(failures,[]);
console.log('LIFECYCLE_UI_OK');
