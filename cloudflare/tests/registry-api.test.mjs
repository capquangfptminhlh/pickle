import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import worker from "../src/index.js";
import {signSession} from "../src/auth.js";

async function fixture(){
  const sqlite=new DatabaseSync(":memory:");
  for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(x=>x.endsWith(".sql")).sort())sqlite.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  const DB={
    afterFirst:null,
    prepare(sql){
      const make=args=>({sql,args,bind:(...next)=>make(next),
        async first(){const result=sqlite.prepare(sql).get(...args)||null;await DB.afterFirst?.(sql);return result},
        async all(){return {results:sqlite.prepare(sql).all(...args)}},
        async run(){return sqlite.prepare(sql).run(...args)}
      });return make([]);
    },
    async batch(statements){
      sqlite.exec("BEGIN");
      try{const results=statements.map(s=>sqlite.prepare(s.sql).run(...s.args));sqlite.exec("COMMIT");return results}
      catch(error){sqlite.exec("ROLLBACK");throw error}
    }
  };
  sqlite.exec(`INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES('admin','admin@test.vn','Admin','super_admin','unused'),('organizer','organizer@test.vn','Organizer','organizer','unused'),('referee','referee@test.vn','Referee','referee','unused');
    INSERT INTO clubs(id,name,slug) VALUES('club','CLB Đặng','club');
    INSERT INTO tournaments(id,name,slug,owner_user_id) VALUES('tour','Audit','audit','admin');
    INSERT INTO divisions(id,tournament_id,name,event_type) VALUES('division','tour','Doubles','doubles');
    INSERT INTO players(id,full_name,club_id) VALUES('p1','Đặng Văn A','club'),('p2','Nguyễn Văn B','club'),('p3','Trần Văn C',NULL),('p4','Lê Văn D',NULL);`);
  const env={DB,SESSION_SECRET:"audit-session-secret-only-for-local-tests-123456789",ROOMS:{idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})}};
  const tokens={};
  for(const role of ["admin","organizer","referee"])tokens[role]=await signSession(env,sqlite.prepare("SELECT * FROM app_users WHERE id=?").get(role));
  const api=async(path,body,method="POST",role="admin")=>{
    const response=await worker.fetch(new Request("https://audit.test"+path,{method,headers:{Authorization:"Bearer "+tokens[role],"Content-Type":"application/json"},body:JSON.stringify(body)}),env);
    return {status:response.status,data:await response.json()};
  };
  const create=(ids,extra={})=>api("/api/divisions/division/teams",{name:"Audit Team",playerIds:ids,...extra});
  const members=id=>sqlite.prepare("SELECT player_id FROM team_players WHERE team_id=? ORDER BY player_id").all(id).map(x=>x.player_id);
  return {sqlite,DB,api,create,members};
}

