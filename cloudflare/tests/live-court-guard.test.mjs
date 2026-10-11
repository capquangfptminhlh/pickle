import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import worker from '../src/index.js';
import {signSession} from '../src/auth.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function fixture(t,{differentCourts=false,sharedPlayer=false}={}){
  const f=await scoringFixture();t.after(()=>f.db.close());
  f.db.exec(`INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Court 1'),('court2','tour','Court 2');
    INSERT INTO app_users(id,email,display_name,role,password_hash,tournament_id_scope) VALUES('ref2','ref2@test.invalid','Second referee','referee','unused','tour');
    INSERT INTO teams(id,division_id,name) VALUES('d','division','D');
    UPDATE matches SET court_id='court' WHERE id='match';
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,referee_user_id) VALUES('second','division','c','d','court','ref2');`);
  if(differentCourts)f.db.exec("UPDATE matches SET court_id='court2' WHERE id='second'");
  if(sharedPlayer)f.db.exec(`INSERT INTO divisions(id,tournament_id,name) VALUES('sibling','tour','Other division');
    INSERT INTO teams(id,division_id,name) VALUES('x','sibling','X'),('y','sibling','Y');
    UPDATE matches SET division_id='sibling',team_a_id='x',team_b_id='y' WHERE id='second';
    INSERT INTO players(id,full_name) VALUES('shared','Shared player');
    INSERT INTO team_players(team_id,player_id) VALUES('a','shared'),('x','shared');`);
  f.tokens.ref2=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id='ref2'").get());
  f.request=async(path,body,method='PATCH',actor='admin')=>{
    const response=await worker.fetch(new Request('https://test.invalid'+path,{method,
      headers:{Authorization:'Bearer '+f.tokens[actor],'Content-Type':'application/json'},body:JSON.stringify(body)}),f.env);
    return {status:response.status,data:await response.json()};
  };
  f.read=id=>({...f.db.prepare('SELECT * FROM matches WHERE id=?').get(id)});
  f.saved=id=>({match:f.read(id),sets:f.db.prepare('SELECT * FROM match_sets WHERE match_id=? ORDER BY set_no').all(id),
    events:f.db.prepare('SELECT * FROM score_events WHERE match_id=? ORDER BY id').all(id),
    audits:f.db.prepare("SELECT * FROM audit_logs WHERE entity_type='match' AND entity_id=? ORDER BY id").all(id)});
  f.warmup=(id='match',actor='admin')=>f.request('/api/matches/'+id+'/court-state',{courtState:'warming_up'},'PATCH',actor);
  return f;
}

function busy(response,code='COURT_BUSY'){
  assert.equal(response.status,409,JSON.stringify(response.data));
  assert.equal(response.data.error,code);
}

for(const action of ['point','rally'])test('a second referee cannot '+action+' a different match on an occupied court',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,200);
  const before=f.saved('second'),broadcasts=f.controls.broadcasts.length;
  busy(await f.api(action,{side:'A',delta:1},'ref2','second'));
  assert.deepEqual(f.saved('second'),before,'the rejected start has no partial point, event, set or audit');
  assert.equal(f.controls.broadcasts.length,broadcasts,'rejected starts do not publish score updates');
});

test('two starts that read an empty court commit only one live match',async t=>{
  const f=await fixture(t),before=f.saved('second');let winner;
  f.controls.beforeBatch=async()=>{winner=await f.api('rally',{side:'A'},'ref')};
  busy(await f.api('point',{side:'A',delta:1},'ref2','second'));
  assert.equal(winner.status,200);
  assert.deepEqual(f.saved('second'),before);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM matches WHERE status='live' AND court_id='court'").get().n,1);
});

test('a court remains exclusive across divisions',async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO divisions(id,tournament_id,name) VALUES('sibling','tour','Other'); INSERT INTO teams(id,division_id,name) VALUES('x','sibling','X'),('y','sibling','Y'); UPDATE matches SET division_id='sibling',team_a_id='x',team_b_id='y' WHERE id='second'");
  assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,200);
  busy(await f.api('rally',{side:'A'},'ref2','second'));
});

