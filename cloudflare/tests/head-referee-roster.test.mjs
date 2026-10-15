import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

test("ordinary referee cannot add VDV to the system",async()=>{
  const f=await accountFixture();
  try{
    f.db.exec("INSERT INTO divisions(id,tournament_id,name,event_type) VALUES('own-div','own','Doubles','doubles')");
    const a=await f.api("/api/players",{fullName:"Not allowed"},"POST","local");
    const b=await f.api("/api/referee/players/bulk",{names:["Not allowed"]},"POST","local");
    const c=await f.api("/api/divisions/own-div/teams",{playerIds:["x","y"]},"POST","local");
    assert.equal(a.status,403);assert.equal(b.status,403);assert.equal(c.status,403);
  }finally{f.db.close()}
});

test("head referee can enter athletes only for assigned tournament",async()=>{
  const f=await accountFixture();
  try{
    f.db.exec("INSERT INTO divisions(id,tournament_id,name,event_type) VALUES('own-div','own','Doubles','doubles'),('other-div','other','Doubles','doubles'); UPDATE app_users SET is_head_referee=1 WHERE id='local'");
    let r=await f.api("/api/referee/players/bulk",{names:["Nguyen Van A","Tran Thi B"," Nguyen Van A "]},"POST","local");
    assert.equal(r.status,201);assert.equal(r.data.created,2);assert.equal(r.data.skipped,1);
    r=await f.api("/api/referee/players/bulk",{names:["Nguyen Van A"]},"POST","local");
    assert.equal(r.status,201);assert.equal(r.data.created,0);
    const ids=f.db.prepare("SELECT id FROM players WHERE created_by_user_id='local'").all().map(x=>x.id);
    assert.equal(ids.length,2);
    r=await f.api("/api/admin/state",undefined,"GET","local");
    assert.equal(r.status,200);assert.deepEqual(r.data.tournaments.map(t=>t.id),["own"]);
    r=await f.api("/api/players",undefined,"GET","local");assert.equal(r.data.length,2);
    r=await f.api("/api/divisions/other-div/teams",{playerIds:ids},"POST","local");assert.equal(r.status,403);
    r=await f.api("/api/divisions/own-div/teams",{playerIds:ids},"POST","local");assert.equal(r.status,201);
    f.db.exec("INSERT INTO matches(id,division_id) VALUES('started-draw','own-div')");
    r=await f.api("/api/divisions/own-div/teams",{playerIds:ids},"POST","local");
    assert.equal(r.status,409);assert.equal(r.data.error,"ROSTER_LOCKED");
    r=await f.api("/api/users",undefined,"GET","local");assert.equal(r.status,403);
  }finally{f.db.close()}
});

test("head referee grant requires an owned tournament",async()=>{
  const f=await accountFixture();
  try{
    const r=await f.api("/api/users/referees/local",{headReferee:true,tournamentId:null},"PATCH","organizer");
    assert.equal(r.status,400);
    const s=await f.api("/api/users/referees/local",{headReferee:true},"PATCH","organizer");
    assert.equal(s.status,200);assert.equal(s.data.headReferee,true);
    const invalid=await f.api("/api/auth/me",undefined,"GET","local");
    assert.equal(invalid.status,401,"role upgrades invalidate older login");
  }finally{f.db.close()}
});
