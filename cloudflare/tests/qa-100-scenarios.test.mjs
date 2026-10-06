import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {accountFixture} from "./helpers/accounts-fixture.mjs";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";

async function fresh(){
  const f=await accountFixture();
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  return f;
}
async function publicCall(f,path,method="GET",body){
  const r=await worker.fetch(new Request("https://test.invalid"+path,{
    method,
    headers:body===undefined?{}:{"Content-Type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),f.env);
  let data=null;try{data=await r.json()}catch{}
  return {status:r.status,data};
}
async function withFixture(fn){
  const f=await fresh();try{return await fn(f)}finally{f.db.close()}
}
function addDivision(f,id="d",opts={}){
  f.db.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,advance_count,minimum_rest_minutes,match_slot_minutes) VALUES(?,?,?,?,?,?,?,?)")
    .run(id,opts.tournamentId||"own",opts.name||id,opts.eventType||"doubles",opts.format||"pool_to_knockout",opts.advanceCount??2,opts.minimumRestMinutes??15,opts.matchSlotMinutes??20);
  return id;
}
function addPlayer(f,id,level="B",gender="male",active=1){
  f.db.prepare("INSERT INTO players(id,full_name,gender,rating,skill_level,active,phone) VALUES(?,?,?,?,?,?,?)")
    .run(id,id,gender,3,level,active,"0900000000");
  return id;
}
function addTeam(f,id,did,players=[],group="A",seed=null,status="active"){
  f.db.prepare("INSERT INTO teams(id,division_id,name,group_code,seed,status) VALUES(?,?,?,?,?,?)").run(id,did,id,group,seed,status);
  for(const pid of players)f.db.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").run(id,pid);
  return id;
}
function addCourt(f,id="c1",tid="own"){
  f.db.prepare("INSERT INTO courts(id,tournament_id,name,sort_order,active) VALUES(?,?,?,?,1)").run(id,tid,id,1);
  return id;
}
function addCompletedGroupMatch(f,id,did,a,b,winner,stage="Bảng A",scoreA=11,scoreB=5){
  f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status,completed_at) VALUES(?,?,?,?,?,?,'completed','2026-10-06T00:00:00Z')")
    .run(id,did,a,b,winner,stage);
  f.db.prepare("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,?,?,?,1)").run(id+"-s",id,1,scoreA,scoreB);
}
function seedTeams(f,did,n,{groupFn=i=>"A"}={}){
  for(let i=1;i<=n;i++)addTeam(f,"t"+i,did,[],groupFn(i),i);
}
const cases=[];
const scenario=(name,fn)=>cases.push({name,fn});

// 1-12 Tournament / division / court
scenario("01 create tournament also creates default division",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"QA Cup",eventType:"doubles"},"POST");
  assert.equal(r.status,201);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM divisions WHERE tournament_id=?").get(r.data.id).n,1);
}));
scenario("02 blank tournament name is rejected",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"   "},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"NAME_REQUIRED");
}));
scenario("03 organizer can create owned tournament",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"Organizer Cup"},"POST","organizer");assert.equal(r.status,201);
  assert.equal(f.db.prepare("SELECT owner_user_id FROM tournaments WHERE id=?").get(r.data.id).owner_user_id,"organizer");
}));
scenario("04 referee cannot create tournament",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"Blocked"},"POST","local");assert.equal(r.status,403);
}));
scenario("05 tournament patch updates venue and visibility",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own",{venue:"Sân Bình Lợi",publicVisible:true},"PATCH");
  assert.equal(r.status,200);assert.equal(r.data.venue_name,"Sân Bình Lợi");assert.equal(Boolean(r.data.public_visible),true);
}));
scenario("06 organizer cannot patch foreign tournament",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/other",{name:"Hijack"},"PATCH","organizer");assert.equal(r.status,403);
}));
scenario("07 deleting tournament cascades divisions",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"Delete Me"},"POST");const id=r.data.id;
  assert.equal((await f.api("/api/tournaments/"+id,undefined,"DELETE")).status,200);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM divisions WHERE tournament_id=?").get(id).n,0);
}));
scenario("08 create second division",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own/divisions",{name:"Đôi nữ",eventType:"doubles",format:"round_robin"},"POST");
  assert.equal(r.status,201);assert.equal(r.data.name,"Đôi nữ");
}));
scenario("09 blank division name is rejected",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own/divisions",{name:" "},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"NAME_REQUIRED");
}));
scenario("10 patch division scoring and rest rules",()=>withFixture(async f=>{
  addDivision(f);const r=await f.api("/api/divisions/d",{bestOf:5,pointsToWin:15,scoringMode:"rally",minimumRestMinutes:25,matchSlotMinutes:30},"PATCH");
  assert.equal(r.status,200);assert.equal(r.data.best_of,5);assert.equal(r.data.points_to_win,15);assert.equal(r.data.scoring_mode,"rally");assert.equal(r.data.minimum_rest_minutes,25);
}));
scenario("11 create court",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own/courts",{name:"Sân 1",sortOrder:1},"POST");assert.equal(r.status,201);assert.equal(r.data.name,"Sân 1");
}));
scenario("12 blank court name is rejected",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own/courts",{name:" "},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"NAME_REQUIRED");
}));

