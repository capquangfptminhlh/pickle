import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {scoringFixture} from '../cloudflare/tests/helpers/scoring-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'ui-artifacts/mlp-championship');
await mkdir(out,{recursive:true});
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
  const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const f=await scoringFixture(),errors=[],evidence={teams:16,players:48,pools:4,poolMatches:24,knockoutMatches:12,relayBoundaries:[],champions:{},productionWrites:0};
const row=id=>f.db.prepare('SELECT * FROM matches WHERE id=?').get(id);
const name=id=>f.db.prepare('SELECT name FROM teams WHERE id=?').get(id).name;
async function api(path,body,actor='ref',expected=200){
  const response=await worker.fetch(new Request(base+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+f.tokens[actor],'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env);
  const data=await response.json();assert.equal(response.status,expected,`${path}: ${JSON.stringify(data)}`);return data;
}
async function score(id){
  await api(`/api/matches/${id}/relay-draw`,{expectedVersion:row(id).version});
  const orders=[row(id).relay_order_a,row(id).relay_order_b,row(id).relay_drawn_at];
  for(let i=0;i<27;i++)await api(`/api/matches/${id}/rally`,{side:'A',expectedVersion:row(id).version});
  await api(`/api/matches/${id}/finish`,{expectedVersion:row(id).version});
  assert.equal(row(id).winner_team_id,row(id).team_a_id);
  assert.deepEqual([row(id).relay_order_a,row(id).relay_order_b,row(id).relay_drawn_at],orders);
}
const page=await browser.newPage({viewport:{width:375,height:900},serviceWorkers:'block'});
page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.ref);
await page.route('**/api/**',async route=>{
  const r=route.request(),response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
});
async function click(selector,action){
  const response=page.waitForResponse(r=>r.url().endsWith('/'+action)&&r.request().method()==='POST');
  await page.locator(selector).click();assert.equal((await response).status(),200);
}
async function verifyPair(id,points){
  const m=row(id);
  const leg=Math.min(2,Math.floor(points/9)),codes={};
  for(const [side,teamId] of [['A',m.team_a_id],['B',m.team_b_id]]){
    const code=JSON.parse(m['relay_order_'+side.toLowerCase()])[leg];codes[side]=code;
    const text=await page.locator('#refTeam'+side).innerText();
    const entered=f.db.prepare('SELECT p.skill_level,p.full_name FROM team_players tp JOIN players p ON p.id=tp.player_id WHERE tp.team_id=? ORDER BY tp.slot_no').all(teamId);
    const roles=new Set(entered.map(p=>p.skill_level)).size===3?Object.fromEntries(entered.map(p=>[p.skill_level,p.full_name])):Object.fromEntries(entered.map((p,i)=>[['A','B','C'][i],p.full_name]));
    for(const role of code)assert.ok(text.includes(roles[role]),`${side} ${code}: ${text}`);
    assert.ok(text.includes('Cặp '+code),`${side} uses its own drawn code`);
    assert.equal(await page.locator('#refRoster'+side+' [data-player-slot]').count(),3);
  }
  assert.equal(await page.locator('#refScoreA').innerText(),String(points));
  evidence.relayBoundaries.push({id,points,codes});
}
async function playUI(id){
  await page.goto(base+'/referee.html?match='+id);await page.locator('#scoreSurface').waitFor();
  assert.equal(await page.locator('[data-rally="A"]').isDisabled(),true,'new MLP must draw before scoring');
  const version=row(id).version;await click('#refRelayDrawButton','relay-draw');
  await page.waitForFunction(()=>!document.querySelector('[data-rally="A"]').disabled);
  assert.equal(row(id).version,version+1);
  const orders=[row(id).relay_order_a,row(id).relay_order_b,row(id).relay_drawn_at];
  for(const order of orders.slice(0,2))assert.deepEqual(JSON.parse(order).sort(),['AB','BC','CA']);
  assert.ok(orders[2]);
  await verifyPair(id,0);
  await page.reload();await page.locator('#scoreSurface').waitFor();await verifyPair(id,0);
  for(let i=1;i<=26;i++){
    await click('[data-rally="A"]','rally');await page.waitForFunction(n=>document.querySelector('#refScoreA')?.textContent===String(n),i);
    if(i===9||i===18)await verifyPair(id,i);
  }
  await click('[data-service="B"][data-server="2"]','service');
  await page.waitForFunction(()=>document.querySelector('[data-service="B"][data-server="2"]')?.getAttribute('aria-pressed')==='true');
  await click('[data-rally="A"]','rally');assert.equal(row(id).current_score_a,26,'Receiving final rally only takes serve');
  await page.waitForFunction(()=>document.querySelector('[data-service="A"][data-server="1"]')?.getAttribute('aria-pressed')==='true');
  await click('[data-rally="A"]','rally');await page.waitForFunction(()=>document.querySelector('#refScoreA')?.textContent==='27');
  await click('#finishMatchBtn','finish');await page.waitForFunction(()=>document.querySelector('#refGameLabel')?.textContent==='KẾT QUẢ TRẬN');
  assert.equal(await page.locator('#refTeamA').innerText(),name(row(id).team_a_id),'Completed game shows the whole team, not a misleading active AB pair');
  assert.equal(await page.locator('#refScoreA').innerText(),'27');assert.equal(await page.locator('#refScoreB').innerText(),'0');
  assert.equal(await page.locator('#legBanner').isHidden(),true,'Completed game cannot announce an active relay leg');
  assert.equal(await page.locator('[data-playing="true"]').count(),0,'Completed roster cannot mark players as currently playing');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#refGameLabel')?.textContent==='KẾT QUẢ TRẬN');
  assert.equal(await page.locator('#refScoreA').innerText(),'27');
  assert.deepEqual([row(id).relay_order_a,row(id).relay_order_b,row(id).relay_drawn_at],orders);
}
try{
  f.db.exec("DELETE FROM matches;DELETE FROM teams;UPDATE tournaments SET public_visible=1 WHERE id='tour';UPDATE divisions SET event_type='team',format='pool_to_knockout',best_of=1,points_to_win=27,win_by_two=0,scoring_mode='rally',relay_segment_points=9,relay_team_size=3,final_point_on_serve=1,advance_count=2,third_place_match=1,series_b_enabled=1,series_b_third_place_match=1 WHERE id='division'");
  for(let i=1;i<=4;i++)f.db.prepare("INSERT INTO courts(id,tournament_id,name,sort_order) VALUES(?,'tour',?,?)").run('court'+i,'Sân '+i,i);
  for(const group of ['A','B','C','D']){
    for(let rank=1;rank<=4;rank++){
      const id=group+rank,order=rank%2?['C','A','B']:['A','B','C'],labels={A:'An',B:'Bình',C:'Chi'};
      f.db.prepare("INSERT INTO teams(id,division_id,name,seed,group_code) VALUES(?,'division',?,?,?)").run(id,order.map(role=>id+' '+labels[role]).join(' / '),rank,group);
      for(const [i,role] of order.entries()){
        f.db.prepare('INSERT INTO players(id,full_name,skill_level) VALUES(?,?,?)').run(id+role,id+' '+labels[role],rank%2?role:'B');
        f.db.prepare('INSERT INTO team_players(team_id,player_id,slot_no) VALUES(?,?,?)').run(id,id+role,i+1);
      }
    }
    for(let a=1;a<=4;a++)for(let b=a+1;b<=4;b++)f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,referee_user_id,court_id) VALUES(?,'division',?,?,?,'ref',?)").run('pool-'+group+a+b,group+a,group+b,'Bảng '+group,'court'+(['A','B','C','D'].indexOf(group)+1));
  }
  await playUI('pool-A12');
  console.log('MLP_POOL_UI_OK');
  for(const m of f.db.prepare("SELECT id FROM matches WHERE status<>'completed' ORDER BY id").all())await score(m.id);
  const generated=await api('/api/divisions/division/generate-bracket',{},'admin');assert.equal(generated.created,12);
  f.db.exec("UPDATE matches SET referee_user_id='ref',court_id='court1' WHERE bracket_slot IS NOT NULL");
  for(const series of ['A','B']){
    for(let round=1;round<=3;round++)for(const m of f.db.prepare("SELECT * FROM matches WHERE bracket_series=? AND round_no=? AND bracket_slot NOT LIKE '%3RD%' ORDER BY bracket_slot").all(series,round)){
      assert.ok(m.team_a_id&&m.team_b_id,'Advancing teams are assigned before their match');
      if(m.stage==='Chung kết'&&series==='B')await playUI(m.id);else await score(m.id);
    }
    const final=f.db.prepare("SELECT * FROM matches WHERE bracket_series=? AND stage='Chung kết'").get(series);
    const semis=f.db.prepare("SELECT * FROM matches WHERE bracket_series=? AND stage='Bán kết'").all(series);
    const bronze=f.db.prepare("SELECT * FROM matches WHERE bracket_series=? AND bracket_slot LIKE '%3RD%'").get(series);
    assert.deepEqual(new Set([bronze.team_a_id,bronze.team_b_id]),new Set(semis.map(m=>m.winner_team_id===m.team_a_id?m.team_b_id:m.team_a_id)));
    await score(bronze.id);evidence.champions[series]={id:final.winner_team_id,name:name(final.winner_team_id),match:final.id};
  }
  for(const width of [375,1440]){
    await page.setViewportSize({width,height:900});
    await page.goto(base+'/tournament.html?id=tour');await page.locator('#tourBracket [data-bracket-series="B"]').waitFor();
    for(const series of ['A','B']){
      const branch=page.locator(`#tourBracket [data-bracket-series="${series}"]`),champ=evidence.champions[series];
      assert.equal(await branch.locator('.public-champion strong').innerText(),champ.name);
      const card=branch.locator(`[data-bracket-match="${champ.match}"]`);assert.match(await card.innerText(),/KẾT THÚC/);assert.equal(await card.locator('.bracket-team.win span').innerText(),champ.name);
      assert.match(await card.innerText(),/Set 1: 27–0/,'Bracket shows the point result, not only 1–0 game wins');
    }
    assert.equal(await page.locator('#tourBracket [data-score-match]').count(),0);
    await page.locator('#tourBracket [data-bracket-series="B"]').scrollIntoViewIfNeeded();await page.screenshot({path:resolve(out,`champions-${width}.png`)});
    await page.goto(base+'/match.html?id='+evidence.champions.B.match);await page.locator('#matchCard').waitFor();
    assert.equal(await page.locator('#matchScoreA').innerText(),'27');assert.equal(await page.locator('#matchScoreB').innerText(),'0');
    assert.equal(await page.locator('#matchTeamA').innerText(),evidence.champions.B.name);assert.match(await page.locator('#matchStage').innerText(),/Serie B/);
    assert.match(await page.locator('#serveInfo').innerText(),/thắng trận/);
    await page.evaluate(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.admin);
    await page.goto(base+'/admin.html');await page.waitForFunction(()=>typeof refresh==='function'&&state.matches?.length===36);await page.evaluate(()=>{page='scores';return refresh()});
    const champ=evidence.champions.B;await page.locator(`[data-score-match="${champ.match}"]`).click();await page.locator('#scoreDialog').waitFor();
    assert.equal(await page.locator('#teamAName').innerText(),name(row(champ.match).team_a_id));
    assert.equal(await page.locator('#scoreA').innerText(),'27');assert.equal(await page.locator('#scoreB').innerText(),'0');assert.equal(await page.locator('#relayLeg').isHidden(),true);
    assert.match(await page.locator('#serveStatus').innerText(),/thắng trận/);assert.equal(await page.locator('[data-service-side]:enabled').count(),0);
    assert.equal(await page.locator('#serveStatus').evaluate(el=>el.previousElementSibling.textContent),'KẾT QUẢ');
    await page.screenshot({path:resolve(out,`completed-admin-${width}.png`)});
  }
  assert.equal(f.db.prepare("SELECT count(*) n FROM matches WHERE status='completed'").get().n,36);
  assert.deepEqual(errors,[]);await writeFile(resolve(out,'evidence.json'),JSON.stringify(evidence,null,2));console.log('MLP_CHAMPIONSHIP_UI_OK',JSON.stringify(evidence));
}catch(error){await page.screenshot({path:resolve(out,'failure.png'),fullPage:true});throw error}
finally{await browser.close();f.db.close();await new Promise(r=>server.close(r))}
