import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

const timerFields=['timeout_side','timeout_started_at','timeout_ends_at'];
const clockValue=clock=>clock&&({side:clock.side,startedAt:clock.startedAt,endsAt:clock.endsAt});
const storedClock=m=>m.timeout_side&&({side:m.timeout_side,startedAt:m.timeout_started_at,endsAt:m.timeout_ends_at});
async function request(f,path,method='GET',body,actor='admin'){
  const response=await worker.fetch(new Request('https://test.invalid'+path,{method,
    headers:{Authorization:'Bearer '+f.tokens[actor],'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env);
  return {status:response.status,data:await response.json()};
}
async function startClock(f,side='A'){
  const r=await f.api('timeout',{side});
  assert.equal(r.status,200);
  assert.ok(r.data.timeoutClock,'standard timeout must return its persisted clock');
  return clockValue(r.data.timeoutClock);
}
function stripHistoricalClock(f,eventId,which='before'){
  const event=f.db.prepare('SELECT payload FROM score_events WHERE id=?').get(eventId);
  const payload=JSON.parse(event.payload);
  for(const field of timerFields)delete payload[which].match[field];
  f.db.prepare('UPDATE score_events SET payload=? WHERE id=?').run(JSON.stringify(payload),eventId);
}

for(const eventType of ['doubles','mixed_doubles','team'])for(const side of ['A','B']){
  test(`${eventType} rally retains selected ${side}-S2 when the serving side wins`,async()=>{
    const f=await scoringFixture();
    try{
      f.db.prepare("UPDATE divisions SET event_type=?,scoring_mode='rally' WHERE id='division'").run(eventType);
      const service=await f.api('service',{side,serverNumber:2});
      assert.equal(service.status,200);assert.equal(service.data.serverNumber,2);
      for(let i=0;i<2;i++){
        const rally=await f.api('rally',{side});
        assert.equal(rally.status,200);assert.equal(rally.data.servingSide,side);
        assert.equal(rally.data.serverNumber,2);
      }
      const receiver=side==='A'?'B':'A',changed=await f.api('rally',{side:receiver});
      assert.equal(changed.data.servingSide,receiver);assert.equal(changed.data.serverNumber,1);
      const undo=await f.api('undo');assert.equal(undo.status,200);
      assert.equal(undo.data.servingSide,side);assert.equal(undo.data.serverNumber,2);
    }finally{f.db.close()}
  });
}

test('singles still uses one server after service correction and rally',async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE divisions SET event_type='singles',scoring_mode='rally' WHERE id='division'");
    assert.equal((await f.api('service',{side:'B',serverNumber:2})).data.serverNumber,1);
    assert.equal((await f.api('rally',{side:'B'})).data.serverNumber,1);
  }finally{f.db.close()}
});

test('standard timeout persists exactly sixty seconds from server time and snapshots it',async()=>{
  const f=await scoringFixture();
  try{
    const before=Date.now(),r=await f.api('timeout',{side:'B',kind:'standard'}),after=Date.now();
    assert.equal(r.status,200);assert.ok(r.data.timeoutClock);
    const clock=r.data.timeoutClock;
    assert.equal(clock.side,'B');assert.equal(Date.parse(clock.endsAt)-Date.parse(clock.startedAt),60000);
    assert.ok(Date.parse(clock.startedAt)>=before&&Date.parse(clock.startedAt)<=after);
    assert.ok(Date.parse(clock.serverNow)>=before&&Date.parse(clock.serverNow)<=after);
    assert.deepEqual(storedClock(f.match()),clockValue(clock));
    assert.equal(r.data.timeouts.B,1);
    const payload=JSON.parse(f.db.prepare('SELECT payload FROM score_events ORDER BY id DESC LIMIT 1').get().payload);
    for(const field of timerFields)assert.equal(payload.before.match[field],null);
    assert.deepEqual(storedClock(payload.after.match),clockValue(clock));
  }finally{f.db.close()}
});

test('public, organizer, referee refresh and match mutations retain the original timeout deadline',async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'");
    const expected=await startClock(f,'B');
    for(const [path,actor] of [['/api/public/state','admin'],['/api/admin/state','organizer'],['/api/admin/state','ref']]){
      for(let i=0;i<2;i++){
        const state=await request(f,path,'GET',undefined,actor);assert.equal(state.status,200);
        const clock=state.data.matches.find(m=>m.id==='match').timeoutClock;
        assert.deepEqual(clockValue(clock),expected);assert.ok(Number.isFinite(Date.parse(clock.serverNow)));
      }
    }
    const assignment=await request(f,'/api/matches/match/assignment','PATCH',{refereeUserId:'ref'});
    assert.equal(assignment.status,200);assert.deepEqual(clockValue(assignment.data.timeoutClock),expected);
    assert.ok(Number.isFinite(Date.parse(assignment.data.timeoutClock.serverNow)));
    const service=await f.api('service',{side:'A',serverNumber:2});
    assert.deepEqual(clockValue(service.data.timeoutClock),expected);
    assert.deepEqual(storedClock(f.match()),expected);
  }finally{f.db.close()}
});