// 13-30 Players / skills / import
scenario("13 new player defaults to B",()=>withFixture(async f=>{
  const r=await f.api("/api/players",{fullName:"Default B"},"POST");assert.equal(r.status,201);assert.equal(r.data.skill_level,"B");
}));
for(const [idx,level] of ["A+","A","B+","B","C+","C"].entries()){
  scenario(String(14+idx).padStart(2,"0")+" create player skill "+level,()=>withFixture(async f=>{
    const r=await f.api("/api/players",{fullName:"Skill "+level,skillLevel:level},"POST");assert.equal(r.status,201);assert.equal(r.data.skill_level,level);
  }));
}
scenario("20 invalid create skill safely falls back to B",()=>withFixture(async f=>{
  const r=await f.api("/api/players",{fullName:"Fallback",skillLevel:"Z"},"POST");assert.equal(r.status,201);assert.equal(r.data.skill_level,"B");
}));
scenario("21 organizer can patch player skill to A+",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",{skillLevel:"A+"},"PATCH");assert.equal(r.status,200);assert.equal(r.data.skill_level,"A+");
}));
scenario("22 invalid skill patch is rejected",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",{skillLevel:"Z"},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_SKILL_LEVEL");
}));
scenario("23 rating change requires reason",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",{rating:3.5},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"RATING_REASON_REQUIRED");
}));
scenario("24 rating change with reason records history",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",{rating:3.5,ratingReason:"QA"},"PATCH");assert.equal(r.status,200);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM rating_history WHERE player_id='p'").get().n,1);
}));
scenario("25 negative rating is rejected",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",{rating:-1,ratingReason:"bad"},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_RATING");
}));
scenario("26 invalid gender is rejected",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",{gender:"robot"},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_GENDER");
}));
scenario("27 deactivating player keeps record but sets inactive",()=>withFixture(async f=>{
  addPlayer(f,"p");assert.equal((await f.api("/api/players/p",undefined,"DELETE")).status,200);
  assert.equal(f.db.prepare("SELECT active FROM players WHERE id='p'").get().active,0);
}));
scenario("28 referee cannot deactivate player",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await f.api("/api/players/p",undefined,"DELETE","local");assert.equal(r.status,403);
}));
scenario("29 player list exposes normalized skillLevel",()=>withFixture(async f=>{
  addPlayer(f,"p","C+");const r=await f.api("/api/players",undefined,"GET");assert.equal(r.status,200);assert.equal(r.data.find(x=>x.id==="p").skillLevel,"C+");
}));
scenario("30 CSV/player import preserves skillLevel",()=>withFixture(async f=>{
  const r=await f.api("/api/import/players",{rows:[{fullName:"Imported A+",skillLevel:"A+",rating:4.5,gender:"male"}]},"POST");
  assert.equal(r.status,201);const p=f.db.prepare("SELECT skill_level FROM players WHERE full_name='Imported A+'").get();assert.equal(p.skill_level,"A+");
}));

