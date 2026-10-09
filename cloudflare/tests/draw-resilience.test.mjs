import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function fixture(){
 const f=await scoringFixture();
 f.db.exec("DELETE FROM matches; UPDATE tournaments SET public_visible=1 WHERE id='tour'; INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Sân thử'); INSERT INTO teams(id,division_id,name) VALUES('d','division','D'),('e','division','E'),('f','division','F')");
 const draw=async()=>{
  const response=await worker.fetch(new Request('https://test.invalid/api/divisions/division/run-draw',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:JSON.stringify({mode:'seeded',groupCount:2,teamsPerGroup:3,advanceCount:2,courtIds:['court']})}),f.env);
  return {status:response.status,data:await response.json()};
 };
 const snapshot=()=>Object.fromEntries(['divisions','teams','matches','match_sets','score_events','app_settings','audit_logs','division_draw_revisions'].map(t=>[t,f.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all().map(x=>({...x}))]));
 return {...f,draw,snapshot};
}

test('concurrent draws commit one complete six-match schedule',async()=>{
 const f=await fixture();try{
  const prepare=f.env.DB.prepare.bind(f.env.DB);let arrivals=0,release;const gate=new Promise(r=>release=r);
  f.env.DB.prepare=sql=>{
   const wrap=s=>({...s,bind:(...args)=>wrap(s.bind(...args)),all:async()=>{const result=await s.all();if(sql.startsWith('SELECT id,status,winner_team_id FROM matches')){if(++arrivals===2)release();await gate}return result}});
   return wrap(prepare(sql));
  };
  const results=await Promise.all([f.draw(),f.draw()]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const matches=f.snapshot().matches;assert.equal(matches.length,6);
  assert.equal(new Set(matches.map(m=>[m.team_a_id,m.team_b_id].sort().join(':'))).size,6);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='RUN_GROUP_DRAW'").get().n,1);
 }finally{f.db.close()}
});

test('late draw audit failure rolls back groups, matches, settings and division rules',async()=>{
 const f=await fixture();try{
  f.db.exec("CREATE TRIGGER fail_draw_audit BEFORE INSERT ON audit_logs WHEN NEW.action='RUN_GROUP_DRAW' BEGIN SELECT RAISE(ABORT,'TEST_DRAW_AUDIT_FAILURE'); END;");
  const before=f.snapshot();assert.equal((await f.draw()).status,500);assert.deepEqual(f.snapshot(),before);
 }finally{f.db.close()}
});

test('starting a pool match after draw prechecks prevents replacement of its scoring history',async()=>{
 const f=await fixture();try{
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status,version) VALUES('existing','division','a','b','Bảng A','scheduled',1)");
  const before=f.snapshot();f.controls.beforeBatch=async()=>f.db.exec("UPDATE matches SET status='live',current_score_a=1,started_at='2026-10-08T00:00:00Z',version=2 WHERE id='existing'");
  const result=await f.draw();assert.equal(result.status,409);assert.equal(result.data.error,'GROUP_STAGE_ALREADY_STARTED');
  assert.equal(f.snapshot().matches.length,1);assert.equal(f.snapshot().matches[0].current_score_a,1);
  assert.deepEqual(f.snapshot().teams,before.teams);assert.deepEqual(f.snapshot().app_settings,before.app_settings);
 }finally{f.db.close()}
});

test('realtime delivery failure does not report a committed draw as failed',async()=>{
 const f=await fixture();try{
  f.env.ROOMS.get=()=>({fetch:async(_url,options)=>{const message=JSON.parse(options.body);if(message.event==='draw:complete')throw new Error('TEST_DRAW_DELIVERY_FAILURE');return new Response(null,{status:204})}});
  const result=await f.draw();assert.equal(result.status,200);assert.equal(result.data.created,6);assert.equal(f.snapshot().matches.length,6);
 }finally{f.db.close()}
});

for(const [history,sql] of [
 ['set history',"INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('set','existing',1,11,4,1)"],
 ['undone score history',"INSERT INTO score_events(match_id,event_type,match_version,undone_at) VALUES('existing','POINT',2,'2026-10-09T00:00:00Z')"]
])test(`a cancelled match with late ${history} cannot be erased by a draw`,async()=>{
 const f=await fixture();try{
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status,version) VALUES('existing','division','a','b','Bảng A','cancelled',1)");
  let before;f.controls.beforeBatch=async()=>{f.db.exec(sql);before=f.snapshot()};
  const result=await f.draw();assert.equal(result.status,409);assert.equal(result.data.error,'GROUP_STAGE_ALREADY_STARTED');assert.deepEqual(f.snapshot(),before);
 }finally{f.db.close()}
});
