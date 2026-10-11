import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

function addDivision(db,format="pool_to_knockout",count=3,id="division"){
  db.prepare("INSERT INTO divisions(id,tournament_id,name,format,advance_count) VALUES(?,?,?,?,2)").run(id,"own","Đôi",format);
  for(let seed=1;seed<=count;seed++)db.prepare("INSERT INTO teams(id,division_id,name,seed,group_code,status) VALUES(?,?,?,?,?,'active')").run(id+"-t"+seed,id,"Team "+seed,seed,"A");
}
function addMatch(db,id,a,b,{winner=a,status="completed",stage="Bảng A"}={}){
  db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status) VALUES(?,?,?,?,?,?,?)")
    .run(id,"division","division-t"+a,"division-t"+b,winner===null?null:"division-t"+winner,stage,status);
}
function completePool(db){
  addMatch(db,"pool12",1,2);addMatch(db,"pool13",1,3);addMatch(db,"pool23",2,3);
}
const generate=f=>f.api("/api/divisions/division/generate-bracket",{},"POST");
const bracketRows=db=>db.prepare("SELECT * FROM matches WHERE division_id='division' AND bracket_slot IS NOT NULL ORDER BY bracket_slot").all();
function synchronizeEmptyPrechecks(f){
  const prepare=f.env.DB.prepare;let arrivals=0,release;
  const ready=new Promise(resolve=>{release=resolve});
  f.env.DB.prepare=sql=>{
    const statement=prepare(sql);
    if(!sql.startsWith("SELECT id,status,winner_team_id,started_at"))return statement;
    const wrap=s=>({...s,bind:(...args)=>wrap(s.bind(...args)),all:async()=>{
      const result=await s.all();assert.equal(result.results.length,0,"both concurrent requests precheck an empty bracket");
      if(++arrivals===2)release();await ready;return result;
    }});
    return wrap(statement);
  };
}
async function assertIncomplete(f){
  const response=await generate(f);
  assert.equal(response.status,409);
  assert.equal(response.data.error,"GROUP_STAGE_NOT_COMPLETE");
  assert.equal(bracketRows(f.db).length,0);
}

test("duplicate completed pool results cannot replace a missing unordered team pair",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db);addMatch(f.db,"pool12",1,2);addMatch(f.db,"pool21",2,1);addMatch(f.db,"pool13",1,3);
    await assertIncomplete(f);
  }finally{f.db.close()}
});

test("completed duplicates are allowed when every active team pair has a valid result",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db);completePool(f.db);addMatch(f.db,"duplicate21",2,1);
    assert.equal((await generate(f)).status,200);
  }finally{f.db.close()}
});

for(const status of ["scheduled","ready","live"]){
  test("a "+status+" duplicate prevents pool completion despite a finished result for the pair",async()=>{
    const f=await accountFixture();try{
      addDivision(f.db);completePool(f.db);addMatch(f.db,"pending21",2,1,{winner:null,status});
      await assertIncomplete(f);
    }finally{f.db.close()}
  });
}

test("a completed pool result with a winner outside the pair does not complete that pair",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db);completePool(f.db);f.db.exec("UPDATE matches SET winner_team_id='division-t3' WHERE id='pool12'");
    await assertIncomplete(f);
  }finally{f.db.close()}
});

test("a finished non-group match cannot stand in for a missing group result",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db);completePool(f.db);f.db.exec("UPDATE matches SET stage='Chung kết' WHERE id='pool12'");
    await assertIncomplete(f);
  }finally{f.db.close()}
});

test("withdrawn teams and cancelled duplicates do not block complete active pools",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db,"pool_to_knockout",4);completePool(f.db);
    f.db.exec("UPDATE teams SET status='withdrawn' WHERE id='division-t4'");
    addMatch(f.db,"cancelled21",2,1,{winner:null,status:"cancelled"});
    addMatch(f.db,"withdrawn14",1,4,{winner:null,status:"live"});
    assert.equal((await generate(f)).status,200);
  }finally{f.db.close()}
});