// 31-45 Skill balanced team draw
scenario("31 balanced draw pairs A+ with C",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a","A+");addPlayer(f,"c","C");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","c"]},"POST");assert.equal(r.status,201);assert.equal(r.data.teams[0].totalSkill,7);
}));
scenario("32 balanced draw pairs A with C+",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a","A");addPlayer(f,"c","C+");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","c"]},"POST");assert.equal(r.status,201);assert.equal(r.data.teams[0].totalSkill,7);
}));
scenario("33 balanced draw pairs B+ with B",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a","B+");addPlayer(f,"b","B");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","b"]},"POST");assert.equal(r.status,201);assert.equal(r.data.teams[0].totalSkill,7);
}));
scenario("34 six-level pool produces three equally weighted teams",()=>withFixture(async f=>{
  addDivision(f);const levels=["A+","A","B+","B","C+","C"];levels.forEach((l,i)=>addPlayer(f,"p"+i,l));
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:levels.map((_,i)=>"p"+i)},"POST");
  assert.equal(r.status,201);assert.deepEqual(r.data.teams.map(x=>x.totalSkill),[7,7,7]);
}));
scenario("35 odd player count is rejected",()=>withFixture(async f=>{
  addDivision(f);["a","b","c"].forEach(x=>addPlayer(f,x));const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","b","c"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"ODD_PLAYER_COUNT");
}));
scenario("36 one player is not enough",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"NOT_ENOUGH_PLAYERS");
}));
scenario("37 missing player id is rejected",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","missing"]},"POST");assert.equal(r.status,404);assert.equal(r.data.error,"PLAYER_NOT_FOUND");
}));
scenario("38 inactive player is rejected",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a","B","male",0);addPlayer(f,"b");const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","b"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"PLAYER_INACTIVE");
}));
scenario("39 already assigned player is rejected",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");addPlayer(f,"b");addPlayer(f,"c");addTeam(f,"t","d",["a","b"]);
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","c"]},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"PLAYER_ALREADY_IN_DIVISION");
}));
scenario("40 singles cannot use balanced team draw",()=>withFixture(async f=>{
  addDivision(f,"d",{eventType:"singles"});addPlayer(f,"a");addPlayer(f,"b");const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","b"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"TEAM_DRAW_DOUBLES_ONLY");
}));
scenario("41 mixed doubles pairs one male with one female",()=>withFixture(async f=>{
  addDivision(f,"d",{eventType:"mixed_doubles"});addPlayer(f,"m","A+","male");addPlayer(f,"f","C","female");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["m","f"]},"POST");assert.equal(r.status,201);assert.deepEqual(new Set(r.data.teams[0].players.map(x=>x.gender)),new Set(["male","female"]));
}));
scenario("42 mixed doubles unequal genders are rejected",()=>withFixture(async f=>{
  addDivision(f,"d",{eventType:"mixed_doubles"});addPlayer(f,"m1","A","male");addPlayer(f,"m2","C","male");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["m1","m2"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"MIXED_GENDER_COUNT_MISMATCH");
}));
scenario("43 mixed doubles other gender is rejected by pool balance",()=>withFixture(async f=>{
  addDivision(f,"d",{eventType:"mixed_doubles"});addPlayer(f,"m","A","male");addPlayer(f,"x","C","other");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["m","x"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"MIXED_GENDER_COUNT_MISMATCH");
}));
scenario("44 balanced draw is locked once a match exists",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");addPlayer(f,"b");f.db.exec("INSERT INTO matches(id,division_id,stage,status) VALUES('m','d','Bảng A','scheduled')");
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:["a","b"]},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"TEAM_DRAW_LOCKED");
}));
scenario("45 balanced draw uses every selected athlete once",()=>withFixture(async f=>{
  addDivision(f);for(let i=0;i<8;i++)addPlayer(f,"p"+i,["A+","A","B+","B","C+","C","B","C+"][i]);
  const r=await f.api("/api/divisions/d/draw-balanced-teams",{playerIds:Array.from({length:8},(_,i)=>"p"+i)},"POST");assert.equal(r.status,201);
  const ids=r.data.teams.flatMap(t=>t.players.map(p=>p.id));assert.equal(new Set(ids).size,8);assert.equal(ids.length,8);
}));

