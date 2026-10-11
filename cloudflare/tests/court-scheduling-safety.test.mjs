import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scheduleDivisionCourts} from '../src/court-scheduling.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

const base='2026-10-11T01:00:00.000Z';
const at=minutes=>new Date(Date.parse(base)+minutes*60000).toISOString();

async function fixture(t,planningTime=at(-60)){
  t.mock.method(Date,'now',()=>Date.parse(planningTime));
  const f=await scoringFixture();t.after(()=>f.db.close());
  f.db.exec(`UPDATE tournaments SET start_at='${base}' WHERE id='tour';
    INSERT INTO courts(id,tournament_id,name,sort_order) VALUES('court','tour','Court 1',1);
    INSERT INTO teams(id,division_id,name) VALUES('d','division','D');
    INSERT INTO divisions(id,tournament_id,name) VALUES('sibling','tour','Other division');
    INSERT INTO teams(id,division_id,name) VALUES('x','sibling','X'),('y','sibling','Y');`);
  f.read=id=>({...f.db.prepare('SELECT * FROM matches WHERE id=?').get(id)});
  f.reservation=(id='reserved',time=base)=>f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,scheduled_at) VALUES(?,'sibling','x','y','court',?)").run(id,time);
  f.schedule=()=>scheduleDivisionCourts(f.env,{id:'admin'},'division','tour');
  f.endpoint=async()=>{
    const response=await worker.fetch(new Request('https://test.invalid/api/divisions/division/auto-schedule-courts',{
      method:'POST',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:'{}'
    }),f.env);
    return {status:response.status,data:await response.json()};
  };
  f.audits=()=>f.db.prepare("SELECT * FROM audit_logs WHERE action='AUTO_SCHEDULE'").all();
  return f;
}

test('remaining matches are scheduled from the current planning time after tournament start',async t=>{
  const f=await fixture(t,at(120));await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(120));
});

test('a mid-day live overrun and shared-player rest are measured from planning time',async t=>{
  const f=await fixture(t,at(120));
  f.db.exec("INSERT INTO courts(id,tournament_id,name,sort_order) VALUES('court2','tour','Court 2',2); INSERT INTO players(id,full_name) VALUES('shared','Shared'); INSERT INTO team_players(team_id,player_id) VALUES('a','shared'),('x','shared'); UPDATE divisions SET minimum_rest_minutes=25,match_slot_minutes=30 WHERE id='sibling'");
  f.reservation();f.db.prepare("UPDATE matches SET status='live',court_state='live',started_at=? WHERE id='reserved'").run(base);
  const live=f.read('reserved');await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(175));
  assert.deepEqual(f.read('reserved'),live);
});

test('actual warmup retains a court after its old planned slot has elapsed',async t=>{
  const f=await fixture(t,at(120));f.reservation();
  f.db.prepare("UPDATE matches SET court_state='warming_up',warmup_at=? WHERE id='reserved'").run(at(119));
  const warmup=f.read('reserved');await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(140));
  assert.deepEqual(f.read('reserved'),warmup);
});

test('actual warmup protects shared-player rest even when another court is free',async t=>{
  const f=await fixture(t,at(120));
  f.db.exec("INSERT INTO courts(id,tournament_id,name,sort_order) VALUES('court2','tour','Court 2',2); INSERT INTO players(id,full_name) VALUES('shared','Shared'); INSERT INTO team_players(team_id,player_id) VALUES('a','shared'),('x','shared'); UPDATE divisions SET minimum_rest_minutes=25,match_slot_minutes=30 WHERE id='sibling'");
  f.reservation();f.db.prepare("UPDATE matches SET court_state='warming_up',warmup_at=? WHERE id='reserved'").run(at(119));
  const warmup=f.read('reserved');await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(175));
  assert.deepEqual(f.read('reserved'),warmup);
});

test('actual warmup occupies the current court while preserving a later planned reservation',async t=>{
  const f=await fixture(t,at(120));f.reservation('reserved',at(180));
  f.db.prepare("UPDATE matches SET court_state='warming_up',warmup_at=? WHERE id='reserved'").run(at(119));
  await f.schedule();assert.equal(f.read('match').scheduled_at,at(200));
});

test('mid-day scheduling preserves remaining rest after an actual completion',async t=>{
  const f=await fixture(t,at(120));
  f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,completed_at) VALUES('finished','division','a','c','completed',?)").run(at(115));
  await f.schedule();assert.equal(f.read('match').scheduled_at,at(130));
});

test('a future tournament start remains the earliest planning time',async t=>{
  const f=await fixture(t,at(-120));await f.schedule();
  assert.equal(f.read('match').scheduled_at,base);
});

