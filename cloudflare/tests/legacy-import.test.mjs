import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

test("super admin imports legacy localStorage state into D1 idempotently",async()=>{
  const f=await accountFixture();
  try{
    const legacy={
      branding:{name:"Pickleup.vn",primaryColor:"#0a8b55",accentColor:"#dfff69"},
      clubs:[{id:"club-old",name:"Bình Lợi",city:"TP.HCM",active:true}],
      players:[
        {id:"p1",full_name:"Minh Búa",gender:"male",rating:3.2,club_id:"club-old",active:true,avatar_url:"data:image/svg+xml,legacy"},
        {id:"p2",full_name:"Quốc Anh",gender:"male",rating:3.1,club_id:"club-old",active:true}
      ],
      tournaments:[{id:"tour-old",name:"Giải Bình Lợi",venue:"Sân Bình Lợi",startAt:"2026-10-10T08:00:00+07:00",status:"open",publicVisible:true}],
      divisions:[{id:"div-old",tournamentId:"tour-old",name:"Đôi nam",eventType:"doubles",format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,advanceCount:2}],
      courts:[{id:"court-old",tournamentId:"tour-old",name:"Sân 1",sortOrder:1,active:true}],
      teams:[{id:"team-old",divisionId:"div-old",name:"Minh Búa / Quốc Anh",clubId:"club-old",group:"A",seed:1,status:"active"}],
      teamPlayers:{"team-old":["p1","p2"]},
      matches:[{id:"match-old",divisionId:"div-old",stage:"Bảng A",courtId:"court-old",time:"08:30",a:"team-old",b:"TBD",status:"wait",sets:[],current:[0,0],version:1}],
      registrations:[{id:"reg-old",status:"approved",payment_status:"paid",amount:400000,team_name:"Minh Búa / Quốc Anh",division_name:"Đôi nam",tournament_name:"Giải Bình Lợi"}],
      referees:[{id:"r-old",email:"legacy@test.vn",password:"plaintext-legacy"}]
    };
    let r=await f.api("/api/admin/import-legacy-state",{state:legacy},"POST","admin");
    assert.equal(r.status,200);
    assert.equal(r.data.ok,true);
    assert.equal(r.data.counts.tournaments,1);
    assert.equal(r.data.counts.players,2);
    assert.ok(r.data.warnings.some(x=>x.includes("trọng tài")));

    const t=f.db.prepare("SELECT * FROM tournaments WHERE id='tour-old'").get();
    assert.equal(t.status,"registration");assert.equal(t.public_visible,1);assert.equal(t.owner_user_id,"admin");
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='team-old'").get().n,2);
    assert.equal(f.db.prepare("SELECT status,scheduled_at FROM matches WHERE id='match-old'").get().status,"scheduled");
    assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='reg-old'").get().payment_status,"paid");
    assert.equal(f.db.prepare("SELECT avatar_url FROM players WHERE id='p1'").get().avatar_url,null);

    r=await f.api("/api/admin/import-legacy-state",{state:legacy},"POST","admin");
    assert.equal(r.status,200);
    assert.equal(f.db.prepare("SELECT count(*) n FROM tournaments WHERE id='tour-old'").get().n,1);
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='team-old'").get().n,2);
    assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE action='IMPORT_LEGACY_STATE' ORDER BY id DESC LIMIT 1").get());
  }finally{f.db.close()}
});

test("legacy import is super-admin only and rejects empty state",async()=>{
  const f=await accountFixture();
  try{
    let r=await f.api("/api/admin/import-legacy-state",{state:{tournaments:[{id:"x",name:"X"}]}},"POST","organizer");
    assert.equal(r.status,403);
    r=await f.api("/api/admin/import-legacy-state",{state:{}},"POST","admin");
    assert.equal(r.status,400);assert.equal(r.data.error,"LEGACY_STATE_EMPTY");
  }finally{f.db.close()}
});