// 46-60 Teams / group draw
scenario("46 create doubles team with two players",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");addPlayer(f,"b");const r=await f.api("/api/divisions/d/teams",{name:"AB",playerIds:["a","b"]},"POST");assert.equal(r.status,201);assert.equal(r.data.playerIds.length,2);
}));
scenario("47 doubles team with one player is rejected",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");const r=await f.api("/api/divisions/d/teams",{name:"A",playerIds:["a"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_PLAYER_COUNT");
}));
scenario("48 duplicate player selection is rejected",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a");const r=await f.api("/api/divisions/d/teams",{name:"AA",playerIds:["a","a"]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"DUPLICATE_PLAYER_SELECTION");
}));
scenario("49 player cannot join two active teams in one division",()=>withFixture(async f=>{
  addDivision(f);["a","b","c"].forEach(x=>addPlayer(f,x));addTeam(f,"t1","d",["a","b"]);
  const r=await f.api("/api/divisions/d/teams",{name:"AC",playerIds:["a","c"]},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"PLAYER_ALREADY_IN_DIVISION");
}));
scenario("50 player from withdrawn team can be reused",()=>withFixture(async f=>{
  addDivision(f);["a","b","c"].forEach(x=>addPlayer(f,x));addTeam(f,"t1","d",["a","b"],"A",1,"withdrawn");
  const r=await f.api("/api/divisions/d/teams",{name:"AC",playerIds:["a","c"]},"POST");assert.equal(r.status,201);
}));
scenario("51 team roster can change before match starts",()=>withFixture(async f=>{
  addDivision(f);["a","b","c"].forEach(x=>addPlayer(f,x));addTeam(f,"t1","d",["a","b"]);
  const r=await f.api("/api/teams/t1",{playerIds:["a","c"]},"PATCH");assert.equal(r.status,200);assert.deepEqual(new Set(r.data.playerIds),new Set(["a","c"]));
}));
scenario("52 team roster locks after match starts",()=>withFixture(async f=>{
  addDivision(f);["a","b","c"].forEach(x=>addPlayer(f,x));addTeam(f,"t1","d",["a","b"]);addTeam(f,"t2","d",[],"A");
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,started_at) VALUES('m','d','t1','t2','live','2026-10-06T00:00:00Z')");
  const r=await f.api("/api/teams/t1",{playerIds:["a","c"]},"PATCH");assert.equal(r.status,409);assert.equal(r.data.error,"TEAM_ROSTER_LOCKED");
}));
scenario("53 random draw 8 teams into 2 groups creates 12 pool matches",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",8);addCourt(f);const r=await f.api("/api/divisions/d/run-draw",{mode:"random",groupCount:2,teamsPerGroup:4,advanceCount:2,courtIds:["c1"]},"POST");
  assert.equal(r.status,200);assert.equal(r.data.created,12);
}));
scenario("54 seeded draw distributes 8 teams 4 and 4",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",8);addCourt(f);const r=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:4,advanceCount:2,courtIds:["c1"]},"POST");
  assert.equal(r.status,200);assert.deepEqual(r.data.groups.map(x=>x.count).sort(),[4,4]);
}));
scenario("55 manual draw accepts complete assignments",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);const r=await f.api("/api/divisions/d/run-draw",{mode:"manual",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"],manualAssignments:{t1:"A",t2:"A",t3:"B",t4:"B"}},"POST");
  assert.equal(r.status,200);assert.equal(r.data.created,2);
}));
scenario("56 manual draw rejects missing assignments",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);const r=await f.api("/api/divisions/d/run-draw",{mode:"manual",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"],manualAssignments:{t1:"A"}},"POST");
  assert.equal(r.status,400);assert.equal(r.data.error,"MANUAL_GROUP_ASSIGNMENT_REQUIRED");
}));
scenario("57 too many groups causing one-team group is rejected",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",3);addCourt(f);const r=await f.api("/api/divisions/d/run-draw",{mode:"random",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST");
  assert.equal(r.status,400);assert.equal(r.data.error,"GROUP_TOO_SMALL");
}));
scenario("58 advance count cannot exceed smallest group",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);const r=await f.api("/api/divisions/d/run-draw",{mode:"manual",groupCount:2,teamsPerGroup:2,advanceCount:3,courtIds:["c1"],manualAssignments:{t1:"A",t2:"A",t3:"B",t4:"B"}},"POST");
  assert.equal(r.status,400);assert.equal(r.data.error,"ADVANCE_COUNT_TOO_HIGH");
}));
scenario("59 group draw requires active courts",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);const r=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1},"POST");
  assert.equal(r.status,400);assert.equal(r.data.error,"NO_COURTS");
}));
scenario("60 round robin generation is idempotent",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);let r=await f.api("/api/divisions/d/generate-round-robin",{},"POST");assert.equal(r.status,200);assert.equal(r.data.created,6);
  r=await f.api("/api/divisions/d/generate-round-robin",{},"POST");assert.equal(r.status,200);assert.equal(r.data.created,0);
}));

