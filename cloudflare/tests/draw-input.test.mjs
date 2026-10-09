import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function fixture(){
 const f=await scoringFixture();
 f.db.exec("DELETE FROM matches; INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Sân'); INSERT INTO teams(id,division_id,name) VALUES('d','division','D'),('e','division','E'),('f','division','F')");
 const draw=async(body,action='run-draw')=>{
  const response=await worker.fetch(new Request('https://test.invalid/api/divisions/division/'+action,{method:action==='draw-config'?'PUT':'POST',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:JSON.stringify({mode:'seeded',groupCount:2,teamsPerGroup:3,advanceCount:2,courtIds:['court'],...body})}),f.env);
  return {status:response.status,data:await response.json()};
 };
 const snapshot=()=>Object.fromEntries(['divisions','teams','matches','app_settings','audit_logs','division_draw_revisions'].map(t=>[t,f.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all().map(x=>({...x}))]));
 return {...f,draw,snapshot};
}

for(const action of ['run-draw','draw-config'])for(const field of ['groupCount','teamsPerGroup','advanceCount'])for(const value of ['bad',2.5,{},[],true,1e30,'Infinity'])test(`${action}: ${field} rejects non-integer draw input ${JSON.stringify(value)} without saving`,async()=>{
 const f=await fixture();try{
  const before=f.snapshot(),result=await f.draw({[field]:value},action);assert.equal(result.status,400);assert.equal(result.data.error,'INVALID_DRAW_OPTIONS');assert.deepEqual(f.snapshot(),before);
 }finally{f.db.close()}
});

test('draw accepts numeric strings and produces six unique pairings',async()=>{
 const f=await fixture();try{
  const result=await f.draw({groupCount:'2',teamsPerGroup:'3',advanceCount:'2'});assert.equal(result.status,200);assert.equal(result.data.created,6);
  assert.equal(new Set(f.snapshot().matches.map(m=>[m.team_a_id,m.team_b_id].sort().join(':'))).size,6);
 }finally{f.db.close()}
});

test('draw configuration accepts numeric strings as integers',async()=>{
 const f=await fixture();try{
  const result=await f.draw({groupCount:'2',teamsPerGroup:'3',advanceCount:'2'},'draw-config');assert.equal(result.status,200);
  assert.equal(result.data.groupCount,2);assert.equal(result.data.teamsPerGroup,3);assert.equal(result.data.advanceCount,2);
 }finally{f.db.close()}
});

test('optional draw counts retain existing defaults when absent, null or empty',async()=>{
 const f=await fixture();try{
  const result=await f.draw({groupCount:undefined,teamsPerGroup:null,advanceCount:''},'draw-config');assert.equal(result.status,200);
  assert.equal(result.data.groupCount,2);assert.equal(result.data.teamsPerGroup,4);assert.equal(result.data.advanceCount,2);
 }finally{f.db.close()}
});

test('integer draw counts retain existing minimum and maximum normalization',async()=>{
 const f=await fixture();try{
  const result=await f.draw({groupCount:-5,teamsPerGroup:99,advanceCount:99},'draw-config');assert.equal(result.status,200);
  assert.equal(result.data.groupCount,1);assert.equal(result.data.teamsPerGroup,32);assert.equal(result.data.advanceCount,16);
 }finally{f.db.close()}
});
