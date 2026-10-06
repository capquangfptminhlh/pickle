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
    assert.equal(f.db.prepare("SELECT scheduled_at FROM matches WHERE id='match-old'").get().scheduled_at,"2026-10-10T01:30:00.000Z");
    assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='reg-old'").get().payment_status,"paid");
    assert.equal(f.db.prepare("SELECT avatar_url FROM players WHERE id='p1'").get().avatar_url,null);

    r=await f.api("/api/admin/import-legacy-state",{state:legacy},"POST","admin");
    assert.equal(r.status,200);
    assert.equal(f.db.prepare("SELECT count(*) n FROM tournaments WHERE id='tour-old'").get().n,1);
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='team-old'").get().n,2);
    assert.equal(Object.values(r.data.counts).reduce((sum,n)=>sum+n,0),0);
    assert.equal(r.data.skipped.teams,1);assert.equal(r.data.skipped.teamPlayers,2);
    assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE action='IMPORT_LEGACY_STATE' ORDER BY id DESC LIMIT 1").get());
  }finally{f.db.close()}
});

function recoveryState(){
  return {
    branding:{name:"Legacy brand"},
    clubs:[{id:"recover-club",name:"Recovery club",city:"Old city"}],
    players:[1,2,3,4].map(n=>({id:`recover-p${n}`,full_name:`Player ${n}`,gender:"male",rating:3,club_id:"recover-club"})),
    tournaments:[{id:"recover-tour",name:"Recovery tournament",status:"open"}],
    divisions:[{id:"recover-div",tournamentId:"recover-tour",name:"Doubles",eventType:"doubles",bestOf:3,pointsToWin:11}],
    courts:[{id:"recover-court",tournamentId:"recover-tour",name:"Old court"}],
    teams:[{id:"recover-team",divisionId:"recover-div",name:"Recovery team"}],
    teamPlayers:{"recover-team":["recover-p1","recover-p2"]},
    matches:[{id:"recover-match",divisionId:"recover-div",a:"recover-team",status:"wait",current:[0,0],sets:[],version:1}],
    registrations:[{id:"recover-reg",tournament_name:"Recovery tournament",division_name:"Doubles",team_name:"Recovery team",status:"approved",payment_status:"unpaid",amount:100}],
    sponsors:[{id:"recover-sponsor",name:"Old sponsor",tournamentId:"recover-tour"}],
    posts:[{id:"recover-post",title:"Old post",body:"Old content",tournamentId:"recover-tour"}],
    bookings:[{id:"recover-booking",court_id:"recover-court",title:"Old booking",start_at:"2026-10-10T01:00:00Z",end_at:"2026-10-10T02:00:00Z"}],
    clubEvents:[{id:"recover-event",club_id:"recover-club",title:"Old event",start_at:"2026-10-10T01:00:00Z"}],
    clubAttendance:{"recover-event":[{player_id:"recover-p1",status:"registered"}]},
    clubTransactions:[{id:"recover-transaction",club_id:"recover-club",amount:100,note:"Old payment"}]
  };
}

const preservedTables=["clubs","players","tournaments","divisions","courts","teams","team_players","matches","match_sets","registrations","payment_records","sponsors","content_posts","court_bookings","club_events","club_event_attendance","club_transactions","app_settings"];
function dataSnapshot(db){return Object.fromEntries(preservedTables.map(table=>[table,db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));}
async function recover(f,state){return f.api("/api/admin/import-legacy-state",{state},"POST","admin");}

test("repeating scored history preserves every imported row",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();
    state.matches[0]={...state.matches[0],status:"done",current:[11,8],sets:[[11,8],[11,9]],version:8,winner:"recover-team"};
    assert.equal((await recover(f,state)).status,200);
    const before=dataSnapshot(f.db);
    const response=await recover(f,state);
    assert.equal(response.status,200,JSON.stringify(response.data));
    assert.deepEqual(dataSnapshot(f.db),before);
  }finally{f.db.close()}
});

