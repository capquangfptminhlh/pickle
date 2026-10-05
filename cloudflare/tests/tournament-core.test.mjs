import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

function addDivision(db,id="division"){
  db.prepare("INSERT INTO divisions(id,tournament_id,name,format,advance_count) VALUES(?,?,?,?,?)").run(id,"own","Đôi 16 cặp","pool_to_knockout",2);
}

test("16-team / 4-pool Top-2 bracket keeps same-pool qualifiers in opposite halves",async()=>{
  const f=await accountFixture();
  try{
    addDivision(f.db);
    const groups=["A","B","C","D"];
    for(const g of groups){
      for(let seed=1;seed<=4;seed++){
        f.db.prepare("INSERT INTO teams(id,division_id,name,seed,group_code,status) VALUES(?,?,?,?,?,'active')")
          .run(g+seed,"division",g+seed,seed,g);
      }
      for(let a=1;a<=4;a++)for(let b=a+1;b<=4;b++){
        const winner=g+a;
        f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status,completed_at) VALUES(?,?,?,?,?,?,'completed','2026-10-05T00:00:00Z')")
          .run("pool-"+g+a+b,"division",g+a,g+b,winner,"Bảng "+g);
        f.db.prepare("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,?,?,?,1)")
          .run("set-"+g+a+b,"pool-"+g+a+b,1,11,Math.max(0,8-a-b));
      }
    }
    const r=await f.api("/api/divisions/division/generate-bracket",{},"POST");
    assert.equal(r.status,200);
    assert.equal(r.data.protectedSameGroupUntilFinal,true);
    assert.equal(r.data.qualifiers,8);

    const round=f.db.prepare("SELECT bracket_slot,team_a_id,team_b_id FROM matches WHERE division_id='division' AND round_no=1 AND bracket_slot IS NOT NULL ORDER BY bracket_slot").all();
    assert.equal(round.length,4);
    const matchIndex=new Map();
    round.forEach((m,i)=>{if(m.team_a_id)matchIndex.set(m.team_a_id,i);if(m.team_b_id)matchIndex.set(m.team_b_id,i)});
    for(const g of groups){
      assert.ok(matchIndex.has(g+"1"));assert.ok(matchIndex.has(g+"2"));
      assert.notEqual(Math.floor(matchIndex.get(g+"1")/2),Math.floor(matchIndex.get(g+"2")/2),g+" qualifiers must be in opposite halves");
    }
    assert.ok(round.every(m=>m.team_a_id?.[0]!==m.team_b_id?.[0]),"no first-round same-pool rematch");
  }finally{f.db.close()}
});

test("bracket generation refuses incomplete pools and refuses replacing an existing bracket",async()=>{
  const f=await accountFixture();
  try{
    addDivision(f.db);
    for(const [id,group] of [["A1","A"],["A2","A"],["B1","B"],["B2","B"]])
      f.db.prepare("INSERT INTO teams(id,division_id,name,group_code,status) VALUES(?,?,?,?, 'active')").run(id,"division",id,group);
    let r=await f.api("/api/divisions/division/generate-bracket",{},"POST");
    assert.equal(r.status,409);assert.equal(r.data.error,"GROUP_STAGE_NOT_COMPLETE");
    for(const g of ["A","B"]){
      f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status,completed_at) VALUES(?,?,?,?,?,?,'completed','2026-10-05T00:00:00Z')")
        .run("pool-"+g,"division",g+"1",g+"2",g+"1","Bảng "+g);
    }
    r=await f.api("/api/divisions/division/generate-bracket",{},"POST");assert.equal(r.status,200);
    r=await f.api("/api/divisions/division/generate-bracket",{},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"BRACKET_ALREADY_EXISTS");
  }finally{f.db.close()}
});

test("auto court scheduling respects minimum rest between a team's matches",async()=>{
  const f=await accountFixture();
  try{
    f.db.exec("UPDATE tournaments SET start_at='2026-10-05T01:00:00.000Z' WHERE id='own'");
    f.db.prepare("INSERT INTO divisions(id,tournament_id,name,format,minimum_rest_minutes,match_slot_minutes) VALUES(?,?,?,?,?,?)")
      .run("division","own","Đôi","round_robin",15,20);
    for(const id of ["A","B","C","D"])f.db.prepare("INSERT INTO teams(id,division_id,name,status) VALUES(?,?,?,'active')").run(id,"division",id);
    for(const id of ["c1","c2"])f.db.prepare("INSERT INTO courts(id,tournament_id,name,active) VALUES(?,?,?,1)").run(id,"own",id);
    let n=0;const teams=["A","B","C","D"];
    for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){
      f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status,created_at) VALUES(?,?,?,?,?,'scheduled',?)")
        .run("m"+(++n),"division",teams[i],teams[j],"Bảng A",new Date(Date.UTC(2026,9,5,0,0,n)).toISOString());
    }
    const r=await f.api("/api/divisions/division/auto-schedule-courts",{},"POST");
    assert.equal(r.status,200);assert.equal(r.data.updated,6);assert.equal(r.data.courts,2);
    const rows=f.db.prepare("SELECT team_a_id,team_b_id,scheduled_at,court_id FROM matches WHERE division_id='division' ORDER BY scheduled_at").all();
    assert.ok(rows.every(x=>x.court_id&&x.scheduled_at));
    for(const team of teams){
      const times=rows.filter(x=>x.team_a_id===team||x.team_b_id===team).map(x=>Date.parse(x.scheduled_at)).sort((a,b)=>a-b);
      for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=35*60*1000,team+" rest gap");
    }
  }finally{f.db.close()}
});
