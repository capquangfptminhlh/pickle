import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function fixture(){
  const f=await scoringFixture();
  f.db.exec("DELETE FROM matches; UPDATE teams SET group_code='A'; INSERT INTO teams(id,division_id,name,group_code) VALUES('d','division','D','B'),('e','division','E','B'),('f','division','F','B')");
  const call=async(action,body={},actor='admin',divisionId='division',method='POST')=>{
    const response=await worker.fetch(new Request('https://test.invalid/api/divisions/'+divisionId+'/'+action,{
      method,headers:{...(actor?{Authorization:'Bearer '+f.tokens[actor]}:{}),'Content-Type':'application/json'},
      ...(method==='GET'?{}:{body:JSON.stringify(body)})
    }),f.env);
    return {status:response.status,data:await response.json()};
  };
  const snapshot=()=>Object.fromEntries(['divisions','teams','matches','match_sets','score_events','app_settings','division_draw_revisions','division_draw_reset_guards','audit_logs']
    .map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all().map(row=>({...row}))]));
  const addMatch=()=>f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status,version) VALUES('match','division','a','b','Bảng A','scheduled',1)");
  return {...f,call,snapshot,addMatch};
}

for(const groupCount of [2.5,0,27,-1,'bad','Infinity',1e30,{},[],true,false,null,'','   '])test('legacy seeding rejects invalid group count '+JSON.stringify(groupCount)+' without writing',async()=>{
  const f=await fixture();try{
    const before=f.snapshot(),result=await f.call('auto-seed-groups',{groupCount});
    assert.equal(result.status,400);assert.equal(result.data.error,'INVALID_DRAW_OPTIONS');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const [body,count] of [[{},2],[{groupCount:1},1],[{groupCount:'2'},2],[{groupCount:26},26]])test('legacy seeding accepts '+JSON.stringify(body)+' and audits the assignments',async()=>{
  const f=await fixture();try{
    const result=await f.call('auto-seed-groups',body,'organizer');assert.equal(result.status,200);assert.equal(result.data.groups,count);
    assert.deepEqual(f.snapshot().teams.map(t=>t.group_code),Array.from({length:6},(_,i)=>String.fromCharCode(65+i%count)));
    const log=f.snapshot().audit_logs.find(row=>row.action==='AUTO_SEED_GROUPS');assert.ok(log);assert.equal(log.actor_user_id,'organizer');
    assert.equal(log.entity_type,'division');assert.equal(log.entity_id,'division');
    const after=JSON.parse(log.after_data);assert.equal(after.groupCount,count);assert.equal(after.assignments.length,6);
    assert.ok(f.controls.broadcasts.some(message=>message.event==='public:state'));
  }finally{f.db.close()}
});

test('legacy seeding requires an explicit reset before changing an existing schedule',async()=>{
  const f=await fixture();try{
    f.addMatch();const before=f.snapshot(),result=await f.call('auto-seed-groups',{groupCount:2});
    assert.equal(result.status,409);assert.equal(result.data.error,'GROUP_DRAW_RESET_REQUIRED');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

const historyCases=[
  ['a point',async f=>assert.equal((await f.api('point',{side:'A',delta:1})).status,200)],
  ['a point followed by undo',async f=>{
    assert.equal((await f.api('point',{side:'A',delta:1})).status,200);assert.equal((await f.api('undo')).status,200);
    assert.equal(f.match().current_score_a,0);assert.equal(f.match().status,'scheduled');
  }],
  ['a saved set with an empty scoreboard',f=>f.db.exec("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('set','match',1,11,3,1)")],
  ['a completed match',f=>f.db.exec("UPDATE matches SET status='completed',winner_team_id='a' WHERE id='match'")],
  ['a walkover without scores',f=>f.db.exec("UPDATE matches SET status='walkover' WHERE id='match'")],
  ['a started match with an empty scoreboard',f=>f.db.exec("UPDATE matches SET started_at='2026-10-11T00:00:00Z' WHERE id='match'")],
  ['a pending match with scores',f=>f.db.exec("UPDATE matches SET current_score_b=1 WHERE id='match'")],
  ['a cancelled match with an undone event',f=>f.db.exec("UPDATE matches SET status='cancelled' WHERE id='match'; INSERT INTO score_events(match_id,event_type,match_version,undone_at) VALUES('match','POINT',2,'2026-10-11T00:00:00Z')")],
  ['a cancelled match with set history',f=>f.db.exec("UPDATE matches SET status='cancelled' WHERE id='match'; INSERT INTO match_sets(id,match_id,set_no,score_a,score_b) VALUES('set','match',1,11,3)")],
  ['a cancelled match with a completion timestamp',f=>f.db.exec("UPDATE matches SET status='cancelled',completed_at='2026-10-11T00:00:00Z' WHERE id='match'")]
];
for(const action of ['auto-seed-groups','generate-round-robin'])for(const [history,prepare] of historyCases)test(action+' refuses '+history+' without changing groups or matches',async()=>{
  const f=await fixture();try{
    f.addMatch();await prepare(f);const before=f.snapshot(),result=await f.call(action,{groupCount:2});
    assert.equal(result.status,409);assert.equal(result.data.error,action==='auto-seed-groups'?'GROUP_DRAW_RESET_REQUIRED':'GROUP_STAGE_ALREADY_STARTED');
    assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const [stage,slot] of [['Vòng bảng','SE-R1-M1'],['Tứ kết',null],['Bán kết',null],['Chung kết',null]])test('round robin refuses an existing knockout '+stage+' / '+slot,async()=>{
  const f=await fixture();try{
    f.db.prepare("INSERT INTO matches(id,division_id,stage,bracket_slot,status) VALUES('bracket','division',?,?,'scheduled')").run(stage,slot);
    const before=f.snapshot(),result=await f.call('generate-round-robin');assert.equal(result.status,409);assert.equal(result.data.error,'BRACKET_ALREADY_EXISTS');
    assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('round robin preserves an unplayed schedule and fills each missing pairing once with an audit',async()=>{
  const f=await fixture();try{
    f.addMatch();const existing=f.match(),result=await f.call('generate-round-robin',{},'organizer');assert.equal(result.status,200);assert.equal(result.data.created,5);
    assert.deepEqual(f.match(),existing);assert.equal(f.snapshot().matches.length,6);
    assert.equal(new Set(f.snapshot().matches.map(m=>[m.team_a_id,m.team_b_id].sort().join(':'))).size,6);
    const log=f.snapshot().audit_logs.find(row=>row.action==='GENERATE_ROUND_ROBIN');assert.ok(log);assert.equal(log.actor_user_id,'organizer');assert.equal(JSON.parse(log.after_data).created,5);
    const again=await f.call('generate-round-robin');assert.equal(again.status,200);assert.equal(again.data.created,0);assert.equal(f.snapshot().matches.length,6);
  }finally{f.db.close()}
});

test('an explicit reset permits seeding and generation after a played schedule',async()=>{
  const f=await fixture();try{
    f.addMatch();assert.equal((await f.api('point',{side:'A',delta:1})).status,200);
    const preview=await f.call('reset-draw',{},'organizer','division','GET');assert.equal(preview.status,200);
    assert.equal((await f.call('reset-draw',{confirmation:'QUAY LAI',expectedToken:preview.data.token},'organizer')).status,200);
    assert.equal((await f.call('auto-seed-groups',{groupCount:2},'organizer')).status,200);
    const result=await f.call('generate-round-robin',{},'organizer');assert.equal(result.status,200);assert.equal(result.data.created,6);
    assert.ok(f.snapshot().matches.every(match=>match.current_score_a===0&&match.current_score_b===0&&match.status==='scheduled'));
  }finally{f.db.close()}
});

const lateChanges=[
  ['a new match',"INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage) VALUES('late','division','a','c','Bảng A')"],
  ['changed groups',"UPDATE teams SET group_code='C' WHERE id='a'"],
  ['a new team',"INSERT INTO teams(id,division_id,name) VALUES('late','division','Late')"],
  ['a withdrawn team',"UPDATE teams SET status='withdrawn' WHERE id='a'"]
];
for(const action of ['auto-seed-groups','generate-round-robin'])for(const [change,sql] of lateChanges)test(action+' rejects '+change+' arriving before its batch atomically',async()=>{
  const f=await fixture();try{
    let before;f.controls.beforeBatch=async()=>{f.db.exec(sql);before=f.snapshot()};
    const result=await f.call(action,{groupCount:2});assert.equal(result.status,409);assert.equal(result.data.error,'DRAW_RESET_CONFLICT');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const [change,prepare] of historyCases)test('round robin rejects late '+change+' atomically',async()=>{
  const f=await fixture();try{
    f.addMatch();let before;f.controls.beforeBatch=async()=>{await prepare(f);before=f.snapshot()};
    const result=await f.call('generate-round-robin');assert.equal(result.status,409);assert.equal(result.data.error,'DRAW_RESET_CONFLICT');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('round robin rejects a knockout arriving after the plan was read',async()=>{
  const f=await fixture();try{
    let before;f.controls.beforeBatch=async()=>{
      f.db.exec("INSERT INTO matches(id,division_id,stage,bracket_slot) VALUES('late','division','Chung kết','SE-R1-M1')");before=f.snapshot();
    };
    const result=await f.call('generate-round-robin');assert.equal(result.status,409);assert.equal(result.data.error,'DRAW_RESET_CONFLICT');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const [action,auditAction] of [['auto-seed-groups','AUTO_SEED_GROUPS'],['generate-round-robin','GENERATE_ROUND_ROBIN']])test(action+' rolls back its changes when the audit cannot be saved',async()=>{
  const f=await fixture();try{
    f.db.exec("CREATE TRIGGER fail_group_audit BEFORE INSERT ON audit_logs WHEN NEW.action='"+auditAction+"' BEGIN SELECT RAISE(ABORT,'TEST_GROUP_AUDIT_FAILURE'); END;");
    const before=f.snapshot(),result=await f.call(action,{groupCount:2});assert.equal(result.status,500);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('concurrent round robin plans commit one complete schedule',async()=>{
  const f=await fixture();try{
    const first=await f.call('auto-seed-groups',{groupCount:2});assert.equal(first.status,200);
    let second;f.controls.beforeBatch=async()=>{second=await f.call('generate-round-robin')};
    const result=await f.call('generate-round-robin');assert.deepEqual([result.status,second.status].sort(),[200,409]);
    assert.equal(f.snapshot().matches.length,6);assert.equal(f.snapshot().audit_logs.filter(row=>row.action==='GENERATE_ROUND_ROBIN').length,1);
  }finally{f.db.close()}
});

for(const action of ['auto-seed-groups','generate-round-robin'])for(const actor of [null,'ref'])test(action+' rejects '+(actor||'anonymous')+' without writes',async()=>{
  const f=await fixture();try{
    const before=f.snapshot();assert.equal((await f.call(action,{groupCount:2},actor)).status,actor?403:401);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});
