import test from 'node:test';
import assert from 'node:assert/strict';
import {scoringFixture} from './helpers/scoring-fixture.mjs';
import {parseRelayOrder,drawRelayOrders,relayDrawRequired} from '../../shared/relay-draw.js';

const orders=o=>assert.deepEqual([...o].sort(),['AB','BC','CA']);
async function fixture(){const f=await scoringFixture();f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'; UPDATE divisions SET event_type='team',best_of=1,points_to_win=27,win_by_two=0,scoring_mode='rally',relay_segment_points=9,relay_team_size=3,final_point_on_serve=1 WHERE id='division'");for(const side of ['a','b','c'])for(let i=1;i<=3;i++){const id=side+i;f.db.prepare('INSERT INTO players(id,full_name) VALUES(?,?)').run(id,id);f.db.prepare('INSERT INTO team_players(team_id,player_id,slot_no) VALUES(?,?,?)').run(side,id,i)}return f}
test('relay orders validate exact pair permutations and each side is drawn independently',()=>{
 for(const order of [['AB','BC','CA'],['AB','CA','BC'],['BC','AB','CA'],['BC','CA','AB'],['CA','AB','BC'],['CA','BC','AB']])assert.deepEqual(parseRelayOrder(JSON.stringify(order)),order);
 for(const order of [null,'broken',[],['AB','AB','CA'],['AB','BC','CD'],['AB','BC','CA','AB']])assert.equal(parseRelayOrder(order),null);
 const random=[0,0,1,1];const drawn=drawRelayOrders(()=>random.shift());orders(drawn.A);orders(drawn.B);assert.notDeepEqual(drawn.A,drawn.B);assert.equal(random.length,0);
 const same=drawRelayOrders(()=>0);assert.deepEqual(same.A,same.B,'independent draws can coincide by chance');
});
test('draw rejects incomplete or inactive rosters without mutation',async()=>{
 const f=await fixture();try{
  f.db.exec("DELETE FROM team_players WHERE player_id='a3'");
  const before=f.match();assert.equal((await f.api('relay-draw',{expectedVersion:1})).data.error,'RELAY_PARTICIPANTS_REQUIRED');assert.deepEqual(f.match(),before);
  f.db.exec("INSERT INTO team_players(team_id,player_id,slot_no) VALUES('a','a3',3); UPDATE players SET active=0 WHERE id='b3'");
  assert.equal((await f.api('relay-draw',{expectedVersion:1})).data.error,'RELAY_PARTICIPANTS_REQUIRED');
 }finally{f.db.close()}
});
test('audit failure rolls back draw and guard; roster replacement invalidates pending orders',async()=>{
 const f=await fixture();try{
  f.db.exec("CREATE TRIGGER fail_draw_audit BEFORE INSERT ON audit_logs WHEN NEW.action='RELAY_DRAW' BEGIN SELECT RAISE(ABORT,'AUDIT_FAILURE'); END;");
  const before=f.match();assert.equal((await f.api('relay-draw',{expectedVersion:1})).status,500);assert.deepEqual(f.match(),before);assert.equal(f.db.prepare('SELECT count(*) n FROM relay_draw_guards').get().n,0);
  f.db.exec('DROP TRIGGER fail_draw_audit');assert.equal((await f.api('relay-draw',{expectedVersion:1})).status,200);
  assert.equal((await f.api('relay-draw',{expectedVersion:2})).status,200,'redraw before play is allowed');
  f.db.exec("UPDATE team_players SET slot_no=4 WHERE player_id='a3'");assert.equal(f.match().relay_order_a,null);assert.equal(f.match().version,4);assert.equal((await f.api('rally',{side:'A'})).data.error,'RELAY_DRAW_REQUIRED');
 }finally{f.db.close()}
});
test('zero-score legacy history and newly selected service both lock redraw',async()=>{
 const f=await fixture();try{
  const drawn=await f.api('relay-draw',{expectedVersion:1});assert.equal(drawn.status,200);
  const service=await f.api('service',{side:'B',serverNumber:2});assert.equal(service.status,200);assert.equal(service.data.hasHistory,true);assert.equal((await f.api('relay-draw',{expectedVersion:f.match().version})).data.error,'RELAY_DRAW_LOCKED');
  assert.throws(()=>f.db.exec("UPDATE team_players SET slot_no=4 WHERE player_id='a3'"),/TEAM_ROSTER_LOCKED/);
  assert.throws(()=>f.db.exec("DELETE FROM team_players WHERE player_id='a3'"),/TEAM_ROSTER_LOCKED/);
  const worker=(await import('../src/index.js')).default;
  const changed=await worker.fetch(new Request('https://test.invalid/api/teams/a',{method:'PATCH',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:JSON.stringify({playerIds:['a3','a2','a1']})}),f.env);
  assert.equal(changed.status,409);assert.deepEqual(JSON.parse(f.match().relay_order_a),drawn.data.relayOrderA);
  f.db.exec("UPDATE matches SET relay_order_a=NULL,relay_order_b=NULL,relay_drawn_at=NULL,started_at=NULL,status='scheduled' WHERE id='match'");
  const state=await (await import('../src/state.js')).loadState(f.env);assert.equal(state.matches[0].hasHistory,true);assert.equal((await f.api('rally',{side:'A'})).status,200,'legacy history retains fixed-order compatibility');
 }finally{f.db.close()}
});
test('only new three-player relays require drawing; started legacy matches remain compatible',()=>{
 const m={relay_team_size:3,relay_segment_points:9,status:'scheduled',current_score_a:0,current_score_b:0};
 assert.equal(relayDrawRequired(m),true);
 for(const extra of [{started_at:'2026-10-11'},{status:'live'},{current_score_b:2},{relay_team_size:4},{relay_segment_points:0},{relay_order_a:'["AB","BC","CA"]',relay_order_b:'["CA","AB","BC"]'}])assert.equal(relayDrawRequired({...m,...extra}),false);
});
test('new MLP scoring requires persisted draw, then names/orders are available in every state',async()=>{
 const f=await fixture();try{
  for(const action of ['point','rally','service','timeout','quick-score']){const r=await f.api(action,{side:'A',delta:1,serverNumber:1,sets:[[27,0]]});assert.equal(r.status,409,action);assert.equal(r.data.error,'RELAY_DRAW_REQUIRED')}
  const r=await f.api('relay-draw',{expectedVersion:1},'ref');assert.equal(r.status,200);orders(r.data.relayOrderA);orders(r.data.relayOrderB);assert.equal(r.data.version,2);assert.ok(r.data.relayDrawnAt);
  assert.equal(f.db.prepare("SELECT count(*) n FROM score_events WHERE match_id='match'").get().n,0,'draw is not a score event');
  const stored=f.match();assert.deepEqual(JSON.parse(stored.relay_order_a),r.data.relayOrderA);
  const state=await (await import('../src/state.js')).loadState(f.env,{publicOnly:true});assert.deepEqual(state.matches[0].relayOrderB,r.data.relayOrderB);
  const point=await f.api('rally',{side:'A',expectedVersion:2},'ref');assert.equal(point.status,200);assert.deepEqual(point.data.relayOrderA,r.data.relayOrderA);
  const before=f.match();assert.equal((await f.api('relay-draw',{expectedVersion:3},'ref')).data.error,'RELAY_DRAW_LOCKED');assert.deepEqual(f.match(),before);
  assert.equal((await f.api('undo',{},'ref')).status,200);assert.equal((await f.api('relay-draw',{expectedVersion:f.match().version},'ref')).data.error,'RELAY_DRAW_LOCKED');
  assert.deepEqual(JSON.parse(f.match().relay_order_b),r.data.relayOrderB);
 }finally{f.db.close()}
});
test('draw requires current version, supported relay, assigned role and tournament scope',async()=>{
 const f=await fixture();try{
  for(const body of [{},{expectedVersion:0},{expectedVersion:'1'}])assert.equal((await f.api('relay-draw',body)).status,409);
  f.db.exec("UPDATE matches SET referee_user_id=NULL WHERE id='match'");assert.equal((await f.api('relay-draw',{expectedVersion:1},'ref')).status,403);
  f.db.exec("UPDATE matches SET referee_user_id='ref' WHERE id='match'; UPDATE app_users SET tournament_id_scope='other' WHERE id='ref'");assert.equal((await f.api('relay-draw',{expectedVersion:1},'ref')).status,403);
  f.db.exec("UPDATE divisions SET relay_team_size=4 WHERE id='division'");assert.equal((await f.api('relay-draw',{expectedVersion:1})).data.error,'RELAY_DRAW_UNSUPPORTED');
 }finally{f.db.close()}
});
test('stale concurrent draw cannot persist an audit or replace the winning draw',async()=>{
 const f=await fixture();try{
  let second;f.controls.beforeBatch=async()=>{second=await f.api('relay-draw',{expectedVersion:1})};
  const first=await f.api('relay-draw',{expectedVersion:1});assert.equal(second.status,200);assert.equal(first.status,409);assert.equal(f.match().version,2);
  assert.equal(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='RELAY_DRAW'").get().n,1);
 }finally{f.db.close()}
});
test('first draw rechecks actual roster atomically after concurrent deletion',async()=>{
 const f=await fixture();try{
  f.controls.beforeBatch=async()=>f.db.exec("DELETE FROM team_players WHERE player_id='a3'");
  const draw=await f.api('relay-draw',{expectedVersion:1});assert.equal(draw.data.error,'RELAY_PARTICIPANTS_REQUIRED');assert.equal(f.match().relay_order_a,null);assert.equal(f.db.prepare("SELECT count(*) n FROM audit_logs WHERE action='RELAY_DRAW'").get().n,0);
 }finally{f.db.close()}
});
test('score reset and completion preserve both drawn permutations',async()=>{
 const f=await fixture();try{
  const drawn=await f.api('relay-draw',{expectedVersion:1});assert.equal(drawn.status,200);
  await f.api('point',{side:'A',delta:1});assert.equal((await f.api('reset')).status,200);assert.deepEqual(JSON.parse(f.match().relay_order_a),drawn.data.relayOrderA);
  assert.equal((await f.api('relay-draw',{expectedVersion:f.match().version})).data.error,'RELAY_DRAW_LOCKED');
  assert.equal((await f.api('quick-score',{sets:[[27,4]]})).status,200);assert.deepEqual(JSON.parse(f.match().relay_order_b),drawn.data.relayOrderB);
 }finally{f.db.close()}
});
