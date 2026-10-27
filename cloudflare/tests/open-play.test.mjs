import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {accountFixture} from "./helpers/accounts-fixture.mjs";
import {signSession} from "../src/auth.js";

async function api(f,path,method="GET",body,actor="admin"){
  const headers={"Content-Type":"application/json"};
  if(actor&&f.tokens[actor])headers.Authorization="Bearer "+f.tokens[actor];
  const req=new Request("https://pickle.test"+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
  const res=await worker.fetch(req,f.env);
  return {status:res.status,data:await res.json()};
}
const draft={title:"Open Play Bình Lợi",startsAt:"2026-11-01T11:00:00+07:00",maxPlayers:2,maxCombinedRating:5.2,tolerance:0};

test("Open Play sessions are permission scoped and isolated from match scores",async()=>{
 const f=await accountFixture();
 try{
  let r=await api(f,"/api/open-play/sessions","GET",undefined,null);assert.equal(r.status,401);
  r=await api(f,"/api/open-play/sessions","GET",undefined,"local");assert.equal(r.status,403);
  r=await api(f,"/api/open-play/sessions","POST",draft,"organizer");
  assert.equal(r.status,201,JSON.stringify(r.data));
  const id=r.data.id;
  const denied=await api(f,"/api/open-play/sessions/"+id,"GET",undefined,"local");assert.equal(denied.status,403);
  const read=await api(f,"/api/open-play/sessions/"+id,"GET",undefined,"organizer");
  assert.equal(read.status,200);assert.equal(read.data.registrations.length,0);
  const adminList=await api(f,"/api/open-play/sessions","GET");assert.equal(adminList.status,200);
  assert.ok(adminList.data.some(s=>s.id===id));
  f.db.exec("INSERT INTO players(id,full_name,rating) VALUES ('p1','VĐV 1',2.5),('p2','VĐV 2',2.7),('p3','VĐV 3',2.0)");
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p1"},"organizer")).status,201);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p1"},"organizer")).status,409);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p2"},"organizer")).status,201);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p3"},"organizer")).status,409);
  const pairs=await api(f,"/api/open-play/sessions/"+id+"/pairs","GET",undefined,"organizer");
  assert.equal(pairs.status,200);assert.equal(pairs.data.pairs.length,1);
  assert.equal(pairs.data.pairs[0].combinedRating,5.2);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations/p2/cancel","POST",{},"organizer")).status,200);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p3"},"organizer")).status,201);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p2"},"organizer")).status,409,"full session must reject cancelled-player rejoin");
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations/p3/cancel","POST",{},"organizer")).status,200);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p2"},"organizer")).status,200,"rejoin after cancellation should work when capacity becomes free");
  const updated=await api(f,"/api/open-play/sessions/"+id,"PATCH",{status:"closed"},"organizer");
  assert.equal(updated.status,200);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId:"p2"},"organizer")).status,409);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,0);
  assert.ok(f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type LIKE 'open_play%'").get().n>=5);
 }finally{f.db.close()}
});
test("Open Play validates title, date, rating and capacity",async()=>{
 const f=await accountFixture();
 try{
  for(const body of [{...draft,title:""},{...draft,maxPlayers:257},{...draft,startsAt:"not-a-date"},{...draft,tolerance:1}]){
    const r=await api(f,"/api/open-play/sessions","POST",body);
    assert.equal(r.status,400,JSON.stringify(r.data));
  }
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM open_play_sessions").get().n,0);
 }finally{f.db.close()}
});

