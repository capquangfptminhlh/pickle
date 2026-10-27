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