// 61-75 Scheduling / match / scoring
scenario("61 auto scheduling requires courts",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status) VALUES('m','d','t1','t2','Bảng A','scheduled')");
  const r=await f.api("/api/divisions/d/auto-schedule-courts",{},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"NO_COURTS");
}));
scenario("62 auto scheduling assigns court and time",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);await f.api("/api/divisions/d/generate-round-robin",{},"POST");
  const r=await f.api("/api/divisions/d/auto-schedule-courts",{},"POST");assert.equal(r.status,200);assert.equal(r.data.updated,6);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='d' AND court_id IS NOT NULL AND scheduled_at IS NOT NULL").get().n,6);
}));
scenario("63 match cannot use same team twice",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);const r=await f.api("/api/divisions/d/matches",{teamAId:"t1",teamBId:"t1"},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_TEAMS");
}));
scenario("64 valid match can be created",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);const r=await f.api("/api/divisions/d/matches",{teamAId:"t1",teamBId:"t2",stage:"Bảng A"},"POST");assert.equal(r.status,201);
}));
scenario("65 referee cannot create match outside management role",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);const r=await f.api("/api/divisions/d/matches",{teamAId:"t1",teamBId:"t2"},"POST","local");assert.equal(r.status,403);
}));
scenario("66 match status cannot be patched directly",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,version) VALUES('m','d','t1','t2','scheduled',1)");
  const r=await f.api("/api/matches/m",{status:"completed"},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"USE_SCORE_ACTION");
}));
scenario("67 deleting untouched match physically removes it",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,version) VALUES('m','d','t1','t2','scheduled',1)");
  const r=await f.api("/api/matches/m",undefined,"DELETE");assert.equal(r.status,200);assert.equal(r.data.mode,"deleted");assert.equal(f.db.prepare("SELECT id FROM matches WHERE id='m'").get(),undefined);
}));
scenario("68 deleting match with history cancels instead",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,version,started_at) VALUES('m','d','t1','t2','scheduled',1,'2026-10-06T00:00:00Z')");
  const r=await f.api("/api/matches/m",undefined,"DELETE");assert.equal(r.status,200);assert.equal(r.data.mode,"cancelled");assert.equal(f.db.prepare("SELECT status FROM matches WHERE id='m'").get().status,"cancelled");
}));
scenario("69 court state can move to called",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,version) VALUES('m','d','t1','t2','scheduled',1)");
  const r=await f.api("/api/matches/m/court-state",{courtState:"called",expectedVersion:1},"PATCH");assert.equal(r.status,200);assert.equal(r.data.courtState,"called");
}));
scenario("70 invalid court state is rejected",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,version) VALUES('m','d','t1','t2','scheduled',1)");
  const r=await f.api("/api/matches/m/court-state",{courtState:"teleport"},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_COURT_STATE");
}));
scenario("71 stale court-state version is rejected",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",2);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,version) VALUES('m','d','t1','t2','scheduled',2)");
  const r=await f.api("/api/matches/m/court-state",{courtState:"called",expectedVersion:1},"PATCH");assert.equal(r.status,409);assert.equal(r.data.error,"VERSION_CONFLICT");
}));
scenario("72 point action increments score",async()=>{
  const f=await scoringFixture();try{const r=await f.api("point",{side:"A",delta:1});assert.equal(r.status,200);assert.equal(f.match().current_score_a,1)}finally{f.db.close()}
});
scenario("73 completed match rejects point action",async()=>{
  const f=await scoringFixture();try{f.db.exec("UPDATE matches SET status='completed',winner_team_id='a' WHERE id='match'");const r=await f.api("point",{side:"A",delta:1});assert.equal(r.status,409)}finally{f.db.close()}
});
scenario("74 valid quick score completes best-of-three",async()=>{
  const f=await scoringFixture();try{const r=await f.api("quick-score",{sets:[[11,5],[11,7]]});assert.equal(r.status,200);assert.equal(f.match().status,"completed");assert.equal(f.match().winner_team_id,"a")}finally{f.db.close()}
});
scenario("75 undo restores pre-score state",async()=>{
  const f=await scoringFixture();try{await f.api("point",{side:"A",delta:1});assert.equal((await f.api("undo")).status,200);assert.equal(f.match().current_score_a,0)}finally{f.db.close()}
});