test('independent matches can start on different courts',async t=>{
  const f=await fixture(t,{differentCourts:true});
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  assert.equal((await f.api('point',{side:'B',delta:1},'ref2','second')).status,200);
  assert.equal(f.read('match').status,'live');assert.equal(f.read('second').status,'live');
});

test('warmup occupies the court until its own match starts or leaves warmup',async t=>{
  const f=await fixture(t);
  assert.equal((await f.warmup()).status,200);
  const before=f.saved('second');busy(await f.api('point',{side:'A',delta:1},'ref2','second'));
  assert.deepEqual(f.saved('second'),before);
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200,'the match already warming up can start');
});

test('a live match prevents a second warmup with no timestamps or audit left behind',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  const before=f.saved('second'),broadcasts=f.controls.broadcasts.length;
  busy(await f.warmup('second','ref2'));
  assert.deepEqual(f.saved('second'),before);assert.equal(f.controls.broadcasts.length,broadcasts);
});

test('concurrent warmups reserve the court for only one match',async t=>{
  const f=await fixture(t),before=f.saved('match');let winner;
  f.controls.beforeBatch=async()=>{winner=await f.warmup('second','ref2')};
  busy(await f.warmup('match','ref'));
  assert.equal(winner.status,200);assert.deepEqual(f.saved('match'),before);
});

test('called and on-deck queues remain available behind a live match',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  for(const courtState of ['called','on_deck','scheduled']){
    const response=await f.request('/api/matches/second/court-state',{courtState},'PATCH','ref2');
    assert.equal(response.status,200);assert.equal(f.read('second').court_state,courtState);
  }
  busy(await f.warmup('second','ref2'));
});

test('finishing a match frees its court for the next referee',async t=>{
  const f=await fixture(t);
  f.db.exec("UPDATE divisions SET best_of=1 WHERE id='division'");
  assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,200);
  f.db.exec("UPDATE matches SET current_score_a=11 WHERE id='match'");
  assert.equal((await f.api('finish-set',{},'ref')).status,200);
  assert.equal(f.read('match').status,'completed');
  assert.equal((await f.api('rally',{side:'A'},'ref2','second')).status,200);
});

test('undoing completion cannot reopen a live match on an occupied court',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,200);
  assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]},'ref')).status,200);
  assert.equal((await f.api('rally',{side:'A'},'ref2','second')).status,200);
  const before=f.saved('match');busy(await f.api('undo',{},'ref'));
  assert.deepEqual(f.saved('match'),before,'completion and its undo history remain intact');
});

test('a live match cannot be moved to another occupied court',async t=>{
  const f=await fixture(t,{differentCourts:true});
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  assert.equal((await f.api('rally',{side:'A'},'ref2','second')).status,200);
  const before=f.saved('second');
  busy(await f.request('/api/matches/second/assignment',{courtId:'court'}));
  assert.deepEqual(f.saved('second'),before,'the rejected assignment audit rolls back');
});

test('a warmup match cannot be moved to an occupied court',async t=>{
  const f=await fixture(t,{differentCourts:true});
  assert.equal((await f.warmup()).status,200);assert.equal((await f.warmup('second')).status,200);
  const before=f.saved('second');busy(await f.request('/api/matches/second/assignment',{courtId:'court'}));
  assert.deepEqual(f.saved('second'),before);
});

test('direct inserts cannot add another live occupant',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,200);
  assert.throws(()=>f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,status) VALUES('third','division','c','d','court','live')"),/COURT_BUSY/);
});

test('an archival quick score can be saved while a court is occupied',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]},'ref2','second')).status,200);
  assert.equal(f.read('second').status,'completed');assert.equal(f.read('match').status,'live');
});

test('reset to the scheduled baseline stays reversible while another match is live',async t=>{
  const f=await fixture(t);
  assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,200);
  assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]},'ref')).status,200);
  assert.equal((await f.api('rally',{side:'A'},'ref2','second')).status,200);
  assert.equal((await f.api('reset',{},'ref')).status,200);assert.equal(f.read('match').status,'scheduled');
  assert.equal((await f.api('undo',{},'ref')).status,200);assert.equal(f.read('match').status,'completed');
});

