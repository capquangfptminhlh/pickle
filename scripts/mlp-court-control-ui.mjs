import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {scoringFixture} from '../cloudflare/tests/helpers/scoring-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const artifacts=resolve(root,'ui-artifacts/mlp-court-control');await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://localhost').pathname;
  if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
  const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(full)]||'application/octet-stream');
  res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(resolveListen=>server.listen(0,'127.0.0.1',resolveListen));
const base=`http://127.0.0.1:${server.address().port}`;

function seedMlpDay(f){
  f.db.exec(`
    INSERT INTO tournaments(id,name,slug,start_at,status,public_visible) VALUES
      ('future-empty','Giải tương lai chưa xếp sân','future-empty','2026-10-15T06:00:00Z','registration',1),
      ('historical-walkover','Giải cũ đã xử thắng','historical-walkover','2026-10-20T06:00:00Z','completed',1);
    INSERT INTO divisions(id,tournament_id,name,event_type,format) VALUES
      ('historical-division','historical-walkover','Nội dung cũ','team','pool_to_knockout');
    INSERT INTO courts(id,tournament_id,name,sort_order) VALUES
      ('historical-court','historical-walkover','Sân lịch sử',1);
    UPDATE divisions SET name='MLP Đồng đội',event_type='team',points_to_win=27,best_of=1,win_by_two=0,
      scoring_mode='rally',relay_segment_points=9,relay_team_size=3,final_point_on_serve=1 WHERE id='division';
    UPDATE teams SET name='Zelda / An / Mai',group_code='A' WHERE id='a';
    UPDATE teams SET name='Linh / Bảo / Chi',group_code='A' WHERE id='b';
    INSERT INTO players(id,full_name) VALUES
      ('za','Zelda'),('an','An'),('mai','Mai'),('linh','Linh'),('bao','Bảo'),('chi','Chi'),
      ('uyen','Uyên'),('van','Vân'),('xuan','Xuân');
    UPDATE players SET skill_level='A' WHERE id IN ('za','linh','uyen');
    UPDATE players SET skill_level='B+' WHERE id IN ('an','bao','van');
    UPDATE players SET skill_level='C' WHERE id IN ('mai','chi','xuan');
    INSERT INTO teams(id,division_id,name,group_code) VALUES('legacy-free','division','Uyên / Vân / Xuân','B');
    INSERT INTO team_players(team_id,player_id) VALUES
      ('a','mai'),('a','za'),('a','an'),('b','chi'),('b','linh'),('b','bao'),
      ('legacy-free','xuan'),('legacy-free','uyen'),('legacy-free','van');
    INSERT INTO courts(id,tournament_id,name,sort_order) VALUES
      ('court-1','tour','Sân 1',1),('court-2','tour','Sân 2',2),('court-3','tour','Sân 3',3),('court-4','tour','Sân 4',4);
    UPDATE matches SET court_id='court-1',stage='Bảng A',status='live',started_at='2026-10-10T01:00:00Z',current_score_a=0,current_score_b=0 WHERE id='match';
    INSERT INTO matches(id,division_id,court_id,referee_user_id,team_a_id,team_b_id,stage,scheduled_at,status) VALUES
      ('next-1','division','court-1','ref','a','b','Bảng A','2026-10-10T02:00:00Z','scheduled'),
      ('match-2','division','court-2','ref','a','b','Bảng A','2026-10-10T01:00:00Z','ready'),
      ('match-3','division','court-3','ref','a','b','Bảng A','2026-10-10T01:10:00Z','scheduled'),
      ('match-4','division','court-4','ref','a','b','Bảng A','2026-10-10T01:20:00Z','scheduled'),
      ('unassigned','division',NULL,'ref','a','b','Bảng A','2026-10-10T01:30:00Z','scheduled');
    INSERT INTO matches(id,division_id,court_id,team_a_id,team_b_id,winner_team_id,stage,status,court_state) VALUES
      ('historical-match','historical-division','historical-court','a','b','a','Bảng A','walkover','called');
  `);
}

