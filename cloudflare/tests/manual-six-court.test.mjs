import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

const start="2030-01-01T09:00:00.000Z";
const at=minutes=>new Date(Date.parse(start)+minutes*60000).toISOString();

async function fixture(t){
  const f=await accountFixture();
  t.after(()=>f.db.close());
  f.env.ROOMS={idFromName:id=>id,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  f.db.exec("INSERT INTO divisions(id,tournament_id,name,minimum_rest_minutes,match_slot_minutes) VALUES('court-division','own','6 court operations',15,20)");
  for(let i=1;i<=7;i++){
    f.db.prepare("INSERT INTO teams(id,division_id,name) VALUES(?, 'court-division', ?)").run("a"+i,"Team A"+i);
    f.db.prepare("INSERT INTO teams(id,division_id,name) VALUES(?, 'court-division', ?)").run("b"+i,"Team B"+i);
    for(const side of ["a","b"]){
      const player="player-"+side+i,team=side+i;
      f.db.prepare("INSERT INTO players(id,full_name) VALUES(?,?)").run(player,player);
      f.db.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").run(team,player);
    }
    if(i<=6)f.db.prepare("INSERT INTO courts(id,tournament_id,name,sort_order) VALUES(?,'own',?,?)").run("court"+i,"Court "+i,i);
  }
  const create=async(i,courtId="court"+i,scheduledAt=start,division="court-division",teamAId="a"+i,teamBId="b"+i)=>
    f.api("/api/divisions/"+division+"/matches",{teamAId,teamBId,courtId,scheduledAt},"POST");
  const matches=[];
  for(let i=1;i<=6;i++){
    const response=await create(i);
    assert.equal(response.status,201,"six-court bootstrap "+i+": "+JSON.stringify(response.data));
    matches.push(response.data);
  }
  return {f,matches,create};
}

test("manual scheduling blocks an athlete reused on a different free court during rest",async t=>{
  const {f}=await fixture(t);
  f.db.exec("INSERT INTO divisions(id,tournament_id,name,minimum_rest_minutes,match_slot_minutes) VALUES('shared-player-division','own','Shared player',15,20); INSERT INTO teams(id,division_id,name) VALUES('shared-a','shared-player-division','Shared A'),('shared-b','shared-player-division','Shared B'); INSERT INTO team_players(team_id,player_id) VALUES('shared-a','player-a1'),('shared-b','player-b7')");
  const request=scheduledAt=>f.api("/api/divisions/shared-player-division/matches",
    {teamAId:"shared-a",teamBId:"shared-b",courtId:"court2",scheduledAt},"POST");
  const conflict=await request(at(20));
  assert.equal(conflict.status,409);
  assert.equal(conflict.data.error,"PLAYER_SCHEDULE_CONFLICT");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM matches").get().n,6);
  assert.equal((await request(at(35))).status,201);
});

test("six courts run simultaneously without allowing a double booking",async t=>{
  const {f,matches,create}=await fixture(t);
  assert.equal(new Set(matches.map(m=>m.courtId)).size,6);
  const conflict=await create(7,"court1");
  assert.equal(conflict.status,409);
  assert.equal(conflict.data.error,"COURT_SCHEDULE_CONFLICT");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM matches").get().n,6);
  const later=await create(7,"court1",at(20));
  assert.equal(later.status,201,"the court is available after its slot ends");
});

test("cross-division shared athlete observes rest even on an otherwise free court",async t=>{
  const {f}=await fixture(t);
  f.db.exec("INSERT INTO divisions(id,tournament_id,name,minimum_rest_minutes,match_slot_minutes) VALUES('guest-division','own','Guest',15,20); INSERT INTO teams(id,division_id,name) VALUES('guest-a','guest-division','Guest A'),('guest-b','guest-division','Guest B'); INSERT INTO team_players(team_id,player_id) VALUES('guest-a','player-a1'),('guest-b','player-b7')");
  const book=scheduledAt=>f.api("/api/divisions/guest-division/matches",
    {teamAId:"guest-a",teamBId:"guest-b",courtId:"court1",scheduledAt},"POST");
  const resting=await book(at(20));
  assert.equal(resting.status,409);
  assert.equal(resting.data.error,"PLAYER_SCHEDULE_CONFLICT");
  assert.equal((await book(at(35))).status,201);
});

test("manual reassignment rejects an occupied court and does not write an audit",async t=>{
  const {f,matches}=await fixture(t);
  const id=matches[1].id;
  const before=f.db.prepare("SELECT * FROM matches WHERE id=?").get(id);
  const result=await f.api("/api/matches/"+id+"/assignment",
    {courtId:"court1",scheduledAt:start,expectedVersion:before.version},"PATCH");
  assert.equal(result.status,409);
  assert.equal(result.data.error,"COURT_SCHEDULE_CONFLICT");
  assert.deepEqual(f.db.prepare("SELECT * FROM matches WHERE id=?").get(id),before);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_id=? AND action='ASSIGN_MATCH'").get(id).n,0);
});

test("stale tournament snapshot aborts a concurrent manual scheduling write",async t=>{
  const {f,create}=await fixture(t);
  const original=f.env.DB.batch.bind(f.env.DB);
  let injected=false;
  f.env.DB.batch=async statements=>{
    if(!injected){
      injected=true;
      f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,court_id,scheduled_at) VALUES('other-organizer','court-division','a7','b7','court1',?)").run(at(30));
    }
    return original(statements);
  };
  const result=await create(7,"court1",at(30));
  assert.equal(result.status,409);
  assert.equal(result.data.error,"COURT_SCHEDULE_CONFLICT");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM matches").get().n,7);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM matches WHERE id='other-organizer'").get().n,1);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM division_draw_reset_guards").get().n,0);
});

test("started match assignments are locked but referee-only updates remain possible",async t=>{
  const {f,matches}=await fixture(t);
  const id=matches[0].id;
  f.db.prepare("UPDATE matches SET started_at=?, status='live', court_state='live' WHERE id=?").run(start,id);
  const blocked=await f.api("/api/matches/"+id+"/assignment",{courtId:"court2",scheduledAt:at(90)},"PATCH");
  assert.equal(blocked.status,409);
  assert.equal(blocked.data.error,"MATCH_ASSIGNMENT_LOCKED");
  const referee=await f.api("/api/matches/"+id+"/assignment",{refereeUserId:"local"},"PATCH");
  assert.equal(referee.status,200);
  assert.equal(f.db.prepare("SELECT referee_user_id FROM matches WHERE id=?").get(id).referee_user_id,"local");
});

test("manual schedule refuses invalid timestamps",async t=>{
  const {f,create}=await fixture(t);
  const bad=await create(7,"court1","tomorrow evening maybe");
  assert.equal(bad.status,400);
  assert.equal(bad.data.error,"INVALID_SCHEDULE_TIME");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM matches").get().n,6);
});