test("public discovery is opt-in and players may register/cancel only their own profile",async()=>{
 const f=await accountFixture();
 try{
  f.db.exec("INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES ('self1','self1@example.test','User 1','player','unused'),('self2','self2@example.test','User 2','player','unused');");
  f.db.exec("INSERT INTO players(id,user_id,full_name,rating) VALUES ('owned1','self1','Self One',2.5),('owned2','self2','Self Two',2.7);");
  for(const id of ["self1","self2"])f.tokens[id]=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
  const personal=await api(f,"/api/open-play/me","GET",undefined,"self1");
  assert.equal(personal.status,200);
  assert.deepEqual(personal.data.players.map(p=>p.id),["owned1"]);
  assert.equal(personal.data.players[0].phone,undefined);
  assert.equal((await api(f,"/api/open-play/me","GET",undefined,null)).status,401);
  const creation=await api(f,"/api/open-play/sessions","POST",{...draft,title:"Public Open Play"},"organizer");
  assert.equal(creation.status,201);
  const id=creation.data.id;
  let listing=await api(f,"/api/open-play/public/sessions","GET",undefined,null);
  assert.equal(listing.status,200);assert.equal(listing.data.some(s=>s.id===id),false,"sessions must be private by default");
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned1"},"self1")).status,409);
  let update=await api(f,"/api/open-play/sessions/"+id,"PATCH",{selfSignupEnabled:true},"organizer");
  assert.equal(update.status,200,JSON.stringify(update.data));assert.equal(update.data.selfSignupEnabled,true);
  listing=await api(f,"/api/open-play/public/sessions","GET",undefined,null);
  const exposed=listing.data.find(s=>s.id===id);assert.ok(exposed);
  assert.equal(exposed.organizerId,undefined);assert.equal(exposed.registrations,undefined);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned1"},null)).status,401);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned2"},"self1")).status,403);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned1"},"self2")).status,403);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned1"},"self1")).status,201);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned1"},"self1")).status,409);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned2"},"self2")).status,201);
  const onlyMine=await api(f,"/api/open-play/me","GET",undefined,"self1");
  assert.deepEqual(onlyMine.data.registrations.map(r=>r.playerId),["owned1"]);
  assert.equal(onlyMine.data.registrations[0].phone,undefined);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/self-cancel","POST",{playerId:"owned2"},"self1")).status,403);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/self-cancel","POST",{playerId:"owned2"},"self2")).status,200);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned2"},"self2")).status,200,"rejoin should be possible");
  assert.equal((await api(f,"/api/open-play/sessions/"+id,"PATCH",{selfSignupEnabled:"yes"},"organizer")).status,400);
  update=await api(f,"/api/open-play/sessions/"+id,"PATCH",{status:"closed"},"organizer");
  assert.equal(update.status,200);assert.equal(update.data.selfSignupEnabled,false);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/join","POST",{playerId:"owned1"},"self1")).status,409);
  listing=await api(f,"/api/open-play/public/sessions","GET",undefined,null);
  assert.equal(listing.data.some(s=>s.id===id),false);
 }finally{f.db.close()}
});

test("staff multi-round court preview is scoped, deterministic and read-only",async()=>{
 const f=await accountFixture();
 try{
  const made=await api(f,"/api/open-play/sessions","POST",{...draft,maxPlayers:4,title:"Doubles Preview"},"organizer");
  assert.equal(made.status,201,JSON.stringify(made.data));
  const id=made.data.id;
  f.db.exec("INSERT INTO players(id,full_name,rating) VALUES ('r1','Player 1',2.5),('r2','Player 2',2.5),('r3','Player 3',2.5),('r4','Player 4',2.5)");
  for(const playerId of ["r1","r2","r3","r4"]){
   const joined=await api(f,"/api/open-play/sessions/"+id+"/registrations","POST",{playerId},"organizer");
   assert.equal(joined.status,201,JSON.stringify(joined.data));
  }
  const path="/api/open-play/sessions/"+id+"/rounds/preview?rounds=3&courts=1";
  assert.equal((await api(f,path,"GET",undefined,null)).status,401);
  assert.equal((await api(f,path,"GET",undefined,"local")).status,403);
  const before={
   score:f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,
   audit:f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get().n,
   registrations:f.db.prepare("SELECT COUNT(*) AS n FROM open_play_registrations").get().n
  };
  const first=await api(f,path,"GET",undefined,"organizer");
  assert.equal(first.status,200,JSON.stringify(first.data));
  assert.equal(first.data.previewOnly,true);
  assert.equal(first.data.rounds.length,3);
  assert.equal(first.data.rounds.every(r=>r.courts.length===1),true);
  const teams=first.data.rounds.flatMap(r=>r.courts.flatMap(c=>[c.teamA,c.teamB]));
  assert.equal(new Set(teams.map(t=>[...t.playerIds].sort().join(":"))).size,6);
  assert.equal(teams.every(t=>t.combinedRating<=5.2),true);
  const second=await api(f,path,"GET",undefined,"organizer");
  assert.deepEqual(second.data,first.data);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/rounds/preview?rounds=0&courts=1","GET",undefined,"organizer")).status,422);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/rounds/preview?rounds=3&courts=100","GET",undefined,"organizer")).status,422);
  assert.deepEqual({
   score:f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,
   audit:f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs").get().n,
   registrations:f.db.prepare("SELECT COUNT(*) AS n FROM open_play_registrations").get().n
  },before,"preview must never change tournament or Open Play persistence");
 }finally{f.db.close()}
});