test('a division avoids another division reservation on the same court',async t=>{
  const f=await fixture(t);f.reservation();const reserved=f.read('reserved');
  const result=await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(20));
  assert.equal(f.read('match').court_id,'court');
  assert.deepEqual(f.read('reserved'),reserved);
  assert.deepEqual(result,{ok:true,updated:1,assigned:1,courts:1,minRestMinutes:15,matchSlotMinutes:20});
  assert.equal(f.audits().length,1);
});

test('a shared roster player receives the stricter rest period across divisions',async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO courts(id,tournament_id,name,sort_order) VALUES('court2','tour','Court 2',2); INSERT INTO players(id,full_name) VALUES('shared','Shared player'); INSERT INTO team_players(team_id,player_id) VALUES('a','shared'),('x','shared'); UPDATE divisions SET minimum_rest_minutes=25,match_slot_minutes=30 WHERE id='sibling'");
  f.reservation();await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(55));
});

test('a later reservation leaves an earlier empty interval available',async t=>{
  const f=await fixture(t);f.reservation('reserved',at(120));await f.schedule();
  assert.equal(f.read('match').scheduled_at,base);
});

test('rest also separates a candidate from a future shared-player reservation',async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO courts(id,tournament_id,name) VALUES('court2','tour','Court 2'); INSERT INTO players(id,full_name) VALUES('shared','Shared'); INSERT INTO team_players(team_id,player_id) VALUES('a','shared'),('x','shared')");
  f.reservation('reserved',at(25));await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(60));
});

test('a rest constraint cannot shift a candidate into a longer court reservation',async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO courts(id,tournament_id,name,active) VALUES('inactive','tour','Reserved elsewhere',0); INSERT INTO divisions(id,tournament_id,name,minimum_rest_minutes) VALUES('third','tour','Third',80); INSERT INTO teams(id,division_id,name) VALUES('p','third','P'),('q','third','Q'); INSERT INTO players(id,full_name) VALUES('shared','Shared'); INSERT INTO team_players(team_id,player_id) VALUES('a','shared'),('p','shared'); UPDATE divisions SET match_slot_minutes=180 WHERE id='sibling'");
  f.reservation('long-court',at(60));
  f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,scheduled_at) VALUES('player-match','third','p','q','inactive',?)").run(at(80));
  await f.schedule();assert.equal(f.read('match').scheduled_at,at(240));
});

for(const state of ['called','on_deck','warming_up','live','started','sets','events'])test('scheduling preserves a match with '+state,async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,scheduled_at) VALUES('pending','division','c','d','court','2026-10-11T00:00:00Z'); UPDATE matches SET court_id='court',scheduled_at='2026-10-11T01:00:00Z' WHERE id='match'");
  if(['called','on_deck','warming_up','live'].includes(state))f.db.prepare('UPDATE matches SET court_state=? WHERE id=\'match\'').run(state);
  if(state==='live')f.db.exec("UPDATE matches SET status='live',started_at='2026-10-11T01:00:00Z' WHERE id='match'");
  if(state==='started')f.db.exec("UPDATE matches SET started_at='2026-10-11T01:00:00Z' WHERE id='match'");
  if(state==='sets')f.db.exec("INSERT INTO match_sets VALUES('old-set','match',1,0,0,0)");
  if(state==='events')f.db.exec("INSERT INTO score_events(match_id,actor_user_id,event_type,match_version,undone_at) VALUES('match','ref','UNDO',1,'2026-10-11T00:30:00Z')");
  const before=f.read('match');const result=await f.schedule();
  assert.deepEqual(f.read('match'),before);assert.equal(result.updated,1);
  assert.equal(f.read('pending').scheduled_at,at(20));
});

test('untimed uncalled queue assignments do not occupy every future slot',async t=>{
  const f=await fixture(t);f.reservation('reserved',null);await f.schedule();
  assert.equal(f.read('match').scheduled_at,base);
});

test('a called match without a timestamp reserves a finite slot',async t=>{
  const f=await fixture(t);f.reservation('reserved',null);f.db.exec("UPDATE matches SET court_state='called' WHERE id='reserved'");await f.schedule();
  assert.equal(f.read('match').scheduled_at,at(20));
});

test('a cancelled unplayed reservation releases its old court booking',async t=>{
  const f=await fixture(t);f.reservation();f.db.exec("UPDATE matches SET status='cancelled' WHERE id='reserved'");
  await f.schedule();assert.equal(f.read('match').scheduled_at,base);
});

test('a live match with a historical start still occupies the timetable anchor',async t=>{
  const f=await fixture(t);f.reservation('reserved',at(-60));
  f.db.prepare("UPDATE matches SET status='live',court_state='live',started_at=? WHERE id='reserved'").run(at(-60));
  const before=f.read('reserved');await f.schedule();
  assert.deepEqual(f.read('reserved'),before);assert.equal(f.read('match').scheduled_at,at(20));
});

