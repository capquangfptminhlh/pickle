import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

const score={"A+":6,"A":5,"B+":4,"B":3,"C+":2,"C":1};

test("balanced skill draw pairs strongest with weakest and persists each athlete once",async()=>{
  const f=await accountFixture();
  try{
    f.db.exec(`
      INSERT INTO divisions(id,tournament_id,name,event_type,format) VALUES('skill-d','own','Đôi cân trình','doubles','pool_to_knockout');
      INSERT INTO players(id,full_name,gender,rating,skill_level,active) VALUES
        ('sa','A Plus','male',4.8,'A+',1),('sb','A Player','male',4.5,'A',1),
        ('sc','B Plus','male',4.0,'B+',1),('sd','B Player','male',3.5,'B',1),
        ('se','C Plus','male',3.0,'C+',1),('sf','C Player','male',2.5,'C',1);
    `);
    const ids=["sa","sb","sc","sd","se","sf"];
    const r=await f.api("/api/divisions/skill-d/draw-balanced-teams",{playerIds:ids},"POST","admin");
    assert.equal(r.status,201,JSON.stringify(r.data));
    assert.equal(r.data.created,3);
    assert.equal(f.db.prepare("SELECT count(*) n FROM teams WHERE division_id='skill-d'").get().n,3);
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE t.division_id='skill-d'").get().n,6);
    for(const team of r.data.teams){
      assert.equal(team.players.length,2);
      assert.equal(team.players.reduce((n,p)=>n+score[p.skillLevel],0),7);
    }
    const unique=new Set(r.data.teams.flatMap(t=>t.players.map(p=>p.id)));
    assert.equal(unique.size,6);
  }finally{f.db.close()}
});

test("mixed doubles skill draw requires equal male and female pools",async()=>{
  const f=await accountFixture();
  try{
    f.db.exec(`
      INSERT INTO divisions(id,tournament_id,name,event_type,format) VALUES('skill-m','own','Đôi nam nữ','mixed_doubles','pool_to_knockout');
      INSERT INTO players(id,full_name,gender,rating,skill_level,active) VALUES
        ('m1','Nam A+','male',4.8,'A+',1),('m2','Nam B','male',3.5,'B',1),
        ('f1','Nữ C','female',2.5,'C',1),('f2','Nữ B+','female',4.0,'B+',1);
    `);
    const r=await f.api("/api/divisions/skill-m/draw-balanced-teams",{playerIds:["m1","m2","f1","f2"]},"POST","admin");
    assert.equal(r.status,201,JSON.stringify(r.data));
    assert.equal(r.data.created,2);
    for(const team of r.data.teams){
      assert.deepEqual(new Set(team.players.map(p=>p.gender)),new Set(["male","female"]));
    }

    f.db.exec("INSERT INTO players(id,full_name,gender,rating,skill_level,active) VALUES('m3','Nam C','male',2.2,'C',1)");
    const bad=await f.api("/api/divisions/skill-m/draw-balanced-teams",{playerIds:["m3"]},"POST","admin");
    assert.equal(bad.status,400);
  }finally{f.db.close()}
});