test("day-of-event check-in, confirmed rounds, guarded scores and session completion",async()=>{
 const f=await accountFixture();
 try{
  const made=await api(f,"/api/open-play/sessions","POST",{...draft,maxPlayers:4,title:"Game Day"},"organizer");
  assert.equal(made.status,201,JSON.stringify(made.data));
  const id=made.data.id,base="/api/open-play/sessions/"+id;
  f.db.exec("INSERT INTO players(id,full_name,rating) VALUES ('d1','First',2.5),('d2','Second',2.5),('d3','Third',2.5),('d4','Fourth',2.5)");
  for(const playerId of ["d1","d2","d3","d4"]){
   assert.equal((await api(f,base+"/registrations","POST",{playerId},"organizer")).status,201);
  }
  assert.equal((await api(f,base+"/plan","GET",undefined,null)).status,401);
  assert.equal((await api(f,base+"/plan","GET",undefined,"local")).status,403);
  assert.equal((await api(f,base+"/check-in/d1","POST",{checkedIn:true},"local")).status,403);
  assert.equal((await api(f,base+"/check-in/not-a-player","POST",{checkedIn:true},"organizer")).status,404);
  assert.equal((await api(f,base+"/check-in/d1","POST",{checkedIn:"yes"},"organizer")).status,400);
  assert.equal((await api(f,base+"/plan","POST",{rounds:2,courts:1},"organizer")).status,422);
  for(const playerId of ["d1","d2","d3","d4"]){
   assert.equal((await api(f,base+"/check-in/"+playerId,"POST",{checkedIn:true},"organizer")).status,200);
  }
  let current=await api(f,base+"/plan","GET",undefined,"organizer");
  assert.equal(current.status,200);assert.equal(current.data.checkins.length,4);assert.equal(current.data.plan,null);
  assert.equal((await api(f,base+"/plan","POST",{rounds:2,courts:1,pointTarget:13},"organizer")).status,400);
  const confirmed=await api(f,base+"/plan","POST",{rounds:2,courts:1,pointTarget:21,winBy:1},"organizer");
  assert.equal(confirmed.status,201,JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.plan.matches.length,2);
  assert.equal(confirmed.data.previewOnly,false);
  const match=confirmed.data.plan.matches[0];
  assert.equal(match.status,"scheduled");
  assert.equal(new Set([...match.teamA,...match.teamB]).size,4);
  assert.equal((await api(f,base+"/plan","POST",{rounds:2,courts:1},"organizer")).status,409);
  assert.equal((await api(f,base+"/check-in/d1","POST",{checkedIn:false},"organizer")).status,409);
  assert.equal((await api(f,base+"/registrations/d1/cancel","POST",{},"organizer")).status,409);
  assert.equal((await api(f,base,"PATCH",{status:"closed"},"organizer")).status,409);
  const scoreRoute=base+"/matches/"+match.id+"/score";
  assert.equal((await api(f,scoreRoute,"PATCH",{version:0,scoreA:1,scoreB:0,finish:false},"local")).status,403);
  assert.equal((await api(f,scoreRoute,"PATCH",{version:0,scoreA:-1,scoreB:0,finish:false},"organizer")).status,400);
  assert.equal((await api(f,scoreRoute,"PATCH",{version:0,scoreA:10,scoreB:9,finish:true},"organizer")).status,422);
  assert.equal((await api(f,scoreRoute,"PATCH",{version:0,scoreA:21,scoreB:19,finish:false},"organizer")).status,422);
  const live=await api(f,scoreRoute,"PATCH",{version:0,scoreA:5,scoreB:4,finish:false},"organizer");
  assert.equal(live.status,200,JSON.stringify(live.data));assert.equal(live.data.version,1);assert.equal(live.data.status,"live");
  assert.equal((await api(f,scoreRoute,"PATCH",{version:0,scoreA:8,scoreB:4,finish:false},"organizer")).status,409);
  const finished=await api(f,scoreRoute,"PATCH",{version:1,scoreA:21,scoreB:19,finish:true},"organizer");
  assert.equal(finished.status,200);assert.equal(finished.data.status,"completed");
  assert.equal((await api(f,scoreRoute,"PATCH",{version:2,scoreA:21,scoreB:20,finish:true},"organizer")).status,409);
  const remaining=confirmed.data.plan.matches[1];
  assert.equal((await api(f,base,"PATCH",{status:"closed"},"organizer")).status,409);
  const finishLast=await api(f,base+"/matches/"+remaining.id+"/score","PATCH",{version:0,scoreA:17,scoreB:21,finish:true},"organizer");
  assert.equal(finishLast.status,200,JSON.stringify(finishLast.data));
  assert.equal((await api(f,base,"PATCH",{status:"closed"},"organizer")).status,200);
  current=await api(f,base+"/plan","GET",undefined,"organizer");
  assert.equal(current.data.plan.matches.every(m=>m.status==="completed"),true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,0,"tournament score events remain isolated");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM open_play_matches").get().n,2);
  assert.ok(f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type='open_play_match'").get().n>=3);
 }finally{f.db.close()}
});
test("game-day scoring cannot read or change another organizer's schedule",async()=>{
 const f=await accountFixture();
 try{
  const made=await api(f,"/api/open-play/sessions","POST",{...draft,title:"Hidden Open Play"},"organizer");
  const id=made.data.id;
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/plan","GET",undefined,"local")).status,403);
  assert.equal((await api(f,"/api/open-play/sessions/"+id+"/matches/random/score","PATCH",{scoreA:21,scoreB:0,version:0,finish:true},"local")).status,403);
 }finally{f.db.close()}
});