// 76-87 standings / bracket
scenario("76 admin state ranks group winner first",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");addCompletedGroupMatch(f,"m","d","a","b","a");
  const r=await f.api("/api/admin/state",undefined,"GET");const teams=r.data.teams.filter(x=>x.divisionId==="d");assert.equal(teams.find(x=>x.id==="a").standingRank,1);
}));
scenario("77 standings calculate point differential",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");addCompletedGroupMatch(f,"m","d","a","b","a","Bảng A",11,4);
  const r=await f.api("/api/admin/state",undefined,"GET");const a=r.data.teams.find(x=>x.id==="a");assert.equal(a.diffPts,7);
}));
scenario("78 bracket rejects incomplete group stage",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");
  const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"GROUP_STAGE_NOT_COMPLETE");
}));
scenario("79 complete two-group stage generates knockout bracket",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});for(const [id,g] of [["a","A"],["b","A"],["c","B"],["d2","B"]])addTeam(f,id,"d",[],g);
  addCompletedGroupMatch(f,"ma","d","a","b","a","Bảng A");addCompletedGroupMatch(f,"mb","d","c","d2","c","Bảng B");
  const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,200);assert.ok(r.data.created>=1);
}));
scenario("80 second bracket generation is rejected",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});for(const [id,g] of [["a","A"],["b","A"],["c","B"],["d2","B"]])addTeam(f,id,"d",[],g);
  addCompletedGroupMatch(f,"ma","d","a","b","a","Bảng A");addCompletedGroupMatch(f,"mb","d","c","d2","c","Bảng B");
  assert.equal((await f.api("/api/divisions/d/generate-bracket",{},"POST")).status,200);const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"BRACKET_ALREADY_EXISTS");
}));
scenario("81 single elimination with five seeds creates seven slots",()=>withFixture(async f=>{
  addDivision(f,"d",{format:"single_elimination"});seedTeams(f,"d",5);const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,200);assert.equal(r.data.created,7);
}));
scenario("82 double elimination with four seeds creates six slots",()=>withFixture(async f=>{
  addDivision(f,"d",{format:"double_elimination"});seedTeams(f,"d",4);const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,200);assert.equal(r.data.created,6);
}));
scenario("83 round robin division has no knockout bracket",()=>withFixture(async f=>{
  addDivision(f,"d",{format:"round_robin"});seedTeams(f,"d",4);const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"ROUND_ROBIN_HAS_NO_KNOCKOUT");
}));
scenario("84 withdrawn team does not block pool completion",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");addTeam(f,"x","d",[],"A",null,"withdrawn");addCompletedGroupMatch(f,"m","d","a","b","a");
  const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.notEqual(r.data.error,"GROUP_STAGE_NOT_COMPLETE");
}));
scenario("85 cancelled duplicate does not invalidate completed pair",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");addCompletedGroupMatch(f,"done","d","a","b","a");
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status) VALUES('cancel','d','b','a','Bảng A','cancelled')");
  const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.notEqual(r.data.error,"GROUP_STAGE_NOT_COMPLETE");
}));
scenario("86 completed duplicate pair is tolerated when coverage is complete",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");addCompletedGroupMatch(f,"done1","d","a","b","a");addCompletedGroupMatch(f,"done2","d","b","a","a");
  const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.notEqual(r.data.error,"GROUP_STAGE_NOT_COMPLETE");
}));
scenario("87 winner outside match pair does not complete group stage",()=>withFixture(async f=>{
  addDivision(f,"d",{advanceCount:1});addTeam(f,"a","d",[],"A");addTeam(f,"b","d",[],"A");addTeam(f,"c","d",[],"A");
  addCompletedGroupMatch(f,"ab","d","a","b","c");addCompletedGroupMatch(f,"ac","d","a","c","a");addCompletedGroupMatch(f,"bc","d","b","c","b");
  const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"GROUP_STAGE_NOT_COMPLETE");
}));

