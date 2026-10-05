import test from "node:test";
import assert from "node:assert/strict";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

test("side-out doubles tracks first server, second server and side-out without awarding receiver points",async()=>{
  const f=await scoringFixture();
  try{
    let r=await f.api("rally",{side:"A",expectedVersion:1});
    assert.equal(r.status,200);
    assert.deepEqual(r.data.current,[1,0]);
    assert.equal(r.data.servingSide,"A");
    assert.equal(r.data.serverNumber,2);

    r=await f.api("rally",{side:"B",expectedVersion:2});
    assert.equal(r.status,200);
    assert.deepEqual(r.data.current,[1,0]);
    assert.equal(r.data.servingSide,"B");
    assert.equal(r.data.serverNumber,1);

    r=await f.api("rally",{side:"A",expectedVersion:3});
    assert.equal(r.status,200);
    assert.deepEqual(r.data.current,[1,0]);
    assert.equal(r.data.servingSide,"B");
    assert.equal(r.data.serverNumber,2);

    r=await f.api("rally",{side:"A",expectedVersion:4});
    assert.equal(r.status,200);
    assert.deepEqual(r.data.current,[1,0]);
    assert.equal(r.data.servingSide,"A");
    assert.equal(r.data.serverNumber,1);
    assert.equal(f.match().court_state,"live");
  }finally{f.db.close()}
});

test("rally scoring awards every rally and moves service to rally winner",async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE divisions SET scoring_mode='rally' WHERE id='division'");
    const r=await f.api("rally",{side:"B",expectedVersion:1});
    assert.equal(r.status,200);
    assert.deepEqual(r.data.current,[0,1]);
    assert.equal(r.data.servingSide,"B");
    assert.equal(r.data.serverNumber,1);
  }finally{f.db.close()}
});

test("service correction and timeouts are versioned, auditable and undoable",async()=>{
  const f=await scoringFixture();
  try{
    let r=await f.api("service",{side:"B",serverNumber:1,expectedVersion:1});
    assert.equal(r.status,200);
    assert.equal(r.data.servingSide,"B");
    assert.equal(f.match().status,"scheduled");

    r=await f.api("timeout",{side:"B",kind:"standard",expectedVersion:2});
    assert.equal(r.status,200);
    assert.equal(r.data.timeouts.B,1);
    r=await f.api("timeout",{side:"B",kind:"standard",expectedVersion:3});
    assert.equal(r.status,200);
    assert.equal(r.data.timeouts.B,2);
    r=await f.api("timeout",{side:"B",kind:"standard",expectedVersion:4});
    assert.equal(r.status,409);
    assert.equal(r.data.error,"TIMEOUT_LIMIT");

    r=await f.api("undo",{expectedVersion:4});
    assert.equal(r.status,200);
    assert.equal(r.data.timeouts.B,1);
    assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE entity_id='match' AND action='UNDO'").get());
  }finally{f.db.close()}
});

test("court queue transitions are versioned and visible through admin state",async()=>{
  const f=await accountFixture();
  try{
    f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
    f.db.exec(`INSERT INTO divisions(id,tournament_id,name) VALUES('division','own','Doubles');
      INSERT INTO teams(id,division_id,name) VALUES('a','division','A'),('b','division','B');
      INSERT INTO matches(id,division_id,team_a_id,team_b_id,status) VALUES('m','division','a','b','scheduled');`);

    let r=await f.api("/api/matches/m/court-state",{courtState:"called",expectedVersion:1});
    assert.equal(r.status,200);assert.equal(r.data.courtState,"called");
    r=await f.api("/api/matches/m/court-state",{courtState:"on_deck",expectedVersion:2});
    assert.equal(r.status,200);assert.equal(r.data.courtState,"on_deck");
    r=await f.api("/api/matches/m/court-state",{courtState:"warming_up",expectedVersion:3});
    assert.equal(r.status,200);assert.equal(r.data.courtState,"warming_up");

    const stale=await f.api("/api/matches/m/court-state",{courtState:"called",expectedVersion:1});
    assert.equal(stale.status,409);

    const state=await f.api("/api/admin/state",undefined,"GET");
    const match=state.data.matches.find(x=>x.id==="m");
    assert.equal(match.courtState,"warming_up");
    assert.ok(match.calledAt&&match.onDeckAt&&match.warmupAt);
    assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE entity_id='m' AND action='COURT_STATE'").get());
  }finally{f.db.close()}
});

test("finishing a court auto-calls the first eligible rested match and skips a team that just played",async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec(`INSERT INTO courts(id,tournament_id,name,active) VALUES('court','tour','Court 1',1);
      UPDATE matches SET court_id='court' WHERE id='match';
      INSERT INTO teams(id,division_id,name) VALUES('d','division','D');
      INSERT INTO matches(id,division_id,court_id,team_a_id,team_b_id,status,court_state,created_at,version)
        VALUES('rest-blocked','division','court','a','c','scheduled','scheduled','2026-10-05T00:01:00Z',1),
              ('eligible','division','court','c','d','scheduled','scheduled','2026-10-05T00:02:00Z',1);`);
    const r=await f.api("quick-score",{sets:[[11,3],[11,4]],expectedVersion:1});
    assert.equal(r.status,200);
    assert.equal(f.db.prepare("SELECT court_state FROM matches WHERE id='rest-blocked'").get().court_state,"scheduled");
    const next=f.db.prepare("SELECT court_state,called_at FROM matches WHERE id='eligible'").get();
    assert.equal(next.court_state,"called");
    assert.ok(next.called_at);
    assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE entity_id='eligible' AND action='AUTO_CALL_NEXT'").get());
  }finally{f.db.close()}
});