async function wireApi(page,f){
  await page.route('**/api/**',async route=>{
    const request=route.request();
    const response=await worker.fetch(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),f.env);
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
}

const browser=await chromium.launch(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{});
try{
  const f=await scoringFixture();seedMlpDay(f);
  const admin=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  const errors=[];admin.on('pageerror',error=>errors.push(error.message));
  await admin.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.admin);await wireApi(admin,f);
  await admin.goto(base+'/admin.html');
  await admin.waitForFunction(()=>document.querySelector('#content .club-home-hero'));
  await admin.evaluate(()=>switchAdminPage('tournaments'));
  await admin.locator('[data-manage-tournament="tour"]').first().click();
  await admin.locator('[data-tournament-court-grid]').waitFor();
  assert.equal(await admin.locator('[data-court-card]').count(),4,'the control center shows every active court');
  for(let index=1;index<=4;index++)assert.match(await admin.locator(`[data-court-card][data-court-id="court-${index}"]`).innerText(),new RegExp(`SÂN ${index}`,'i'));
  const first=admin.locator('[data-court-card][data-court-id="court-1"]');
  assert.match(await first.innerText(),/ĐANG ĐẤU/i);assert.match(await first.innerText(),/TIẾP THEO/i);assert.match(await first.innerText(),/Cặp AB: Zelda \+ An/);
  assert.match(await first.innerText(),/Đội: Zelda \/ An \/ Mai/);
  assert.match(await admin.locator('[data-unassigned-matches]').innerText(),/1 trận chưa xếp sân/);
  await admin.screenshot({path:resolve(artifacts,'admin-four-courts.png'),fullPage:true});
  await first.locator('[data-court-score="match"]').click();
  assert.equal((await admin.locator('#teamAName').innerText()).trim(),'Cặp AB · Zelda + An');
  assert.equal((await admin.locator('#teamBName').innerText()).trim(),'Cặp AB · Linh + Bảo');
  assert.match(await admin.locator('#relayLeg').innerText(),/Tiếp theo A: BC: An \+ Mai vs B: BC: Bảo \+ Chi/);
  f.db.exec("UPDATE matches SET current_score_a=9 WHERE id='match'");await admin.evaluate(()=>refresh({keepDialog:true}));
  assert.equal((await admin.locator('#teamAName').innerText()).trim(),'Cặp BC · An + Mai');
  assert.match(await admin.locator('#relayLeg').innerText(),/Tiếp theo A: CA: Mai \+ Zelda vs B: CA: Chi \+ Linh/);
  f.db.exec("UPDATE matches SET current_score_a=18 WHERE id='match'");await admin.evaluate(()=>refresh({keepDialog:true}));
  assert.equal((await admin.locator('#teamAName').innerText()).trim(),'Cặp CA · Mai + Zelda');
  f.db.exec("UPDATE matches SET current_score_a=0 WHERE id='match'");
  await admin.locator('#scoreDialog [aria-label="Đóng"]').click();
  await admin.locator('#genericDialog [aria-label="Đóng hộp thoại"]').click();
  await admin.evaluate(()=>switchAdminPage('players'));
  assert.equal(await admin.evaluate(()=>state.teamLineupSources['legacy-free']),'inferred');
  await admin.evaluate(()=>{const update=API.updateTeam;API.updateTeam=(id,payload)=>{window.__lastTeamPayload=payload;return update(id,payload)}});
  await admin.locator('[data-crud-edit-team="legacy-free"]').click();
  await admin.locator('#crudSaveTeam').click();
  await admin.locator('#crudSaveTeam').waitFor({state:'hidden'});
  assert.deepEqual((await admin.evaluate(()=>window.__lastTeamPayload)).playerIds,['uyen','van','xuan'],'the team editor submits the inferred order for persistence');
  assert.deepEqual(f.db.prepare("SELECT player_id FROM team_players WHERE team_id='legacy-free' ORDER BY slot_no").all().map(row=>row.player_id),['uyen','van','xuan'],'saving an inferred lineup persists the displayed A/B/C order');

  const board=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  board.on('pageerror',error=>errors.push(error.message));await board.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.admin);await wireApi(board,f);
  await board.goto(base+'/court-board.html');await board.locator('.tv-court').first().waitFor();
  assert.equal(await board.locator('#tournamentSelect').inputValue(),'tour','TV board defaults to the tournament with live court activity');
  assert.equal(await board.locator('.tv-court').count(),4,'the default TV board shows all courts from the active tournament');
  const boardText=await board.locator('.tv-court').first().innerText();assert.match(boardText,/Cặp AB · Zelda \+ An/);assert.match(boardText,/Đội: Zelda \/ An \/ Mai/);
  await board.close();

  f.db.exec("UPDATE matches SET status='completed',court_state='done',winner_team_id='a' WHERE id='match'");
  const terminalBoard=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});
  terminalBoard.on('pageerror',error=>errors.push(error.message));await terminalBoard.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.admin);await wireApi(terminalBoard,f);
  await terminalBoard.goto(base+'/court-board.html');await terminalBoard.locator('.tv-court').first().waitFor();
  assert.equal(await terminalBoard.locator('#tournamentSelect').inputValue(),'tour','terminal walkovers do not outrank a tournament with pending assigned matches');
  await terminalBoard.close();

  const referee=await browser.newPage({viewport:{width:375,height:900},serviceWorkers:'block'});
  referee.on('pageerror',error=>errors.push(error.message));
  await referee.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.ref);await wireApi(referee,f);
  await referee.goto(base+'/referee.html?match=match');await referee.locator('#scoreSurface').waitFor();
  assert.equal((await referee.locator('#refTeamA').innerText()).trim(),'Zelda / An / Mai','a completed match shows the full team');
  assert.equal((await referee.locator('#refTeamB').innerText()).trim(),'Linh / Bảo / Chi');
  assert.equal(await referee.locator('#legBanner').isVisible(),false,'a completed match has no active relay pair');
  assert.equal(await referee.locator('[data-rally="A"]').isDisabled(),true,'completed matches cannot award rally points');
  f.db.exec("UPDATE matches SET status='live',court_state='live',winner_team_id=NULL WHERE id='match'");
  await referee.locator('#refreshBtn').click();
  await referee.locator('#refTeamA').filter({hasText:'Cặp AB · Zelda + An'}).waitFor();
  assert.equal((await referee.locator('#refTeamA').innerText()).trim(),'Cặp AB · Zelda + An');
  assert.equal((await referee.locator('#refTeamB').innerText()).trim(),'Cặp AB · Linh + Bảo');
  assert.match(await referee.locator('#legBanner').innerText(),/Tiếp theo A: BC: An \+ Mai vs B: BC: Bảo \+ Chi/);
  f.db.exec("UPDATE matches SET current_score_b=9 WHERE id='match'");await referee.locator('#refreshBtn').click();
  await referee.locator('#refTeamA').filter({hasText:'Cặp BC · An + Mai'}).waitFor();
  f.db.exec("UPDATE matches SET current_score_b=18 WHERE id='match'");await referee.locator('#refreshBtn').click();
  await referee.locator('#refTeamA').filter({hasText:'Cặp CA · Mai + Zelda'}).waitFor();
  assert.ok(await referee.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'375px referee screen does not overflow');
  await referee.screenshot({path:resolve(artifacts,'referee-ca-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  await admin.close();await referee.close();f.db.close();
}finally{
  await browser.close();await new Promise(resolveClose=>server.close(resolveClose));
}
console.log('MLP_COURT_CONTROL_UI_OK');
