import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function fixture(t){
  const f=await scoringFixture();t.after(()=>f.db.close());
  f.db.exec(`INSERT INTO divisions(id,tournament_id,name) VALUES('sibling','tour','Other doubles');
    INSERT INTO courts(id,tournament_id,name) VALUES('c1','tour','Court 1'),('c2','tour','Court 2');
    INSERT INTO teams(id,division_id,name) VALUES('x','sibling','X'),('y','sibling','Y');
    INSERT INTO players(id,full_name) VALUES('shared','Shared'),('spare','Spare'),('fresh','Fresh');
    INSERT INTO team_players(team_id,player_id,slot_no) VALUES('a','shared',1),('x','spare',1);
    UPDATE matches SET court_id='c1' WHERE id='match';
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id) VALUES('second','sibling','x','y','c2');`);
  f.request=async(path,body,method='PATCH')=>{
    const response=await worker.fetch(new Request('https://test.invalid'+path,{method,
      headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:JSON.stringify(body)}),f.env);
    return {status:response.status,data:await response.json()};
  };
  f.warmup=()=>f.request('/api/matches/second/court-state',{courtState:'warming_up'});
  f.saved=()=>({team:f.db.prepare("SELECT * FROM teams WHERE id='x'").get(),
    roster:f.db.prepare("SELECT * FROM team_players WHERE team_id='x' ORDER BY player_id").all(),
    audit:f.db.prepare("SELECT * FROM audit_logs WHERE entity_id='x' ORDER BY id").all()});
  return f;
}

for(const kind of ['replace','append'])test('warmup roster '+kind+' cannot introduce an already live player',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('rally',{side:'A'})).status,200);
  assert.equal((await f.warmup()).status,200);
  const before=f.saved(),broadcasts=f.controls.broadcasts.length;
  const r=kind==='replace'?await f.request('/api/teams/x',{name:'Changed',playerIds:['spare','shared']}):
    await f.request('/api/teams/x/players',{playerId:'shared'},'POST');
  assert.equal(r.status,409,JSON.stringify(r.data));assert.equal(r.data.error,'TEAM_ROSTER_LOCKED');
  assert.deepEqual(f.saved(),before);assert.equal(f.controls.broadcasts.length,broadcasts);
});

test('a warmup entering between roster validation and commit rejects the entire roster batch',async t=>{
  const f=await fixture(t),before=f.saved();
  f.controls.beforeBatch=async()=>assert.equal((await f.warmup()).status,200);
  const r=await f.request('/api/teams/x',{name:'Changed',playerIds:['spare','fresh']});
  assert.equal(r.status,409,JSON.stringify(r.data));assert.equal(r.data.error,'TEAM_ROSTER_LOCKED');
  assert.deepEqual(f.saved(),before);
});

test('direct changes cannot remove or reorder a warming-up lineup',async t=>{
  const f=await fixture(t);assert.equal((await f.warmup()).status,200);const before=f.saved();
  for(const sql of ["DELETE FROM team_players WHERE team_id='x'","UPDATE team_players SET player_id='fresh' WHERE team_id='x'",
    "UPDATE team_players SET slot_no=2 WHERE team_id='x'","UPDATE team_players SET team_id='y' WHERE team_id='x'"]){
    assert.throws(()=>f.db.exec(sql),/TEAM_ROSTER_LOCKED/);assert.deepEqual(f.saved(),before);
  }
});

test('called queues remain editable and leaving warmup permits roster changes',async t=>{
  const f=await fixture(t);
  assert.equal((await f.request('/api/matches/second/court-state',{courtState:'called'})).status,200);
  assert.equal((await f.request('/api/teams/x',{playerIds:['spare','fresh']})).status,200);
  assert.equal((await f.warmup()).status,200);
  assert.equal((await f.request('/api/matches/second/court-state',{courtState:'scheduled'})).status,200);
  assert.equal((await f.request('/api/teams/x',{playerIds:['fresh','spare']})).status,200);
});

test('basic team information remains editable during warmup',async t=>{
  const f=await fixture(t);assert.equal((await f.warmup()).status,200);
  const r=await f.request('/api/teams/x',{name:'Corrected team name'});
  assert.equal(r.status,200);assert.equal(f.saved().team.name,'Corrected team name');
});
