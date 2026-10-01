import test from "node:test";
import assert from "node:assert/strict";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";

test('completed matches reject every scoring action',async()=>{
  const f=await scoringFixture();f.db.exec("UPDATE matches SET status='completed',winner_team_id='a' WHERE id='match'");
  for(const [action,body] of [['point',{side:'A',delta:1}],['quick-score',{sets:[[11,3],[11,5]]}],['finish',{winnerTeamId:'a'}],['special-result',{winnerTeamId:'a',reason:'walkover'}],['finish-set',{}]])assert.equal((await f.api(action,body)).status,409,action);
});
test('quick score rejects insufficient, tied, invalid and excessive series without mutation',async()=>{
  for(const sets of [[[11,3]],[[11,3],[3,11]],[[11.5,3],[11,3]],[[11,-1],[11,3]],[[11,3],[11,3],[3,11]],[[11,3],[3,11],[11,3],[11,3]],[[11,3],[null,11]]]){
    const f=await scoringFixture(),before=f.match();const r=await f.api('quick-score',{sets});assert.equal(r.status,400,JSON.stringify(sets));assert.deepEqual(f.match(),before);assert.deepEqual(f.sets(),[]);
  }
});
test('explicit winner cannot finish a match without the required set wins',async()=>{
  const f=await scoringFixture();assert.equal((await f.api('finish',{winnerTeamId:'a'})).status,400);assert.equal(f.match().status,'scheduled');
});
test('every scoring route observes supplied stale versions',async()=>{
  for(const [action,body] of [['point',{side:'A',delta:1}],['quick-score',{sets:[[11,3],[11,4]]}],['finish',{winnerTeamId:'a'}],['finish-set',{}],['special-result',{winnerTeamId:'a',reason:'walkover'}],['undo',{}]]){
    const f=await scoringFixture();assert.equal((await f.api(action,{...body,expectedVersion:0})).status,409,action);
  }
});
test('point rejects cancelled matches and absent participants',async()=>{
  for(const sql of ["status='cancelled'","team_a_id=NULL"]){const f=await scoringFixture();f.db.exec('UPDATE matches SET '+sql+" WHERE id='match'");assert.equal((await f.api('point',{side:'A',delta:1})).status,409)}
});
test('quick-score undo restores previous sets and scores',async()=>{
  const f=await scoringFixture();f.db.exec("INSERT INTO match_sets VALUES('old','match',1,11,5,1); UPDATE matches SET status='live',current_score_a=3,current_score_b=4,started_at='2026-09-30T00:00:00.000Z' WHERE id='match'");
  const before=f.match(),sets=f.sets();assert.equal((await f.api('quick-score',{sets:[[5,11],[8,11]]})).status,200);assert.equal((await f.api('undo')).status,200);assert.deepEqual(f.sets(),sets);
  const after=f.match();for(const key of ['status','current_score_a','current_score_b','winner_team_id','result_reason','result_note','started_at','completed_at'])assert.equal(after[key],before[key],key);assert.equal(after.version,3);
});
test('undo excludes undo events and consumes each original event once',async()=>{
  const f=await scoringFixture();assert.equal((await f.api('point',{side:'A',delta:1})).status,200);assert.equal((await f.api('undo')).status,200);assert.equal((await f.api('undo')).data.error,'NOTHING_TO_UNDO');assert.equal(f.match().version,3);
});
test('late audit failure rolls back match, sets, event and bracket',async()=>{
  const f=await scoringFixture();f.downstream();f.db.exec("CREATE TRIGGER fail_score_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'TEST_AUDIT_FAILURE'); END;");
  const before=f.match();assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]})).status,500);assert.deepEqual(f.match(),before);assert.deepEqual(f.sets(),[]);assert.equal(f.db.prepare('SELECT count(*) n FROM score_events').get().n,0);assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='winner'").get().team_a_id,null);assert.equal(f.controls.broadcasts.length,0);
});
test('downstream history blocks undo and leaves both bracket slots intact',async()=>{
  const f=await scoringFixture();f.downstream();assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]})).status,200);
  f.db.exec("UPDATE matches SET started_at='2026-09-30T00:00:00.000Z' WHERE id='loser'");const before=f.match();assert.equal((await f.api('undo')).status,409);assert.deepEqual(f.match(),before);assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='winner'").get().team_a_id,'a');assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='loser'").get().team_a_id,'b');
});
test('finish persists a valid final set and undo preserves earlier sets and restores that current set',async()=>{
  const f=await scoringFixture();f.downstream();f.db.exec("INSERT INTO match_sets VALUES('first','match',1,11,4,1);UPDATE matches SET status='live',current_score_a=11,current_score_b=7,started_at='2026-09-30T00:00:00.000Z' WHERE id='match'");
  const before=f.match(),sets=f.sets();assert.equal((await f.api('finish')).status,200);assert.equal(f.sets().length,2);assert.equal(f.match().winner_team_id,'a');assert.equal((await f.api('undo')).status,200);assert.deepEqual(f.sets(),sets);assert.equal(f.match().current_score_a,before.current_score_a);assert.equal(f.match().current_score_b,before.current_score_b);
  for(const id of ['winner','loser'])assert.equal(f.db.prepare('SELECT team_a_id FROM matches WHERE id=?').get(id).team_a_id,null);
});
test('finishing the decisive set auto completes the series and undo restores its score',async()=>{
  const f=await scoringFixture();f.db.exec("INSERT INTO match_sets VALUES('first','match',1,11,4,1);UPDATE matches SET status='live',current_score_a=11,current_score_b=7 WHERE id='match'");
  assert.equal((await f.api('finish-set')).status,200);assert.equal(f.match().status,'completed');assert.equal((await f.api('undo')).status,200);assert.equal(f.match().status,'live');assert.equal(f.match().current_score_a,11);assert.equal(f.sets().length,1);
});
test('best-of and configured points and win-by-two govern both finish and quick score',async()=>{
  const f=await scoringFixture();f.db.exec("UPDATE divisions SET best_of=5,points_to_win=15 WHERE id='division'");
  assert.equal((await f.api('quick-score',{sets:[[15,3],[15,3]]})).status,400);assert.equal((await f.api('quick-score',{sets:[[15,14],[15,3],[15,3]]})).status,400);
  assert.equal((await f.api('quick-score',{sets:[[16,14],[15,3],[15,3]]})).status,200);assert.equal(f.match().status,'completed');
  const g=await scoringFixture();g.db.exec("UPDATE divisions SET best_of=1,points_to_win=15,win_by_two=0 WHERE id='division'");assert.equal((await g.api('quick-score',{sets:[[15,14]]})).status,200);
});
test('referee tournament scope is rechecked against current account state',async()=>{
  const f=await scoringFixture();f.db.exec("UPDATE app_users SET tournament_id_scope='other' WHERE id='ref'");assert.equal((await f.api('point',{side:'A',delta:1},'ref')).status,403);
});
test('undoing first point preserves durable participation history',async()=>{
  const f=await scoringFixture();await f.api('point',{side:'A',delta:1});const started=f.match().started_at;assert.equal((await f.api('undo')).status,200);assert.equal(f.match().status,'scheduled');assert.equal(f.match().started_at,started);assert.equal(f.match().current_score_a,0);
});
test('concurrent score requests using the same source version commit exactly one event',async()=>{
  const f=await scoringFixture();let second;
  f.controls.beforeBatch=async()=>{second=await f.api('quick-score',{sets:[[11,4],[11,3]],expectedVersion:1})};
  const first=await f.api('quick-score',{sets:[[4,11],[3,11]],expectedVersion:1});assert.equal(second.status,200);assert.equal(first.status,409);assert.equal(f.match().winner_team_id,'a');assert.equal(f.match().version,2);assert.equal(f.db.prepare('SELECT count(*) n FROM score_events').get().n,1);
});
test('concurrent source mutation rejects a scoring batch even without supplied version',async()=>{
  const f=await scoringFixture();f.controls.beforeBatch=async()=>f.db.exec("UPDATE matches SET version=version+1 WHERE id='match'");
  assert.equal((await f.api('point',{side:'A',delta:1})).status,409);assert.equal(f.match().current_score_a,0);assert.equal(f.db.prepare('SELECT count(*) n FROM score_events').get().n,0);
});
test('downstream version changes after prechecks reject the whole finish batch',async()=>{
  const f=await scoringFixture();f.downstream();f.controls.beforeBatch=async()=>f.db.exec("UPDATE matches SET version=version+1 WHERE id='loser'");
  assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]})).status,409);assert.equal(f.match().version,1);assert.deepEqual(f.sets(),[]);assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='winner'").get().team_a_id,null);
});
test('downstream history arising after prechecks blocks rewind even without a version change',async()=>{
  const f=await scoringFixture();f.downstream();await f.api('quick-score',{sets:[[11,3],[11,4]]});
  f.controls.beforeBatch=async()=>f.db.exec("INSERT INTO match_sets VALUES('late','loser',1,11,5,1)");const before=f.match();assert.equal((await f.api('undo')).status,409);assert.deepEqual(f.match(),before);assert.equal(f.db.prepare("SELECT count(*) n FROM score_events WHERE event_type='UNDO'").get().n,0);
});
test('concurrent undo requests consume one original event once',async()=>{
  const f=await scoringFixture();await f.api('point',{side:'A',delta:1});let second;
  f.controls.beforeBatch=async()=>{second=await f.api('undo',{expectedVersion:2})};assert.equal((await f.api('undo',{expectedVersion:2})).status,409);assert.equal(second.status,200);assert.equal(f.match().version,3);assert.equal(f.db.prepare("SELECT count(*) n FROM score_events WHERE event_type='UNDO'").get().n,1);
});
test('undo audit failure restores completion, all sets, brackets and original event marker',async()=>{
  const f=await scoringFixture();f.downstream();await f.api('quick-score',{sets:[[11,3],[11,4]]});const before=f.match(),sets=f.sets();f.db.exec("CREATE TRIGGER fail_undo_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'TEST_UNDO_FAILURE'); END;");
  assert.equal((await f.api('undo')).status,500);assert.deepEqual(f.match(),before);assert.deepEqual(f.sets(),sets);assert.equal(f.db.prepare('SELECT undone_at FROM score_events WHERE id=1').get().undone_at,null);assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='winner'").get().team_a_id,'a');
});
test('every durable downstream history indicator blocks completion before writes',async()=>{
  for(const sql of ["started_at='2026-09-30'","status='live'","status='completed'","winner_team_id='c'","current_score_a=1"]){
    const f=await scoringFixture();f.downstream();f.db.exec("UPDATE matches SET "+sql+" WHERE id='winner'");assert.equal((await f.api('quick-score',{sets:[[11,3],[11,4]]})).status,409,sql);assert.equal(f.match().version,1);assert.deepEqual(f.sets(),[]);
  }
});
test('legacy point and set finish with determinable history remain undoable',async()=>{
  const f=await scoringFixture();f.db.exec(`UPDATE matches SET current_score_a=2,status='live',started_at='2026-09-30',version=3 WHERE id='match';
    INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','POINT','{"before":[0,0],"after":[1,0]}',2),('match','POINT','{"before":[1,0],"after":[2,0]}',3);`);
  assert.equal((await f.api('undo')).status,200);assert.equal(f.match().current_score_a,1);
  const g=await scoringFixture();g.db.exec(`UPDATE matches SET status='live',started_at='2026-09-30',version=3 WHERE id='match';INSERT INTO match_sets VALUES('legacy','match',1,11,5,1);
    INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','POINT','{"before":[10,5],"after":[11,5]}',2),('match','SET_FINISH','{"setNo":1,"set":[11,5],"winner":null}',3);`);
  assert.equal((await g.api('undo')).status,200);assert.deepEqual(g.sets(),[]);assert.equal(g.match().current_score_a,11);
});
test('legacy quick-score lacking original sets refuses unsafe undo without mutation',async()=>{
  const f=await scoringFixture();f.db.exec(`UPDATE matches SET status='completed',winner_team_id='a',version=2 WHERE id='match';INSERT INTO match_sets VALUES('legacy','match',1,11,5,1);INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','MATCH_FINISH','{"sets":[[11,5]],"winner":"a"}',2);`);
  const before=f.match(),sets=f.sets();assert.equal((await f.api('undo')).data.error,'UNDO_HISTORY_UNAVAILABLE');assert.deepEqual(f.match(),before);assert.deepEqual(f.sets(),sets);
});
test('points reject malformed existing score values without recording another mutation',async()=>{
  for(const value of ['-1','0.5']){
    const f=await scoringFixture();f.db.exec("UPDATE matches SET current_score_b="+value+" WHERE id='match'");const before=f.match();assert.equal((await f.api('point',{side:'A',delta:1})).status,409);assert.deepEqual(f.match(),before);
  }
});
test('legacy completion cannot invent the previous bracket slot occupants',async()=>{
  const f=await scoringFixture();f.downstream();f.db.exec(`UPDATE matches SET status='completed',winner_team_id='a',started_at='2026-09-30',version=3 WHERE id='match';UPDATE matches SET team_a_id='a' WHERE id='winner';UPDATE matches SET team_a_id='b' WHERE id='loser';
    INSERT INTO match_sets VALUES('legacy','match',1,11,5,1);INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','POINT','{"before":[10,5],"after":[11,5]}',2),('match','MATCH_FINISH','{"setNo":1,"set":[11,5],"winner":"a"}',3);`);
  const before=f.match();assert.equal((await f.api('undo')).data.error,'UNDO_HISTORY_UNAVAILABLE');assert.deepEqual(f.match(),before);assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='winner'").get().team_a_id,'a');
});
test('legacy set undo requires the recorded set to still exist and match its stored score',async()=>{
  const f=await scoringFixture();f.db.exec(`UPDATE matches SET status='live',version=2 WHERE id='match';INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','SET_FINISH','{"addedSetNo":1,"before":{"scoreA":11,"scoreB":5,"version":1}}',2);`);
  const before=f.match();assert.equal((await f.api('undo')).data.error,'UNDO_HISTORY_UNAVAILABLE');assert.deepEqual(f.match(),before);
});
test('cancelled or TBD source matches cannot be reopened by undo',async()=>{
  for(const change of ["status='cancelled'","team_b_id=NULL"]){const f=await scoringFixture();await f.api('point',{side:'A',delta:1});f.db.exec("UPDATE matches SET "+change+",version=version+1 WHERE id='match'");const before=f.match();assert.equal((await f.api('undo')).status,409);assert.deepEqual(f.match(),before)}
});
test('historical downstream score events lock rewind even when undone with blank scoreboard',async()=>{
  const f=await scoringFixture();f.downstream();await f.api('quick-score',{sets:[[11,3],[11,4]]});f.db.exec("INSERT INTO score_events(match_id,event_type,payload,match_version,undone_at) VALUES('loser','POINT','{}',1,'2026-09-30')");const before=f.match();assert.equal((await f.api('undo')).status,409);assert.deepEqual(f.match(),before);assert.equal(f.db.prepare("SELECT team_a_id FROM matches WHERE id='winner'").get().team_a_id,'a');
});
test('historical downstream score event appearing after precheck aborts the scoring batch',async()=>{
  const f=await scoringFixture();f.downstream();await f.api('quick-score',{sets:[[11,3],[11,4]]});f.controls.beforeBatch=async()=>f.db.exec("INSERT INTO score_events(match_id,event_type,payload,match_version,undone_at) VALUES('loser','POINT','{}',1,'2026-09-30')");const before=f.match();assert.equal((await f.api('undo')).status,409);assert.deepEqual(f.match(),before);
});