test('completed matches use the actual finish time for participant rest',async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,completed_at) VALUES('finished','division','a','c','completed','2026-10-11T01:15:00Z')");
  await f.schedule();assert.equal(f.read('match').scheduled_at,at(30));
});

test('equal creation timestamps use match and court identifiers deterministically',async t=>{
  const f=await fixture(t);
  f.db.exec("UPDATE matches SET id='z-match',created_at='2026-10-11T00:00:00Z'; INSERT INTO matches(id,division_id,team_a_id,team_b_id,created_at) VALUES('a-match','division','c','d','2026-10-11T00:00:00Z')");
  await f.schedule();assert.equal(f.read('a-match').scheduled_at,base);assert.equal(f.read('z-match').scheduled_at,at(20));
});

test('a later match update failure rolls back all assignments and audit',async t=>{
  const f=await fixture(t);
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,created_at) VALUES('second','division','c','d','2099-01-01'); CREATE TRIGGER reject_second_schedule BEFORE UPDATE OF court_id ON matches WHEN NEW.id='second' BEGIN SELECT RAISE(ABORT,'TEST_WRITE_FAILURE'); END");
  const before=[f.read('match'),f.read('second')];
  await assert.rejects(f.schedule(),/TEST_WRITE_FAILURE/);
  assert.deepEqual([f.read('match'),f.read('second')],before);assert.equal(f.audits().length,0);
  assert.equal(f.db.prepare('SELECT COUNT(*) AS n FROM division_draw_reset_guards').get().n,0);
});

test('an audit failure rolls back the complete schedule',async t=>{
  const f=await fixture(t);
  f.db.exec("CREATE TRIGGER reject_schedule_audit BEFORE INSERT ON audit_logs WHEN NEW.action='AUTO_SCHEDULE' BEGIN SELECT RAISE(ABORT,'TEST_AUDIT_FAILURE'); END");
  const before=f.read('match');await assert.rejects(f.schedule(),/TEST_AUDIT_FAILURE/);
  assert.deepEqual(f.read('match'),before);assert.equal(f.audits().length,0);
});

test('concurrent scoring rejects the stale plan and preserves the confirmed point',async t=>{
  const f=await fixture(t);let scored;
  f.controls.beforeBatch=async()=>{assert.equal((await f.api('rally',{side:'A'},'ref')).status,200);scored=f.read('match')};
  await assert.rejects(f.schedule(),e=>e.status===409&&e.message==='COURT_SCHEDULE_CONFLICT');
  assert.deepEqual(f.read('match'),scored);assert.equal(f.read('match').current_score_a,1);assert.equal(f.audits().length,0);
});

for(const change of ['time','court-state','insert','roster','rules','court'])test('a concurrent '+change+' change rejects a tournament reservation snapshot',async t=>{
  const f=await fixture(t);f.reservation('reserved',at(90));
  f.db.exec("INSERT INTO players(id,full_name) VALUES('shared','Shared'); INSERT INTO team_players(team_id,player_id) VALUES('x','shared')");
  const before=f.read('match');
  f.controls.beforeBatch=async()=>{
    if(change==='time')f.db.exec("UPDATE matches SET scheduled_at='2026-10-11T01:00:00Z' WHERE id='reserved'");
    if(change==='court-state')f.db.exec("UPDATE matches SET court_state='called' WHERE id='reserved'");
    if(change==='insert')f.reservation('new-reservation',base);
    if(change==='roster')f.db.exec("INSERT INTO team_players(team_id,player_id) VALUES('a','shared')");
    if(change==='rules')f.db.exec("UPDATE divisions SET match_slot_minutes=45 WHERE id='sibling'");
    if(change==='court')f.db.exec("UPDATE courts SET active=0 WHERE id='court'");
  };
  await assert.rejects(f.schedule(),e=>e.status===409&&e.message==='COURT_SCHEDULE_CONFLICT');
  assert.deepEqual(f.read('match'),before);assert.equal(f.audits().length,0);
});

test('the Worker schedule endpoint uses tournament court reservations',async t=>{
  const f=await fixture(t);f.reservation();
  const result=await f.endpoint();assert.equal(result.status,200);assert.equal(result.data.updated,1);
  assert.equal(f.read('match').scheduled_at,at(20));assert.equal(f.audits().length,1);
});

test('the Worker schedule endpoint returns a conflict after concurrent scoring',async t=>{
  const f=await fixture(t);
  f.controls.beforeBatch=async()=>{assert.equal((await f.api('rally',{side:'A'},'ref')).status,200)};
  const result=await f.endpoint();assert.equal(result.status,409);assert.equal(result.data.error,'COURT_SCHEDULE_CONFLICT');
  assert.equal(f.read('match').current_score_a,1);assert.equal(f.read('match').court_id,null);assert.equal(f.audits().length,0);
});