test('expired clocks retain their deadline on refresh rather than restarting a timeout',async()=>{
  const f=await scoringFixture();
  try{
    await startClock(f);
    const endsAt=new Date(Date.now()-5000).toISOString(),startedAt=new Date(Date.parse(endsAt)-60000).toISOString();
    f.db.prepare("UPDATE matches SET timeout_started_at=?,timeout_ends_at=? WHERE id='match'").run(startedAt,endsAt);
    const state=await request(f,'/api/admin/state');assert.equal(state.status,200);
    const match=state.data.matches.find(m=>m.id==='match');
    assert.deepEqual(clockValue(match.timeoutClock),{side:'A',startedAt,endsAt});
    assert.ok(Date.parse(match.timeoutClock.serverNow)>Date.parse(endsAt));assert.equal(match.timeouts.A,1);
    assert.equal(f.match().timeout_ends_at,endsAt);
  }finally{f.db.close()}
});

test('medical timeout records its count without inventing an ordinary clock',async()=>{
  const f=await scoringFixture();
  try{
    const medical=await f.api('timeout',{side:'A',kind:'medical'});
    assert.equal(medical.status,200);assert.equal(medical.data.medicalTimeouts.A,1);
    assert.equal(medical.data.timeoutClock,null);
    for(const field of timerFields)assert.equal(f.match()[field],null);
    const clock=await startClock(f,'B');
    const other=await f.api('timeout',{side:'B',kind:'medical'});
    assert.equal(other.status,200);assert.deepEqual(clockValue(other.data.timeoutClock),clock);
    assert.equal(other.data.medicalTimeouts.B,1);
  }finally{f.db.close()}
});

for(const action of ['point','rally']){
  test(`${action} resumes play and Undo restores the exact preceding timeout clock`,async()=>{
    const f=await scoringFixture();
    try{
      const clock=await startClock(f,'B');
      const resumed=await f.api(action,{side:'A',delta:1});
      assert.equal(resumed.status,200);assert.equal(resumed.data.timeoutClock,null);
      for(const field of timerFields)assert.equal(f.match()[field],null);
      const undo=await f.api('undo');assert.equal(undo.status,200);
      assert.deepEqual(clockValue(undo.data.timeoutClock),clock);assert.deepEqual(storedClock(f.match()),clock);
    }finally{f.db.close()}
  });
}

for(const [action,body] of [['finish-set',{}],['finish',{}],['quick-score',{sets:[[11,3],[11,4]]}],['special-result',{winnerTeamId:'a',reason:'injury'}]]){
  test(`${action} clears the clock and Undo reopens the prior state with its deadline`,async()=>{
    const f=await scoringFixture();
    try{
      if(action==='finish-set'||action==='finish')f.db.exec("UPDATE matches SET status='live',current_score_a=11,current_score_b=5 WHERE id='match'");
      if(action==='finish')f.db.exec("INSERT INTO match_sets VALUES('first','match',1,11,3,1)");
      const status=f.match().status,clock=await startClock(f);
      const finished=await f.api(action,body);assert.equal(finished.status,200);assert.equal(finished.data.timeoutClock,null);
      for(const field of timerFields)assert.equal(f.match()[field],null);
      const undo=await f.api('undo');assert.equal(undo.status,200);assert.equal(f.match().status,status);
      assert.deepEqual(clockValue(undo.data.timeoutClock),clock);
    }finally{f.db.close()}
  });
}