for(const [format,count,failSlot,expected] of [
  ["single_elimination",3,"SE-R1-M2",3],
  ["double_elimination",4,"DE-L-R1-M1",6]
]){
  test(format+" rolls back a later insert failure and permits a clean retry",async()=>{
    const f=await accountFixture();try{
      addDivision(f.db,format,count);
      f.db.exec("CREATE TRIGGER fail_bracket_insert BEFORE INSERT ON matches WHEN NEW.bracket_slot='"+failSlot+"' BEGIN SELECT RAISE(ABORT,'TEST_BRACKET_FAILURE'); END;");
      assert.equal((await generate(f)).status,500);
      assert.equal(bracketRows(f.db).length,0,"all earlier bracket writes must roll back");
      f.db.exec("DROP TRIGGER fail_bracket_insert");
      const retry=await generate(f);
      assert.equal(retry.status,200);assert.equal(retry.data.created,expected);assert.equal(bracketRows(f.db).length,expected);
    }finally{f.db.close()}
  });

  test("simultaneous "+format+" generation commits one complete bracket and returns one conflict",async()=>{
    const f=await accountFixture();try{
      addDivision(f.db,format,count);
      synchronizeEmptyPrechecks(f);
      const responses=await Promise.all([generate(f),generate(f)]);
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
      assert.equal(responses.find(r=>r.status===409).data.error,"BRACKET_ALREADY_EXISTS");
      const matches=bracketRows(f.db);assert.equal(matches.length,expected);
      assert.equal(new Set(matches.map(m=>m.bracket_slot)).size,expected);
    }finally{f.db.close()}
  });
}

test("single elimination preserves seed positions, topology, and bye propagation in one batch",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db,"single_elimination",5);
    const batch=f.env.DB.batch;let batches=0;
    f.env.DB.batch=async statements=>{batches++;return batch(statements)};
    const response=await generate(f);assert.equal(response.status,200);assert.equal(response.data.bracketSize,8);assert.equal(response.data.created,7);
    assert.equal(batches,1,"the entire bracket is persisted in one atomic batch");
    const matches=bracketRows(f.db),byId=new Map(matches.map(m=>[m.id,m])),bySlot=new Map(matches.map(m=>[m.bracket_slot,m]));
    for(const [slot,a,b,status,winner,next,side] of [
      ["SE-R1-M1",1,null,"completed",1,"SE-R2-M1","A"],
      ["SE-R1-M2",4,5,"scheduled",null,"SE-R2-M1","B"],
      ["SE-R1-M3",2,null,"completed",2,"SE-R2-M2","A"],
      ["SE-R1-M4",3,null,"completed",3,"SE-R2-M2","B"],
      ["SE-R2-M1",1,null,"scheduled",null,"SE-R3-M1","A"],
      ["SE-R2-M2",2,3,"scheduled",null,"SE-R3-M1","B"],
      ["SE-R3-M1",null,null,"scheduled",null,null,null]
    ]){
      const m=bySlot.get(slot),team=id=>id===null?null:"division-t"+id;
      assert.equal(m.team_a_id,team(a),slot);assert.equal(m.team_b_id,team(b),slot);assert.equal(m.status,status,slot);assert.equal(m.winner_team_id,team(winner),slot);
      assert.equal(byId.get(m.next_match_id)?.bracket_slot||null,next,slot);assert.equal(m.next_match_side,side,slot);assert.equal(m.version,1);
      if(winner)assert.ok(m.completed_at);
    }
  }finally{f.db.close()}
});