test("stale recovery preserves newer scores, roster, rules, payments, and branding while adding new IDs",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();
    assert.equal((await recover(f,state)).status,200);
    f.db.exec(`
      UPDATE clubs SET name='Current club',city='Current city',active=0 WHERE id='recover-club';
      UPDATE players SET rating=5,phone='current phone',avatar_url='current avatar',active=0 WHERE id='recover-p1';
      UPDATE tournaments SET owner_user_id='organizer',name='Current tournament',status='live',poster_url='current poster' WHERE id='recover-tour';
      UPDATE divisions SET best_of=5,points_to_win=21,scoring_mode='rally',minimum_rest_minutes=25 WHERE id='recover-div';
      UPDATE courts SET name='Current court',active=0 WHERE id='recover-court';
      DELETE FROM team_players WHERE team_id='recover-team';
      INSERT INTO team_players(team_id,player_id) VALUES('recover-team','recover-p3'),('recover-team','recover-p4');
      UPDATE teams SET name='Current team',seed=9,group_code='B' WHERE id='recover-team';
      UPDATE matches SET status='completed',current_score_a=21,current_score_b=18,version=27,winner_team_id='recover-team',started_at='2026-10-10T01:00:00Z' WHERE id='recover-match';
      INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('current-set','recover-match',1,21,18,1);
      UPDATE registrations SET status='cancelled',payment_status='refunded',amount=800,checked_in_at='2026-10-10T01:00:00Z',checked_in_by='organizer' WHERE id='recover-reg';
      INSERT INTO payment_records(id,registration_id,status,reviewed_by) VALUES('current-payment','recover-reg','refunded','admin');
      UPDATE sponsors SET name='Current sponsor' WHERE id='recover-sponsor';
      UPDATE content_posts SET title='Current post',body='Current content' WHERE id='recover-post';
      UPDATE court_bookings SET title='Current booking',status='cancelled' WHERE id='recover-booking';
      UPDATE club_events SET title='Current event',fee=500 WHERE id='recover-event';
      UPDATE club_event_attendance SET status='attended',checked_in_at='2026-10-10T01:00:00Z',checked_in_by='admin' WHERE event_id='recover-event';
      UPDATE club_transactions SET amount=900,note='Current payment' WHERE id='recover-transaction';
      UPDATE app_settings SET value='{"name":"Current brand"}' WHERE key='branding';
    `);
    const before=dataSnapshot(f.db);
    state.matches[0].sets=[[11,1],[11,2]];
    state.players.push({id:"new-player",full_name:"New player",rating:4});
    const response=await recover(f,state);
    assert.equal(response.status,200,JSON.stringify(response.data));
    assert.equal(f.db.prepare("SELECT rating FROM players WHERE id='new-player'").get().rating,4);
    assert.equal(response.data.counts.players,1);assert.equal(response.data.skipped.players,4);
    const after=dataSnapshot(f.db);after.players=after.players.filter(p=>p.id!=="new-player");
    assert.deepEqual(after,before);
  }finally{f.db.close()}
});

test("duplicate memberships never invoke roster guards on an existing membership",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.teamPlayers["recover-team"]=["recover-p1","recover-p2","recover-p1"];
    const response=await recover(f,state);
    assert.equal(response.status,200,JSON.stringify(response.data));
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='recover-team'").get().n,2);
  }finally{f.db.close()}
});

test("a failed new roster rolls back its team so retry can import the complete roster",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.teamPlayers["recover-team"]=["recover-p1","missing-player"];
    const response=await recover(f,state);assert.equal(response.status,500);
    assert.equal(f.db.prepare("SELECT * FROM teams WHERE id='recover-team'").get(),undefined);
    state.teamPlayers["recover-team"]=["recover-p1","recover-p2"];
    assert.equal((await recover(f,state)).status,200);
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='recover-team'").get().n,2);
  }finally{f.db.close()}
});

test("match and all sets stay atomic across the batch boundary and recover on retry",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();
    state.matches=[...Array.from({length:59},(_,i)=>({id:`boundary-${i}`,divisionId:"recover-div",status:"wait"})),{...state.matches[0],sets:[[11,8],[11,9]]}];
    f.db.exec("CREATE TRIGGER reject_import_set BEFORE INSERT ON match_sets WHEN NEW.match_id='recover-match' AND NEW.set_no=2 BEGIN SELECT RAISE(ABORT,'IMPORT_SET_FAILURE'); END;");
    const response=await recover(f,state);assert.equal(response.status,500);
    assert.equal(f.db.prepare("SELECT * FROM matches WHERE id='recover-match'").get(),undefined);
    assert.equal(f.db.prepare("SELECT count(*) n FROM match_sets WHERE match_id='recover-match'").get().n,0);
    f.db.exec("DROP TRIGGER reject_import_set");
    assert.equal((await recover(f,state)).status,200);
    assert.equal(f.db.prepare("SELECT count(*) n FROM match_sets WHERE match_id='recover-match'").get().n,2);
  }finally{f.db.close()}
});

test("concurrent parent creation aborts the new group before stale children can be inserted",async()=>{
  for(const parent of ["teams","matches"]){
    const f=await accountFixture();
    try{
      const state=recoveryState();state.matches[0].sets=[[11,8]];
      const originalBatch=f.env.DB.batch.bind(f.env.DB);let injected=false;
      f.env.DB.batch=async statements=>{
        if(!injected&&statements.some(s=>s.sql.startsWith(`INSERT INTO ${parent}(`))){
          injected=true;
          if(parent==="teams")f.db.exec("INSERT INTO teams(id,division_id,name) VALUES('recover-team','recover-div','Concurrent team'); INSERT INTO team_players(team_id,player_id) VALUES('recover-team','recover-p3');");
          else f.db.exec("INSERT INTO matches(id,division_id,status,current_score_a,version) VALUES('recover-match','recover-div','live',8,12); INSERT INTO match_sets(id,match_id,set_no,score_a,score_b) VALUES('concurrent-set','recover-match',1,8,5);");
        }
        return originalBatch(statements);
      };
      const response=await recover(f,state);
      assert.equal(response.status,409,`${parent}: ${JSON.stringify(response.data)}`);
      assert.equal(response.data.error,"LEGACY_IMPORT_CONFLICT");
      if(parent==="teams")assert.deepEqual(f.db.prepare("SELECT player_id FROM team_players WHERE team_id='recover-team'").all().map(x=>x.player_id),["recover-p3"]);
      else assert.equal(f.db.prepare("SELECT score_a FROM match_sets WHERE match_id='recover-match'").get().score_a,8);
      assert.equal((await recover(f,state)).status,200);
    }finally{f.db.close()}
  }
});

