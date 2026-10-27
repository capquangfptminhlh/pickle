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
  f.db.exec("INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES ('viewer','viewer@test.invalid','Viewer','player','unused')");
  f.db.exec("UPDATE players SET user_id='viewer' WHERE id='d1'");
  f.tokens.viewer=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id='viewer'").get());
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
  const athleteGames=await api(f,"/api/open-play/me/matches","GET",undefined,"viewer");
  assert.equal(athleteGames.status,200);
  assert.equal(athleteGames.data.length,2,"linked player sees only their own confirmed games");
  assert.ok(athleteGames.data.every(m=>m.myTeam==="A"||m.myTeam==="B"));
  assert.equal(athleteGames.data[0].phone,undefined);
  assert.equal((await api(f,"/api/open-play/me/matches","GET",undefined,null)).status,401);
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
  const correction=base+"/matches/"+match.id+"/correction",history=base+"/matches/"+match.id+"/history";
  const correctedBody={version:2,scoreA:21,scoreB:17,reason:"BTC nhập nhầm điểm kết quả đội B, đối chiếu biên bản trận."};
  assert.equal((await api(f,correction,"PATCH",correctedBody,"local")).status,403);
  assert.equal((await api(f,correction,"PATCH",correctedBody,null)).status,401);
  assert.equal((await api(f,correction,"PATCH",{...correctedBody,reason:"ngắn"},"organizer")).status,400);
  assert.equal((await api(f,correction,"PATCH",{...correctedBody,scoreA:10},"organizer")).status,422);
  assert.equal((await api(f,correction,"PATCH",{...correctedBody,scoreB:19},"organizer")).status,409);
  const auditBefore=f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type='open_play_match' AND action='CORRECTION'").get().n;
  const fixed=await api(f,correction,"PATCH",correctedBody,"organizer");
  assert.equal(fixed.status,200,JSON.stringify(fixed.data));
  assert.equal(fixed.data.version,3);
  assert.equal(fixed.data.scoreB,17);
  assert.equal((await api(f,correction,"PATCH",correctedBody,"organizer")).status,409,"stale correction must conflict");
  assert.equal((await api(f,correction,"PATCH",{...correctedBody,version:3},"organizer")).status,409,"correction must change score");
  const trail=await api(f,history,"GET",undefined,"organizer");
  assert.equal(trail.status,200,JSON.stringify(trail.data));
  const revisions=trail.data.filter(x=>x.action==="CORRECTION");
  assert.equal(revisions.length,1,"only actual corrections are audited");
  assert.equal(revisions[0].before.scoreB,19);
  assert.equal(revisions[0].after.scoreB,17);
  assert.ok(revisions[0].reason.includes("biên bản"));
  assert.equal((await api(f,history,"GET",undefined,"local")).status,403);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type='open_play_match' AND action='CORRECTION'").get().n,auditBefore+1);
  current=await api(f,base+"/plan","GET",undefined,"organizer");
  assert.equal(current.data.plan.matches.every(m=>m.status==="completed"),true);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,0,"tournament score events remain isolated");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM open_play_matches").get().n,2);
  const updatedAthleteGames=await api(f,"/api/open-play/me/matches","GET",undefined,"viewer");
  assert.equal(updatedAthleteGames.status,200);
  assert.equal(updatedAthleteGames.data.every(m=>m.status==="completed"),true);
  assert.ok(updatedAthleteGames.data.every(m=>m.scoreA>=0&&m.scoreB>=0));
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