test('reset clears the timeout and Undo reset restores its clock and scoreboard',async()=>{
  const f=await scoringFixture();
  try{
    await f.api('point',{side:'A',delta:1});const clock=await startClock(f,'B');
    const reset=await f.api('reset');assert.equal(reset.status,200);assert.equal(reset.data.timeoutClock,null);
    assert.deepEqual(reset.data.current,[0,0]);assert.deepEqual(reset.data.timeouts,{A:0,B:0});
    const undo=await f.api('undo');assert.equal(undo.status,200);
    assert.deepEqual(clockValue(undo.data.timeoutClock),clock);assert.deepEqual(undo.data.current,[1,0]);
    assert.equal(undo.data.timeouts.B,1);
    const timeoutUndo=await f.api('undo');assert.equal(timeoutUndo.status,200);assert.equal(timeoutUndo.data.timeoutClock,null);
  }finally{f.db.close()}
});

test('older full Undo snapshots missing timer fields clear the current clock',async()=>{
  const f=await scoringFixture();
  try{
    await startClock(f,'A');await startClock(f,'B');
    const id=f.db.prepare('SELECT id FROM score_events ORDER BY id DESC LIMIT 1').get().id;
    stripHistoricalClock(f,id);
    const undo=await f.api('undo');assert.equal(undo.status,200);assert.equal(undo.data.timeoutClock,null);
    for(const field of timerFields)assert.equal(f.match()[field],null);
  }finally{f.db.close()}
});

test('older reset baselines missing only timer fields remain resettable',async()=>{
  const f=await scoringFixture();
  try{
    await f.api('point',{side:'A',delta:1});await startClock(f,'B');
    const id=f.db.prepare('SELECT id FROM score_events ORDER BY id LIMIT 1').get().id;
    stripHistoricalClock(f,id);
    const reset=await f.api('reset');assert.equal(reset.status,200);assert.equal(reset.data.timeoutClock,null);
    assert.deepEqual(reset.data.current,[0,0]);assert.equal(reset.data.timeouts.B,0);
  }finally{f.db.close()}
});

test('legacy partial point history cannot inherit an unrelated current timer during Undo',async()=>{
  const f=await scoringFixture();
  try{
    await f.api('point',{side:'A',delta:1});await f.api('point',{side:'A',delta:1});await startClock(f,'B');
    f.db.exec(`DELETE FROM score_events WHERE event_type='CORRECTION';
      UPDATE score_events SET payload='{"before":[0,0],"after":[1,0]}' WHERE id=1;
      UPDATE score_events SET payload='{"before":[1,0],"after":[2,0]}' WHERE id=2;`);
    const undo=await f.api('undo');assert.equal(undo.status,200);
    assert.equal(undo.data.current[0],1);assert.equal(undo.data.timeoutClock,null);
  }finally{f.db.close()}
});

test('another standard timeout consumes the existing allowance and Undo restores the earlier clock',async()=>{
  const f=await scoringFixture();
  try{
    const clock=await startClock(f,'B'),second=await f.api('timeout',{side:'B'});
    assert.equal(second.status,200);assert.equal(second.data.timeouts.B,2);assert.equal(second.data.timeoutClock.side,'B');
    const before=f.match(),limited=await f.api('timeout',{side:'B'});
    assert.equal(limited.status,409);assert.equal(limited.data.error,'TIMEOUT_LIMIT');assert.deepEqual(f.match(),before);
    const undo=await f.api('undo');assert.equal(undo.status,200);assert.equal(undo.data.timeouts.B,1);
    assert.deepEqual(clockValue(undo.data.timeoutClock),clock);
  }finally{f.db.close()}
});

test('stale or failed timeout writes leave the existing clock and its audit unchanged',async()=>{
  const f=await scoringFixture();
  try{
    await startClock(f,'A');const before=f.match(),eventCount=f.db.prepare('SELECT count(*) n FROM score_events').get().n;
    const stale=await f.api('timeout',{side:'B',expectedVersion:1});assert.equal(stale.status,409);assert.deepEqual(f.match(),before);
    f.db.exec("CREATE TRIGGER fail_clock_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'TEST_TIMEOUT_FAILURE'); END;");
    const failed=await f.api('timeout',{side:'B'});assert.equal(failed.status,500);assert.deepEqual(f.match(),before);
    assert.equal(f.db.prepare('SELECT count(*) n FROM score_events').get().n,eventCount);
  }finally{f.db.close()}
});