test("double elimination preserves winner and loser topology and seed positions in one batch",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db,"double_elimination",8);
    const batch=f.env.DB.batch;let batches=0;f.env.DB.batch=async statements=>{batches++;return batch(statements)};
    const response=await generate(f);assert.equal(response.status,200);assert.equal(response.data.created,14);assert.equal(batches,1);
    const matches=bracketRows(f.db),byId=new Map(matches.map(m=>[m.id,m])),bySlot=new Map(matches.map(m=>[m.bracket_slot,m]));
    for(const [slot,next,side,loser,loserSide] of [
      ["DE-W-R1-M1","DE-W-R2-M1","A","DE-L-R1-M1","A"],
      ["DE-W-R1-M2","DE-W-R2-M1","B","DE-L-R1-M1","B"],
      ["DE-W-R1-M3","DE-W-R2-M2","A","DE-L-R1-M2","A"],
      ["DE-W-R1-M4","DE-W-R2-M2","B","DE-L-R1-M2","B"],
      ["DE-W-R2-M1","DE-W-R3-M1","A","DE-L-R2-M1","B"],
      ["DE-W-R2-M2","DE-W-R3-M1","B","DE-L-R2-M2","B"],
      ["DE-W-R3-M1","DE-GF-M1","A","DE-L-R4-M1","B"],
      ["DE-L-R1-M1","DE-L-R2-M1","A",null,null],
      ["DE-L-R1-M2","DE-L-R2-M2","A",null,null],
      ["DE-L-R2-M1","DE-L-R3-M1","A",null,null],
      ["DE-L-R2-M2","DE-L-R3-M1","B",null,null],
      ["DE-L-R3-M1","DE-L-R4-M1","A",null,null],
      ["DE-L-R4-M1","DE-GF-M1","B",null,null],
      ["DE-GF-M1",null,null,null,null]
    ]){
      const m=bySlot.get(slot);assert.ok(m,slot);
      assert.equal(byId.get(m.next_match_id)?.bracket_slot||null,next,slot);assert.equal(m.next_match_side,side,slot);
      assert.equal(byId.get(m.loser_next_match_id)?.bracket_slot||null,loser,slot);assert.equal(m.loser_next_match_side,loserSide,slot);assert.equal(m.status,"scheduled");
    }
    assert.deepEqual([1,2,3,4].map(n=>{const m=bySlot.get("DE-W-R1-M"+n);return [m.team_a_id,m.team_b_id]}),[[1,8],[4,5],[2,7],[3,6]].map(pair=>pair.map(n=>"division-t"+n)));
  }finally{f.db.close()}
});

test("slot guard permits null slots and equal slots in different divisions",async()=>{
  const f=await accountFixture();try{
    addDivision(f.db,"single_elimination",2);addDivision(f.db,"single_elimination",2,"otherdivision");
    const insert=f.db.prepare("INSERT INTO matches(id,division_id,bracket_slot) VALUES(?,?,?)");
    insert.run("one","division","SE-R1-M1");insert.run("two","otherdivision","SE-R1-M1");
    insert.run("poolone","division",null);insert.run("pooltwo","division",null);
    assert.throws(()=>insert.run("duplicate","division","SE-R1-M1"),/BRACKET_ALREADY_EXISTS/);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches").get().n,4);
  }finally{f.db.close()}
});

test("new slot guard installs over historical duplicates without deleting or updating them",()=>{
  const db=new DatabaseSync(":memory:");try{
    const directory=new URL("../migrations/",import.meta.url),files=readdirSync(directory).filter(name=>name.endsWith(".sql")).sort();
    for(const file of files.filter(name=>name<"0008"))db.exec(readFileSync(new URL(file,directory),"utf8"));
    db.exec("INSERT INTO tournaments(id,name,slug) VALUES('own','Historical','historical')");addDivision(db,"single_elimination",2);
    db.exec("INSERT INTO matches(id,division_id,bracket_slot) VALUES('historic1','division','SE-R1-M1'),('historic2','division','SE-R1-M1')");
    const before=db.prepare("SELECT * FROM matches ORDER BY id").all();
    for(const file of files.filter(name=>name>="0008"))db.exec(readFileSync(new URL(file,directory),"utf8"));
    const originalColumns=Object.keys(before[0]).map(name=>'"'+name+'"').join(',');
    assert.deepEqual(db.prepare(`SELECT ${originalColumns} FROM matches ORDER BY id`).all(),before,'additive columns must not alter historical values');
    assert.ok(db.prepare('SELECT timeout_side,timeout_started_at,timeout_ends_at FROM matches').all().every(row=>Object.values(row).every(value=>value===null)));
    assert.throws(()=>db.exec("INSERT INTO matches(id,division_id,bracket_slot) VALUES('newduplicate','division','SE-R1-M1')"),/BRACKET_ALREADY_EXISTS/);
  }finally{db.close()}
});