test("full session waitlist auto-promotes in FIFO order without revealing other players",async()=>{
 const f=await accountFixture();
 try{
  f.db.exec("INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES ('wait1','wait1@local.test','Wait One','player','unused'),('wait2','wait2@local.test','Wait Two','player','unused'),('wait3','wait3@local.test','Wait Three','player','unused'),('wait4','wait4@local.test','Wait Four','player','unused')");
  f.db.exec("INSERT INTO players(id,user_id,full_name,rating) VALUES ('w1','wait1','Wait 1',2.5),('w2','wait2','Wait 2',2.6),('w3','wait3','Wait 3',2.5),('w4','wait4','Wait 4',2.5)");
  for(const id of ["wait1","wait2","wait3","wait4"])
   f.tokens[id]=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
  const made=await api(f,"/api/open-play/sessions","POST",{...draft,maxPlayers:2,title:"Full Waitlist"},"organizer");
  assert.equal(made.status,201,JSON.stringify(made.data));
  const id=made.data.id,p="/api/open-play/sessions/"+id;
  assert.equal((await api(f,p+"/waitlist/join","POST",{playerId:"w3"},"wait3")).status,409,"waitlist only when full");
  assert.equal((await api(f,p,"PATCH",{selfSignupEnabled:true},"organizer")).status,200);
  for(const [player,actor] of [["w1","wait1"],["w2","wait2"]])
   assert.equal((await api(f,p+"/join","POST",{playerId:player},actor)).status,201);
  assert.equal((await api(f,p+"/join","POST",{playerId:"w3"},"wait3")).status,409);
  assert.equal((await api(f,p+"/waitlist/join","POST",{playerId:"w4"},"wait3")).status,403,"cannot waitlist another player");
  assert.equal((await api(f,p+"/waitlist/join","POST",{playerId:"w3"},null)).status,401);
  const q3=await api(f,p+"/waitlist/join","POST",{playerId:"w3"},"wait3");
  assert.equal(q3.status,201,JSON.stringify(q3.data));assert.equal(q3.data.position,1);
  const q4=await api(f,p+"/waitlist/join","POST",{playerId:"w4"},"wait4");
  assert.equal(q4.status,201,JSON.stringify(q4.data));assert.equal(q4.data.position,2);
  assert.equal((await api(f,p+"/waitlist/join","POST",{playerId:"w3"},"wait3")).status,409);
  const mine=await api(f,"/api/open-play/me","GET",undefined,"wait3");
  assert.equal(mine.status,200);
  assert.equal(mine.data.waitlist.length,1);
  assert.equal(mine.data.waitlist[0].playerId,"w3");
  assert.equal(mine.data.waitlist[0].position,1);
  assert.equal(mine.data.waitlist[0].phone,undefined);
  assert.equal((await api(f,p+"/waitlist","GET",undefined,null)).status,401);
  assert.equal((await api(f,p+"/waitlist","GET",undefined,"local")).status,403);
  const staff=await api(f,p+"/waitlist","GET",undefined,"organizer");
  assert.equal(staff.status,200);
  assert.deepEqual(staff.data.map(w=>w.playerId),["w3","w4"]);
  assert.equal(staff.data[0].email,undefined);
  const cancel=await api(f,p+"/self-cancel","POST",{playerId:"w1"},"wait1");
  assert.equal(cancel.status,200,JSON.stringify(cancel.data));
  assert.deepEqual(cancel.data.promotedPlayerIds,["w3"],"earliest queue slot promoted first");
  assert.equal(f.db.prepare("SELECT status FROM open_play_registrations WHERE session_id=? AND player_id='w3'").get(id).status,"registered");
  assert.equal(f.db.prepare("SELECT status FROM open_play_waitlist WHERE session_id=? AND player_id='w3'").get(id).status,"promoted");
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM open_play_registrations WHERE session_id=? AND status='registered'").get(id).n,2);
  assert.equal((await api(f,p+"/waitlist/self-cancel","POST",{playerId:"w4"},"wait3")).status,403);
  assert.equal((await api(f,p+"/waitlist/self-cancel","POST",{playerId:"w4"},"wait4")).status,200);
  const queue=await api(f,p+"/waitlist","GET",undefined,"organizer");
  assert.deepEqual(queue.data,[]);
  const again=await api(f,p+"/self-cancel","POST",{playerId:"w2"},"wait2");
  assert.equal(again.status,200);assert.deepEqual(again.data.promotedPlayerIds,[]);
  assert.equal((await api(f,p+"/waitlist/join","POST",{playerId:"w4"},"wait4")).status,409,"no waitlist on available slots");
  assert.equal((await api(f,p+"/join","POST",{playerId:"w4"},"wait4")).status,201);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM score_events").get().n,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type='open_play_waitlist' AND action='AUTO_PROMOTE'").get().n,1);
 }finally{f.db.close()}
});
test("official plan locks waitlist enrollment and registration cancellation",async()=>{
 const f=await accountFixture();
 try{
  const made=await api(f,"/api/open-play/sessions","POST",{...draft,maxPlayers:4,title:"Locked Queue"},"organizer");
  const id=made.data.id,p="/api/open-play/sessions/"+id;
  f.db.exec("INSERT INTO players(id,full_name,rating) VALUES ('l1','L1',2.5),('l2','L2',2.5),('l3','L3',2.5),('l4','L4',2.5),('l5','L5',2.5)");
  for(const playerId of ["l1","l2","l3","l4"]){
   assert.equal((await api(f,p+"/registrations","POST",{playerId},"organizer")).status,201);
   assert.equal((await api(f,p+"/check-in/"+playerId,"POST",{checkedIn:true},"organizer")).status,200);
  }
  assert.equal((await api(f,p+"/waitlist","POST",{playerId:"l5"},"organizer")).status,201);
  assert.equal((await api(f,p+"/plan","POST",{rounds:1,courts:1},"organizer")).status,201);
  assert.equal((await api(f,p,"PATCH",{selfSignupEnabled:true},"organizer")).status,409,"cannot reopen confirmed roster");

  assert.equal((await api(f,p+"/waitlist","POST",{playerId:"l5"},"organizer")).status,409);
  assert.equal((await api(f,p+"/registrations/l1/cancel","POST",{},"organizer")).status,409);
  assert.equal(f.db.prepare("SELECT status FROM open_play_waitlist WHERE session_id=? AND player_id='l5'").get(id).status,"cancelled");
  assert.equal(f.db.prepare("SELECT self_signup_enabled FROM open_play_sessions WHERE id=?").get(id).self_signup_enabled,0);
  assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM open_play_registrations WHERE session_id=? AND status='registered'").get(id).n,4);
 }finally{f.db.close()}
});
