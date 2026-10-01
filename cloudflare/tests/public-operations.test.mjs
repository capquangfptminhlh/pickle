import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

async function fixture(){
  const f=await accountFixture();
  f.db.exec(`UPDATE tournaments SET public_visible=1 WHERE id='own'; UPDATE tournaments SET public_visible=0 WHERE id='other';
    INSERT INTO players(id,full_name,phone,rating) VALUES('p','Player','private-phone',3.2),('partner','Partner',null,3),('opponent','Opponent',null,3);
    INSERT INTO divisions(id,tournament_id,name) VALUES('visible','own','Public division'),('hidden','own','Hidden division'),('private','other','Private division');
    UPDATE divisions SET active=0 WHERE id='hidden';
    INSERT INTO teams(id,division_id,name) VALUES('a','visible','A'),('b','visible','B'),('h','hidden','Hidden team'),('x','private','Private team');
    INSERT INTO team_players(team_id,player_id) VALUES('a','p'),('a','partner'),('b','opponent'),('h','p'),('x','p');
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,status,completed_at) VALUES('visible-match','visible','a','b','a','completed','2026-10-01T12:00:00Z'),('hidden-match','hidden','h',null,'h','completed','2026-10-01T13:00:00Z'),('private-match','private','x',null,'x','completed','2026-10-01T14:00:00Z');
    INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('s1','visible-match',1,11,5,1),('s2','visible-match',2,11,6,1);
    INSERT INTO rating_history(id,player_id,before_rating,delta,after_rating,reason) VALUES('rating','p',3,0.2,3.2,'Verified adjustment');
    INSERT INTO sponsors(id,tournament_id,name) VALUES('visible-sponsor','own','Visible'),('private-sponsor','other','Private'),('global-sponsor',null,'Global');
    INSERT INTO registrations(id,division_id,team_id) VALUES('own-reg','visible','a'),('other-reg','private','x');`);
  const get=async(path,actor)=>worker.fetch(new Request("https://test.invalid"+path,{headers:actor?{Authorization:"Bearer "+f.tokens[actor]}:{}}),f.env);
  return {...f,get};
}

test("public player scorecard uses persisted scores, labels, partners and rating history",async()=>{
  const f=await fixture();try{
    const data=await (await f.get("/api/public/players/p")).json();
    assert.deepEqual(data.stats,{wins:1,losses:0,matches:1,winRate:100,pointsFor:22,pointsAgainst:11,diff:11});
    assert.equal(data.matches[0].tournamentName,"Giải của tôi");assert.equal(data.matches[0].won,true);
    assert.equal(data.matches[0].teamAName,"A");assert.deepEqual(data.matches[0].sets,[[11,5],[11,6]]);
    assert.equal(data.partners[0].id,"partner");assert.equal(data.ratingHistory[0].after_rating,3.2);
    assert.ok(!JSON.stringify(data).includes("private-phone"));
  }finally{f.db.close()}
});
test("player history excludes hidden/private divisions and inactive team partners",async()=>{
  const f=await fixture();try{
    const data=await (await f.get("/api/public/players/p")).json();
    assert.deepEqual(data.teams.map(t=>t.tournament_id),["own"]);
    assert.deepEqual(data.matches.map(m=>m.id),["visible-match"]);
    f.db.exec("UPDATE players SET active=0 WHERE id='partner'");
    const updated=await (await f.get("/api/public/players/p")).json();assert.deepEqual(updated.partners,[]);
  }finally{f.db.close()}
});
test("public sponsors exclude associations with private tournaments",async()=>{
  const f=await fixture();try{
    assert.deepEqual((await (await f.get("/api/public/sponsors")).json()).map(s=>s.id).sort(),["global-sponsor","visible-sponsor"]);
  }finally{f.db.close()}
});
test("receipt reads require current scope and no-store while public media remains accessible",async()=>{
  const f=await fixture();try{
    f.env.MEDIA={get:async()=>({body:"private-statement",httpEtag:'"test"',customMetadata:{ownerUserId:"organizer"},writeHttpMetadata:h=>h.set("Content-Type","application/pdf")})};
    f.db.exec("INSERT INTO payment_records(id,registration_id,receipt_url) VALUES('receipt','other-reg','https://test.invalid/api/media/receipts%2Fstatement.pdf')");
    const path="/api/media/receipts%2Fstatement.pdf";
    assert.equal((await f.get(path)).status,401);assert.equal((await f.get(path,"local")).status,403);assert.equal((await f.get(path,"organizer")).status,403);
    for(const url of ["https://test.invalid/api/media/receipts%2Fstatement.pdf?preview=1","https://test.invalid/api/media/receipts%2Fstatement%2Epdf"]){
      f.db.prepare("UPDATE payment_records SET receipt_url=? WHERE id='receipt'").run(url);
      assert.equal((await f.get(path,"organizer")).status,403);
    }
    const admin=await f.get(path,"admin");assert.equal(admin.status,200);assert.match(admin.headers.get("Cache-Control"),/no-store/);
    f.db.exec("UPDATE payment_records SET registration_id='own-reg' WHERE id='receipt'");
    assert.equal((await f.get(path,"organizer")).status,200);
    assert.equal((await f.get("/api/media/posters%2Fposter.png")).status,200);
  }finally{f.db.close()}
});
