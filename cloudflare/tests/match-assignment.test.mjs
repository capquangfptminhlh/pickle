import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

async function fixture(){
  const f=await accountFixture();
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  f.db.exec(`INSERT INTO divisions(id,tournament_id,name) VALUES('own-division','own','Đôi'),('other-division','other','Đôi khác');
    INSERT INTO teams(id,division_id,name,status) VALUES('a','own-division','A','active'),('b','own-division','B','active'),('withdrawn','own-division','Rút','withdrawn'),('foreign-team','other-division','Other','active');
    INSERT INTO courts(id,tournament_id,name,active) VALUES('court','own','Sân 1',1),('foreign-court','other','Sân khác',1),('inactive-court','own','Sân khóa',0);
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,referee_user_id,court_id) VALUES('own-match','own-division','a','b','local','court'),('old-assignment','other-division','foreign-team',NULL,'local',NULL);
    INSERT INTO players(id,full_name) VALUES('own-player','VĐV giải tôi'),('foreign-player','VĐV giải khác');
    INSERT INTO team_players(team_id,player_id) VALUES('a','own-player'),('foreign-team','foreign-player');`);
  return f;
}

test("referee state and player edits obey current tournament scope after reassignment",async()=>{
  const f=await fixture();try{
    const state=await f.api("/api/admin/state",undefined,"GET","local");
    assert.deepEqual(state.data.matches.map(m=>m.id),["own-match"]);
    const forbidden=await f.api("/api/players/foreign-player",{nickname:"Wrong scope"},"PATCH","local");assert.equal(forbidden.status,403);
    f.db.exec("UPDATE app_users SET tournament_id_scope='other' WHERE id='local'");
    const revoked=await f.api("/api/matches/own-match/point",{side:"A",delta:1},"POST","local");assert.equal(revoked.status,403);
  }finally{f.db.close()}
});

for(const [name,body] of [
  ["foreign court",{courtId:"foreign-court"}],["inactive court",{courtId:"inactive-court"}],
  ["foreign referee",{refereeUserId:"foreign"}],["non-referee account",{refereeUserId:"organizer"}]
])test(`every match write rejects ${name}`,async()=>{
  const f=await fixture();try{
    for(const [path,method,payload] of [
      ["/api/divisions/own-division/matches","POST",{teamAId:"a",teamBId:"b",...body}],
      ["/api/matches/own-match","PATCH",body],["/api/matches/own-match/assignment","PATCH",body]
    ]){const r=await f.api(path,payload,method);assert.equal(r.status,400,`${method} ${path}`)}
  }finally{f.db.close()}
});

test("match creation and participant edits reject foreign, withdrawn and duplicate teams",async()=>{
  const f=await fixture();try{
    for(const teamAId of ["foreign-team","withdrawn","b"]){
      const created=await f.api("/api/divisions/own-division/matches",{teamAId,teamBId:"b"},"POST");assert.equal(created.status,400);
      const edited=await f.api("/api/matches/own-match",{teamAId},"PATCH");assert.equal(edited.status,400);
    }
  }finally{f.db.close()}
});

test("started match participant edits and deletion preserve scored history",async()=>{
  const f=await fixture();try{
    f.db.exec("UPDATE matches SET status='completed',started_at=CURRENT_TIMESTAMP,winner_team_id='a' WHERE id='own-match'; INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('set','own-match',1,11,5,1)");
    const update=await f.api("/api/matches/own-match",{teamAId:null});assert.equal(update.status,409);
    const remove=await f.api("/api/matches/own-match",undefined,"DELETE");assert.equal(remove.status,409);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM match_sets WHERE match_id='own-match'").get().n,1);
    const metadata=await f.api("/api/matches/own-match",{stage:"Tên vòng mới"});assert.equal(metadata.status,200);
  }finally{f.db.close()}
});

test("assignment supports explicit clearing and records an atomic audit",async()=>{
  const f=await fixture();try{
    const r=await f.api("/api/matches/own-match/assignment",{courtId:null,refereeUserId:null});assert.equal(r.status,200);
    const saved=f.db.prepare("SELECT * FROM matches WHERE id='own-match'").get();assert.equal(saved.court_id,null);assert.equal(saved.referee_user_id,null);
    assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE entity_id='own-match' AND action='ASSIGN_MATCH'").get());
  }finally{f.db.close()}
});

test("a concurrent score update rejects stale assignment without replacing metadata",async()=>{
  const f=await fixture();try{
    const original=f.env.DB.batch.bind(f.env.DB);let first=true;
    f.env.DB.batch=async statements=>{
      if(first){first=false;f.db.exec("UPDATE matches SET version=version+1,current_score_a=1,status='live' WHERE id='own-match'")}
      return original(statements);
    };
    const r=await f.api("/api/matches/own-match/assignment",{courtId:null,expectedVersion:1});assert.equal(r.status,409);
    assert.equal(f.db.prepare("SELECT court_id FROM matches WHERE id='own-match'").get().court_id,"court");
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entity_id='own-match'").get().n,0);
  }finally{f.db.close()}
});