test("team creation persists an existing Unicode club name",async()=>{
  const f=await fixture();try{
    const r=await f.create(["p1","p2"],{club:"clb đặng"});assert.equal(r.status,201);assert.equal(r.data.club_id,"club");
  }finally{f.sqlite.close()}
});
test("failed team creation rolls back a new club and team",async()=>{
  const f=await fixture();try{
    // Inject an actual late SQL failure after prevalidation to exercise transaction rollback.
    f.sqlite.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON team_players WHEN NEW.player_id='p2' BEGIN SELECT RAISE(ABORT,'PLAYER_ALREADY_IN_DIVISION'); END;");
    const r=await f.create(["p1","p2"],{club:"New Club"});assert.equal(r.status,409);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM teams").get().n,0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM clubs").get().n,1);
  }finally{f.sqlite.close()}
});
test("reactivation rejects athletes reused by another active team",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]);assert.equal(a.status,201);
    assert.equal((await f.api(`/api/teams/${a.data.id}`,{status:"withdrawn"},"PATCH")).status,200);
    assert.equal((await f.create(["p1","p3"])).status,201);
    const r=await f.api(`/api/teams/${a.data.id}`,{status:"active"},"PATCH");assert.equal(r.status,409);assert.equal(r.data.error,"PLAYER_ALREADY_IN_DIVISION");
    assert.equal(f.sqlite.prepare("SELECT status FROM teams WHERE id=?").get(a.data.id).status,"withdrawn");
  }finally{f.sqlite.close()}
});
test("concurrent creation cannot assign one athlete twice and rolls back losing team",async()=>{
  const f=await fixture();try{
    let arrivals=0,release;const barrier=new Promise(resolve=>release=resolve);
    f.DB.afterFirst=async sql=>{if(sql.startsWith("SELECT t.id FROM team_players")){if(++arrivals===2)release();await barrier}};
    const results=await Promise.all([f.create(["p1","p2"]),f.create(["p1","p3"])]);
    assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_players WHERE player_id='p1'").get().n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM teams").get().n,1);
  }finally{f.sqlite.close()}
});
test("roster replacement keeps team registration and records audit",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]);
    f.sqlite.prepare("INSERT INTO registrations(id,division_id,team_id,status) VALUES('registration','division',?,'approved')").run(a.data.id);
    const r=await f.api(`/api/teams/${a.data.id}`,{playerIds:["p2","p3"]},"PATCH");assert.equal(r.status,200);assert.deepEqual(f.members(a.data.id),["p2","p3"]);
    assert.equal(f.sqlite.prepare("SELECT team_id FROM registrations WHERE id='registration'").get().team_id,a.data.id);
    const audit=f.sqlite.prepare("SELECT before_data,after_data FROM audit_logs WHERE entity_id=? AND action='UPDATE_TEAM' ORDER BY id DESC LIMIT 1").get(a.data.id);
    assert.deepEqual(JSON.parse(audit.before_data).playerIds.sort(),["p1","p2"]);assert.deepEqual(JSON.parse(audit.after_data).playerIds.sort(),["p2","p3"]);
  }finally{f.sqlite.close()}
});
test("invalid replacement preserves metadata and existing members",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]);const b=await f.create(["p3","p4"]);
    const r=await f.api(`/api/teams/${a.data.id}`,{name:"Should not save",playerIds:["p1","p3"]},"PATCH");assert.equal(r.status,409);assert.deepEqual(f.members(a.data.id),["p1","p2"]);
    assert.equal(f.sqlite.prepare("SELECT name FROM teams WHERE id=?").get(a.data.id).name,"Audit Team");assert.equal(b.status,201);
  }finally{f.sqlite.close()}
});
test("started matches lock roster changes while permitting metadata edits",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]);
    f.sqlite.prepare("INSERT INTO matches(id,division_id,team_a_id,status) VALUES('match','division',?,'live')").run(a.data.id);
    const r=await f.api(`/api/teams/${a.data.id}`,{playerIds:["p2","p3"]},"PATCH");assert.equal(r.status,409);assert.equal(r.data.error,"TEAM_ROSTER_LOCKED");assert.deepEqual(f.members(a.data.id),["p1","p2"]);
    assert.equal((await f.api(`/api/teams/${a.data.id}`,{name:"Metadata updated"},"PATCH")).status,200);
  }finally{f.sqlite.close()}
});
test("roster updates preserve tournament scope and referee restrictions",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]);
    for(const role of ["organizer","referee"])assert.equal((await f.api(`/api/teams/${a.data.id}`,{playerIds:["p2","p3"]},"PATCH",role)).status,403);
  }finally{f.sqlite.close()}
});
test("CSV names match Vietnamese case and canonically equivalent Unicode",async()=>{
  const f=await fixture();try{
    const r=await f.api("/api/divisions/division/import-teams",{rows:[{name:"Unicode Team",player1:"đặng văn a".normalize("NFD"),player2:"NGUYỄN VĂN B"}]});assert.equal(r.status,201);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM team_players").get().n,2);
  }finally{f.sqlite.close()}
});
test("Unicode CSV ambiguities retain row details and do not create teams",async()=>{
  const f=await fixture();try{
    f.sqlite.exec("INSERT INTO players(id,full_name) VALUES('other','đặng văn a');");
    const r=await f.api("/api/divisions/division/import-teams",{rows:[{name:"Ambiguous",player1:"ĐẶNG VĂN A",player2:"Nguyễn Văn B"}]});assert.equal(r.status,400);
    assert.ok(r.data.detail.issues.some(x=>x.row===1&&x.field==="player1"&&x.reason==="AMBIGUOUS_PLAYER"));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM teams").get().n,0);
  }finally{f.sqlite.close()}
});
test("concurrent legacy additions cannot exceed the team roster limit",async()=>{
  const f=await fixture();try{
    f.sqlite.exec("UPDATE divisions SET event_type='team'; INSERT INTO players(id,full_name) VALUES('p5','Fifth Athlete');");
    const a=await f.create(["p1","p2","p3"]);let arrivals=0,release;const barrier=new Promise(resolve=>release=resolve);
    f.DB.afterFirst=async sql=>{if(sql.startsWith("SELECT COUNT(*) AS count FROM team_players")){if(++arrivals===2)release();await barrier}};
    const r=await Promise.all(["p4","p5"].map(playerId=>f.api(`/api/teams/${a.data.id}/players`,{playerId})));
    assert.deepEqual(r.map(x=>x.status).sort(),[200,400]);assert.equal(f.members(a.data.id).length,4);
  }finally{f.sqlite.close()}
});
test("write-time guards reject direct reactivation and scored roster additions",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]);
    await f.api(`/api/teams/${a.data.id}`,{status:"withdrawn"},"PATCH");await f.create(["p1","p3"]);
    assert.throws(()=>f.sqlite.prepare("UPDATE teams SET status='active' WHERE id=?").run(a.data.id),/PLAYER_ALREADY_IN_DIVISION/);
    f.sqlite.exec("UPDATE divisions SET event_type='team';");
    f.sqlite.prepare("INSERT INTO matches(id,division_id,team_a_id,status,started_at) VALUES('oldmatch','division',?,'cancelled','2026-10-01')").run(a.data.id);
    assert.throws(()=>f.sqlite.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,'p4')").run(a.data.id),/TEAM_ROSTER_LOCKED/);
  }finally{f.sqlite.close()}
});
test("late replacement failure rolls back members, metadata and audit together",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"]),auditCount=f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs").get().n;
    f.sqlite.exec("CREATE TRIGGER audit_fail_replace BEFORE INSERT ON team_players WHEN NEW.player_id='p3' BEGIN SELECT RAISE(ABORT,'PLAYER_ALREADY_IN_DIVISION'); END;");
    const r=await f.api(`/api/teams/${a.data.id}`,{name:"Should roll back",playerIds:["p2","p3"]},"PATCH");
    assert.equal(r.status,409);assert.deepEqual(f.members(a.data.id),["p1","p2"]);
    assert.equal(f.sqlite.prepare("SELECT name FROM teams WHERE id=?").get(a.data.id).name,"Audit Team");assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs").get().n,auditCount);
  }finally{f.sqlite.close()}
});
test("metadata edits preserve an unchanged archived club",async()=>{
  const f=await fixture();try{
    const a=await f.create(["p1","p2"],{clubId:"club"});f.sqlite.exec("UPDATE clubs SET active=0 WHERE id='club';");
    const r=await f.api(`/api/teams/${a.data.id}`,{name:"Metadata",clubId:"club"},"PATCH");assert.equal(r.status,200);assert.equal(r.data.club_id,"club");
    assert.equal((await f.create(["p3","p4"],{clubId:"club"})).status,400);
  }finally{f.sqlite.close()}
});