// 88-95 permissions / public privacy
scenario("88 organizer admin state is scoped to owned tournament",()=>withFixture(async f=>{
  const r=await f.api("/api/admin/state",undefined,"GET","organizer");assert.equal(r.status,200);assert.deepEqual(r.data.tournaments.map(x=>x.id),["own"]);
}));
scenario("89 referee admin state only includes assigned matches",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"a","d");addTeam(f,"b","d");f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,referee_user_id,status) VALUES('m','d','a','b','local','scheduled')");
  const r=await f.api("/api/admin/state",undefined,"GET","local");assert.equal(r.status,200);assert.deepEqual(r.data.matches.map(x=>x.id),["m"]);
}));
scenario("90 referee player list redacts phone",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"p");addPlayer(f,"q");addTeam(f,"a","d",["p","q"]);addTeam(f,"b","d",[]);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,referee_user_id,status) VALUES('m','d','a','b','local','scheduled')");
  const r=await f.api("/api/players",undefined,"GET","local");assert.equal(r.status,200);assert.equal(r.data.find(x=>x.id==="p").phone,"");
}));
scenario("91 public state hides private tournaments",()=>withFixture(async f=>{
  f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='own'; UPDATE tournaments SET public_visible=0 WHERE id='other'");
  const r=await publicCall(f,"/api/public/state");assert.equal(r.status,200);assert.deepEqual(r.data.tournaments.map(x=>x.id),["own"]);
}));
scenario("92 public player profile never exposes phone",()=>withFixture(async f=>{
  addPlayer(f,"p");const r=await publicCall(f,"/api/public/players/p");assert.equal(r.status,200);assert.equal(JSON.stringify(r.data).includes("0900000000"),false);
}));
scenario("93 organizer cannot edit foreign referee",()=>withFixture(async f=>{
  const r=await f.api("/api/users/referees/foreign",{name:"Nope"},"PATCH","organizer");assert.equal(r.status,403);
}));
scenario("94 organizer cannot delete foreign tournament",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/other",undefined,"DELETE","organizer");assert.equal(r.status,403);
}));
scenario("95 unauthenticated admin state is rejected",()=>withFixture(async f=>{
  const r=await publicCall(f,"/api/admin/state");assert.equal(r.status,401);
}));

// 96-100 health / legacy / migration
scenario("96 health reports D1 and Durable Objects",()=>withFixture(async f=>{
  const r=await publicCall(f,"/api/health");assert.equal(r.status,200);assert.equal(r.data.storage,"D1");assert.equal(r.data.realtime,"Durable Objects");
}));
scenario("97 empty legacy state is rejected",()=>withFixture(async f=>{
  const r=await f.api("/api/admin/import-legacy-state",{state:{}},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"LEGACY_STATE_EMPTY");
}));
scenario("98 legacy import is super-admin only",()=>withFixture(async f=>{
  const r=await f.api("/api/admin/import-legacy-state",{state:{players:[{id:"p",fullName:"P"}]}},"POST","organizer");assert.equal(r.status,403);
}));
scenario("99 legacy import preserves player skillLevel",()=>withFixture(async f=>{
  const r=await f.api("/api/admin/import-legacy-state",{state:{players:[{id:"legacy-skill",fullName:"Legacy Skill",skillLevel:"A+",gender:"male",rating:4.5}]}},"POST");
  assert.equal(r.status,200);assert.equal(f.db.prepare("SELECT skill_level FROM players WHERE id='legacy-skill'").get().skill_level,"A+");
}));
scenario("100 migration/default skill for existing-style insert is B",()=>withFixture(async f=>{
  f.db.exec("INSERT INTO players(id,full_name) VALUES('default-skill','Default Skill')");assert.equal(f.db.prepare("SELECT skill_level FROM players WHERE id='default-skill'").get().skill_level,"B");
}));

test("QA 100 scenarios: full PickleUp regression matrix",async t=>{
  assert.equal(cases.length,100,"scenario matrix must stay exactly 100 cases");
  for(const item of cases)await t.test(item.name,item.fn);
});
