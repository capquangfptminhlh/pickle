import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

for(const body of ['null','[]','"bad"','5','true','{"side":'])for(const [path,method] of [['/api/matches/match/point','POST'],['/api/matches/match/undo','POST'],['/api/tournaments/tour','PATCH'],['/api/divisions/division/generate-round-robin','POST'],['/api/matches/match','DELETE'],['/api/divisions/division/generate-bracket','POST']]){
 test(`${method} ${path} rejects invalid object body ${body} without mutation`,async()=>{
  const f=await scoringFixture();try{
   assert.equal((await f.api('point',{side:'A',delta:1})).status,200);
   const snapshot=()=>({matches:f.db.prepare('SELECT * FROM matches ORDER BY id').all().map(x=>({...x})),tournament:{...f.db.prepare("SELECT * FROM tournaments WHERE id='tour'").get()},events:f.db.prepare('SELECT * FROM score_events').all().map(x=>({...x})),audit:f.db.prepare('SELECT * FROM audit_logs').all().map(x=>({...x}))});
   const before=snapshot(),response=await worker.fetch(new Request('https://test.invalid'+path,{method,headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body}),f.env);
   assert.equal(response.status,400);assert.equal((await response.json()).error,'INVALID_JSON');assert.deepEqual(snapshot(),before);
  }finally{f.db.close()}
 });
}