test('reset and undo preserve a warmup baseline when its court is still free',async t=>{
  const f=await fixture(t);
  assert.equal((await f.warmup()).status,200);
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]},'ref')).status,200);
  assert.equal((await f.api('reset',{},'ref')).status,200);assert.equal(f.read('match').court_state,'warming_up');
  assert.equal((await f.api('undo',{},'ref')).status,200);assert.equal(f.read('match').status,'completed');
});

test('reset cannot restore warmup over another match already playing',async t=>{
  const f=await fixture(t);
  assert.equal((await f.warmup()).status,200);
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]},'ref')).status,200);
  assert.equal((await f.api('rally',{side:'A'},'ref2','second')).status,200);
  const before=f.saved('match');busy(await f.api('reset',{},'ref'));
  assert.deepEqual(f.saved('match'),before);
});

test('a roster player cannot play two live matches on different courts',async t=>{
  const f=await fixture(t,{differentCourts:true,sharedPlayer:true});
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  const before=f.saved('second');busy(await f.api('point',{side:'A',delta:1},'ref2','second'),'PLAYER_BUSY');
  assert.deepEqual(f.saved('second'),before);
});

test('simultaneous shared-player starts commit only one match',async t=>{
  const f=await fixture(t,{differentCourts:true,sharedPlayer:true}),before=f.saved('second');let winner;
  f.controls.beforeBatch=async()=>{winner=await f.api('rally',{side:'A'},'ref')};
  busy(await f.api('rally',{side:'A'},'ref2','second'),'PLAYER_BUSY');
  assert.equal(winner.status,200);assert.deepEqual(f.saved('second'),before);
});

test('a shared player may be called or on deck but cannot warm up on another court',async t=>{
  const f=await fixture(t,{differentCourts:true,sharedPlayer:true});
  assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);
  for(const courtState of ['called','on_deck'])assert.equal((await f.request('/api/matches/second/court-state',{courtState})).status,200);
  const before=f.saved('second');busy(await f.warmup('second'),'PLAYER_BUSY');assert.deepEqual(f.saved('second'),before);
});

test('a stale court-state change preserves a concurrent confirmed point',async t=>{
  const f=await fixture(t);let scored;
  f.controls.beforeBatch=async()=>{assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);scored=f.saved('match')};
  busy(await f.warmup(),'VERSION_CONFLICT');assert.deepEqual(f.saved('match'),scored);
});

test('the occupancy migration preserves preexisting duplicate live results',async t=>{
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  const migrations=new URL('../migrations/',import.meta.url),file='0015_live_court_guard.sql';
  for(const name of readdirSync(migrations).filter(name=>name.endsWith('.sql')&&name!==file).sort())db.exec(readFileSync(new URL(name,migrations),'utf8'));
  db.exec(`INSERT INTO tournaments(id,name,slug) VALUES('legacy','Legacy','legacy');
    INSERT INTO divisions(id,tournament_id,name) VALUES('legacy','legacy','Legacy');
    INSERT INTO courts(id,tournament_id,name) VALUES('legacy','legacy','Legacy');
    INSERT INTO matches(id,division_id,court_id,status,court_state,current_score_a) VALUES('legacy-a','legacy','legacy','live','live',3),('legacy-b','legacy','legacy','live','live',4);`);
  const before=db.prepare('SELECT * FROM matches ORDER BY id').all();
  assert.ok(readdirSync(migrations).includes(file),'the additive occupancy migration exists');
  db.exec(readFileSync(new URL(file,migrations),'utf8'));
  assert.deepEqual(db.prepare('SELECT * FROM matches ORDER BY id').all(),before);
  assert.doesNotThrow(()=>db.exec("UPDATE matches SET current_score_a=current_score_a+1 WHERE id='legacy-a'"),'existing matches can continue or finish without destructive cleanup');
  assert.throws(()=>db.exec("INSERT INTO matches(id,division_id,court_id,status) VALUES('legacy-c','legacy','legacy','live')"),/COURT_BUSY/);
  db.exec("UPDATE matches SET status='completed',court_state='done' WHERE id IN ('legacy-a','legacy-b')");
  assert.doesNotThrow(()=>db.exec("INSERT INTO matches(id,division_id,court_id,status) VALUES('legacy-c','legacy','legacy','live')"));
});