test("duplicate source parent IDs import one roster and one set history",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.matches[0].sets=[[11,8]];
    state.teams.push({...state.teams[0],name:"Duplicate stale name"});
    state.matches.push({...state.matches[0],sets:[[3,9]]});
    const response=await recover(f,state);assert.equal(response.status,200,JSON.stringify(response.data));
    assert.equal(f.db.prepare("SELECT name FROM teams WHERE id='recover-team'").get().name,"Recovery team");
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='recover-team'").get().n,2);
    assert.equal(f.db.prepare("SELECT score_a FROM match_sets WHERE match_id='recover-match'").get().score_a,11);
  }finally{f.db.close()}
});

test("an existing empty match or team never receives stale children",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.teamPlayers={};
    assert.equal((await recover(f,state)).status,200);
    state.teamPlayers={"recover-team":["recover-p1","recover-p2"]};state.matches[0].sets=[[11,8]];
    const before=dataSnapshot(f.db);
    const response=await recover(f,state);
    assert.equal(response.status,200);
    assert.ok(response.data.warnings.some(w=>w.includes("đã tồn tại")));
    assert.deepEqual(dataSnapshot(f.db),before);
  }finally{f.db.close()}
});

test("late import audit failure keeps complete new groups and retry leaves their sets intact",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.matches[0].sets=[[11,8],[11,9]];
    f.db.exec("CREATE TRIGGER reject_import_audit BEFORE INSERT ON audit_logs WHEN NEW.action='IMPORT_LEGACY_STATE' BEGIN SELECT RAISE(ABORT,'IMPORT_AUDIT_FAILURE'); END;");
    const response=await recover(f,state);assert.equal(response.status,500);
    assert.equal(f.db.prepare("SELECT count(*) n FROM team_players WHERE team_id='recover-team'").get().n,2);
    assert.equal(f.db.prepare("SELECT count(*) n FROM match_sets WHERE match_id='recover-match'").get().n,2);
    const before=dataSnapshot(f.db);
    f.db.exec("DROP TRIGGER reject_import_audit");
    assert.equal((await recover(f,state)).status,200);
    assert.deepEqual(dataSnapshot(f.db),before);
  }finally{f.db.close()}
});

test("oversized child groups are rejected without leaving their parent",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.matches[0].sets=Array.from({length:60},()=>[11,8]);
    const response=await recover(f,state);assert.equal(response.status,413);
    assert.equal(response.data.error,"LEGACY_RECORD_TOO_LARGE");
    assert.equal(f.db.prepare("SELECT * FROM matches WHERE id='recover-match'").get(),undefined);
  }finally{f.db.close()}
});

test("legacy wall-clock schedules retain their supplied calendar date and timezone",async()=>{
  const f=await accountFixture();
  try{
    const state=recoveryState();state.matches=[];
    const dates=[
      ["2026-10-10T08:00:00+07:00","2026-10-10T01:30:00.000Z"],
      ["2026-10-10T08:00:00+05:30","2026-10-10T03:00:00.000Z"],
      ["2026-10-10T23:00:00-04:00","2026-10-10T12:30:00.000Z"],
      ["2026-10-10T08:00:00Z","2026-10-10T08:30:00.000Z"],
      ["2026-10-10","2026-10-10T01:30:00.000Z"],
      ["2026-10-10T08:00:00","2026-10-10T01:30:00.000Z"]
    ];
    dates.forEach(([start,expected],i)=>{
      state.tournaments.push({id:`zone-tour-${i}`,name:`Zone ${i}`,startAt:start});
      state.divisions.push({id:`zone-div-${i}`,tournamentId:`zone-tour-${i}`,name:"Zone"});
      state.matches.push({id:`zone-match-${i}`,divisionId:`zone-div-${i}`,time:"08:30",status:"wait"});
    });
    const response=await recover(f,state);assert.equal(response.status,200,JSON.stringify(response.data));
    dates.forEach(([,expected],i)=>assert.equal(f.db.prepare("SELECT scheduled_at FROM matches WHERE id=?").get(`zone-match-${i}`).scheduled_at,expected));
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
