// Tournament-day scenarios: whole events driven rally by rally through the
// real Worker routes (draw, schedule, score, standings, bracket, third place)
// with a seeded RNG, checking the rules after every rally.
import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";
import {validateSet} from "../../shared/scoring-rules.js";

function seeded(seed){let s=seed>>>0||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
async function fresh(){
  const f=await accountFixture();
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  return f;
}
function ok(r,label){assert.ok(r.status>=200&&r.status<300,`${label}: ${r.status} ${JSON.stringify(r.data)}`);return r.data}
const MATCH_SQL="SELECT m.*,d.points_to_win,d.win_by_two,d.best_of,d.scoring_mode,d.final_point_on_serve,d.relay_segment_points,d.event_type FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.id=?";
const row=(f,id)=>f.db.prepare(MATCH_SQL).get(id);
const setsOf=(f,id)=>f.db.prepare("SELECT score_a,score_b FROM match_sets WHERE match_id=? ORDER BY set_no").all(id).map(s=>[s.score_a,s.score_b]);

let playerSeq=0;
async function setupDivision(f,{name,eventType="team",rules,teams,perTeam,courts=4}){
  const d=ok(await f.api("/api/tournaments/own/divisions",{name,eventType,...rules},"POST"),"create division");
  for(let c=1;c<=courts;c++)ok(await f.api("/api/tournaments/own/courts",{name:`${name} Sân ${c}`,sortOrder:c},"POST"),"create court");
  const teamIds=[],strength=new Map();
  for(let t=0;t<teams;t++){
    const ids=[];
    for(let k=0;k<perTeam;k++){
      const p=ok(await f.api("/api/players",{fullName:`VĐV ${++playerSeq} ${name}`,gender:"female",rating:2+(k%3)*.25},"POST"),"create player");
      ids.push(p.id);
    }
    const team=ok(await f.api(`/api/divisions/${d.id}/teams`,{playerIds:ids,name:`${name} Đội ${t+1}`,seed:t+1},"POST"),"create team");
    teamIds.push(team.id);
    // Uneven but not lopsided strengths so upsets and close games happen.
    strength.set(team.id,1+((t*7)%5)*.12);
  }
  return {division:d,teamIds,strength};
}

// Plays one match rally by rally and asserts the scoring rules on every rally.
async function playMatch(f,id,strength,rand,stats){
  for(let guard=0;guard<4000;guard++){
    const m=row(f,id);
    if(m.status==="completed")return m;
    const a=m.current_score_a,b=m.current_score_b,target=m.points_to_win,winByTwo=Boolean(m.win_by_two);
    if(validateSet(a,b,target,winByTwo)){
      ok(await f.api(`/api/matches/${id}/finish-set`,{expectedVersion:m.version},"POST"),"finish set");
      continue;
    }
    const pa=strength.get(m.team_a_id),pb=strength.get(m.team_b_id);
    const side=rand()<pa/(pa+pb)?"A":"B",serve=m.serving_side||"A";
    ok(await f.api(`/api/matches/${id}/rally`,{side,expectedVersion:m.version},"POST"),"rally");
    const after=row(f,id);stats.rallies++;
    assert.equal(after.version,m.version+1,"every rally is one versioned event");
    const na=a+(side==="A"?1:0),nb=b+(side==="B"?1:0);
    if(m.scoring_mode==="rally"){
      if(Number(m.final_point_on_serve)===1&&side!==serve&&validateSet(na,nb,target,winByTwo)){
        // Receiving side won the would-be game point: serve changes, score does not.
        assert.deepEqual([after.current_score_a,after.current_score_b,after.serving_side],[a,b,side],"final point needs the serve");
        stats.finalPointSideOuts++;
      }else{
        assert.deepEqual([after.current_score_a,after.current_score_b],[na,nb],"rally scoring adds one point");
      }
    }else if(side===serve){
      assert.deepEqual([after.current_score_a,after.current_score_b],[na,nb],"serving side scores");
    }else{
      assert.deepEqual([after.current_score_a,after.current_score_b],[a,b],"receiving side never scores in side-out");
    }
    if(!winByTwo)assert.ok(Math.max(after.current_score_a,after.current_score_b)<=target,"score never passes the target");
  }
  throw new Error("match did not finish: "+id);
}

async function playAll(f,ids,strength,rand,stats){
  for(const id of ids)await playMatch(f,id,strength,rand,stats);
}
const groupMatches=division=>f=>f.db.prepare("SELECT * FROM matches WHERE division_id=? AND bracket_slot IS NULL ORDER BY COALESCE(scheduled_at,created_at),created_at").all(division);
function knockoutReady(f,division){
  return f.db.prepare("SELECT id FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL AND status NOT IN ('completed','walkover','cancelled') AND team_a_id IS NOT NULL AND team_b_id IS NOT NULL ORDER BY round_no,bracket_slot").all(division).map(m=>m.id);
}
async function playKnockout(f,division,strength,rand,stats){
  for(let round=0;round<10;round++){
    const ready=knockoutReady(f,division);
    if(!ready.length)break;
    await playAll(f,ready,strength,rand,stats);
  }
  const open=f.db.prepare("SELECT bracket_slot FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL AND status<>'completed'").all(division);
  assert.deepEqual(open,[],"every knockout match is decided");
}
const winnerOf=(f,division,slot)=>f.db.prepare("SELECT * FROM matches WHERE division_id=? AND bracket_slot=?").get(division,slot);
function finalSlot(f,division){
  return f.db.prepare("SELECT bracket_slot FROM matches WHERE division_id=? AND bracket_slot LIKE 'SE-R%' ORDER BY round_no DESC LIMIT 1").get(division).bracket_slot;
}

// Schedule must never put a team on two courts at once or skip its rest.
function assertSchedule(f,division,restMinutes,slotMinutes){
  const ms=f.db.prepare("SELECT id,court_id,scheduled_at,team_a_id,team_b_id FROM matches WHERE division_id=? AND bracket_slot IS NULL").all(division);
  assert.ok(ms.every(m=>m.court_id&&m.scheduled_at),"every group match has a court and a time");
  const byCourt=new Map();
  for(const m of ms){const list=byCourt.get(m.court_id)||[];list.push(Date.parse(m.scheduled_at));byCourt.set(m.court_id,list)}
  for(const times of byCourt.values()){times.sort((x,y)=>x-y);for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=slotMinutes*60000,"court double booked")}
  const byTeam=new Map();
  for(const m of ms)for(const t of [m.team_a_id,m.team_b_id]){const list=byTeam.get(t)||[];list.push(Date.parse(m.scheduled_at));byTeam.set(t,list)}
  for(const times of byTeam.values()){times.sort((x,y)=>x-y);for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=(slotMinutes+restMinutes)*60000,"team rest violated")}
}

async function drawAndSchedule(f,division,{groupCount,teamsPerGroup}){
  ok(await f.api(`/api/divisions/${division}/run-draw`,{mode:"seeded",groupCount,teamsPerGroup},"POST"),"run draw");
  if(!f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id=? AND bracket_slot IS NULL").get(division).n)
    ok(await f.api(`/api/divisions/${division}/generate-round-robin`,{},"POST"),"round robin");
  ok(await f.api(`/api/divisions/${division}/auto-schedule-courts`,{},"POST"),"auto schedule");
}

function standings(f,division){
  return f.db.prepare("SELECT id,group_code FROM teams WHERE division_id=? AND status='active'").all(division);
}

test("MLP Xé Túi Mù: 16 teams of 3, relay 9×3=27, pools of 4, top 2, third place",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",scoringMode:"rally",relaySegmentPoints:9,relayTeamSize:3,finalPointOnServe:true,thirdPlaceMatch:true,winByTwo:false,advanceCount:2,minimumRestMinutes:10,matchSlotMinutes:20};
    const {division,strength}=await setupDivision(f,{name:"MLP",rules,teams:16,perTeam:3});
    assert.equal(division.points_to_win,27);assert.equal(division.best_of,1);
    await drawAndSchedule(f,division.id,{groupCount:4,teamsPerGroup:4});
    const groups=groupMatches(division.id)(f);
    assert.equal(groups.length,24,"4 groups × 6 matches");
    assertSchedule(f,division.id,10,20);
    const rand=seeded(20261011),stats={rallies:0,finalPointSideOuts:0};
    await playAll(f,groups.map(m=>m.id),strength,rand,stats);
    for(const m of groupMatches(division.id)(f)){
      const sets=setsOf(f,m.id);
      assert.equal(sets.length,1,"a relay is one running game");
      assert.equal(Math.max(...sets[0]),27,"relay ends exactly at 27");
    }
    const bracket=ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    assert.equal(bracket.qualifiers,8);assert.equal(bracket.thirdPlaceMatch,true);assert.equal(bracket.created,8);
    await playKnockout(f,division.id,strength,rand,stats);
    const final=winnerOf(f,division.id,finalSlot(f,division.id)),third=winnerOf(f,division.id,"SE-3RD-M1");
    const podium=[final.winner_team_id,final.winner_team_id===final.team_a_id?final.team_b_id:final.team_a_id,third.winner_team_id];
    assert.equal(new Set(podium).size,3,"champion, runner-up and third are different teams");
    const semis=f.db.prepare("SELECT * FROM matches WHERE division_id=? AND round_no=2 AND bracket_slot LIKE 'SE-R%'").all(division.id);
    const semiLosers=semis.map(m=>m.winner_team_id===m.team_a_id?m.team_b_id:m.team_a_id).sort();
    assert.deepEqual([third.team_a_id,third.team_b_id].sort(),semiLosers,"third place is played by the semifinal losers");
    assert.ok(stats.rallies>1000,"played rally by rally");
    assert.ok(stats.finalPointSideOuts>0,"the final-point-on-serve rule came up during the day");
  }finally{f.db.close()}
});

test("PickleUp Tour: 16 doubles pairs, best of 3 to 11 side-out win by 2, third place",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:3,pointsToWin:11,winByTwo:true,scoringMode:"side_out",thirdPlaceMatch:true,advanceCount:2,minimumRestMinutes:15,matchSlotMinutes:45};
    const {division,strength}=await setupDivision(f,{name:"Doubles",eventType:"doubles",rules,teams:16,perTeam:2});
    await drawAndSchedule(f,division.id,{groupCount:4,teamsPerGroup:4});
    assertSchedule(f,division.id,15,45);
    const rand=seeded(20261015),stats={rallies:0,finalPointSideOuts:0};
    await playAll(f,groupMatches(division.id)(f).map(m=>m.id),strength,rand,stats);
    for(const m of groupMatches(division.id)(f)){
      const sets=setsOf(f,m.id),wins=[0,0];
      for(const [a,b] of sets){assert.ok(validateSet(a,b,11,true),`valid game ${a}-${b}`);wins[a>b?0:1]++}
      assert.equal(Math.max(...wins),2,"winner took two games");
      assert.ok(sets.length===2||sets.length===3);
    }
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    await playKnockout(f,division.id,strength,rand,stats);
    assert.equal(winnerOf(f,division.id,"SE-3RD-M1").status,"completed");
    assert.equal(stats.finalPointSideOuts,0,"side-out games never use the relay rule");
  }finally{f.db.close()}
});

test("13 pairs: uneven pools (4-3-3-3) still give a clean 8-team knockout",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally",thirdPlaceMatch:true,advanceCount:2};
    const {division,strength}=await setupDivision(f,{name:"Le13",eventType:"doubles",rules,teams:13,perTeam:2,courts:3});
    await drawAndSchedule(f,division.id,{groupCount:4,teamsPerGroup:4});
    const sizes=Object.values(standings(f,division.id).reduce((m,t)=>(m[t.group_code]=(m[t.group_code]||0)+1,m),{})).sort();
    assert.deepEqual(sizes,[3,3,3,4]);
    assert.equal(groupMatches(division.id)(f).length,6+3+3+3);
    const rand=seeded(13),stats={rallies:0,finalPointSideOuts:0};
    await playAll(f,groupMatches(division.id)(f).map(m=>m.id),strength,rand,stats);
    const bracket=ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    assert.equal(bracket.qualifiers,8);
    await playKnockout(f,division.id,strength,rand,stats);
  }finally{f.db.close()}
});

test("6 teams in 2 pools: semifinals, third place and final",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:1,pointsToWin:15,winByTwo:true,scoringMode:"rally",thirdPlaceMatch:true,advanceCount:2};
    const {division,strength}=await setupDivision(f,{name:"Six",eventType:"doubles",rules,teams:6,perTeam:2,courts:2});
    await drawAndSchedule(f,division.id,{groupCount:2,teamsPerGroup:3});
    const rand=seeded(6),stats={rallies:0,finalPointSideOuts:0};
    await playAll(f,groupMatches(division.id)(f).map(m=>m.id),strength,rand,stats);
    const bracket=ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    assert.equal(bracket.created,4,"2 semifinals + final + third place");
    // Same-pool qualifiers sit in opposite halves: they can only meet in the final.
    const semis=f.db.prepare("SELECT team_a_id,team_b_id FROM matches WHERE division_id=? AND round_no=1").all(division.id);
    const group=new Map(standings(f,division.id).map(t=>[t.id,t.group_code]));
    for(const s of semis)assert.notEqual(group.get(s.team_a_id),group.get(s.team_b_id),"semifinal opponents come from different pools");
    await playKnockout(f,division.id,strength,rand,stats);
  }finally{f.db.close()}
});

test("4-player relay: AB→BC→CD→DA to 36 with final point on serve",async()=>{
  const f=await fresh();
  try{
    const rules={format:"single_elimination",scoringMode:"rally",relaySegmentPoints:9,relayTeamSize:4,finalPointOnServe:true,thirdPlaceMatch:true};
    const {division,strength}=await setupDivision(f,{name:"Relay4",rules,teams:4,perTeam:4,courts:2});
    assert.equal(division.points_to_win,36);
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const rand=seeded(36),stats={rallies:0,finalPointSideOuts:0};
    await playKnockout(f,division.id,strength,rand,stats);
    for(const m of f.db.prepare("SELECT id FROM matches WHERE division_id=?").all(division.id))
      assert.equal(Math.max(...setsOf(f,m.id)[0]),36);
  }finally{f.db.close()}
});

test("no-show in the pool and retirement in the knockout still produce a podium",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally",thirdPlaceMatch:true,advanceCount:2};
    const {division,teamIds,strength}=await setupDivision(f,{name:"Walk",eventType:"doubles",rules,teams:8,perTeam:2,courts:2});
    await drawAndSchedule(f,division.id,{groupCount:2,teamsPerGroup:4});
    const rand=seeded(8),stats={rallies:0,finalPointSideOuts:0};
    const [first,...rest]=groupMatches(division.id)(f);
    ok(await f.api(`/api/matches/${first.id}/special-result`,{winnerTeamId:first.team_a_id,reason:"no_show",note:"Không có mặt khi gọi lần 3"},"POST"),"no-show");
    await playAll(f,rest.map(m=>m.id),strength,rand,stats);
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const [semi]=knockoutReady(f,division.id);
    const m=row(f,semi);
    ok(await f.api(`/api/matches/${semi}/special-result`,{winnerTeamId:m.team_b_id,reason:"retired",note:"Chấn thương"},"POST"),"retired");
    const third=winnerOf(f,division.id,"SE-3RD-M1");
    assert.ok([third.team_a_id,third.team_b_id].includes(m.team_a_id),"retired team still plays for third");
    await playKnockout(f,division.id,strength,rand,stats);
    assert.ok(teamIds.length===8);
  }finally{f.db.close()}
});

test("undo: a decided semifinal is locked once the third-place match starts",async()=>{
  const f=await fresh();
  try{
    const rules={format:"single_elimination",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally",thirdPlaceMatch:true};
    const {division,strength}=await setupDivision(f,{name:"Undo",eventType:"doubles",rules,teams:4,perTeam:2,courts:2});
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const rand=seeded(4),stats={rallies:0,finalPointSideOuts:0};
    const semis=knockoutReady(f,division.id);
    await playAll(f,semis,strength,rand,stats);
    // Undo before anything downstream starts: allowed, and the slots empty again.
    ok(await f.api(`/api/matches/${semis[0]}/undo`,{},"POST"),"undo semifinal");
    const third=winnerOf(f,division.id,"SE-3RD-M1");
    assert.ok(!third.team_a_id||!third.team_b_id,"third-place slot cleared by undo");
    await playMatch(f,semis[0],strength,rand,stats);
    const thirdId=winnerOf(f,division.id,"SE-3RD-M1").id;
    ok(await f.api(`/api/matches/${thirdId}/rally`,{side:"A"},"POST"),"third place starts");
    const blocked=await f.api(`/api/matches/${semis[0]}/undo`,{},"POST");
    assert.equal(blocked.status,409);assert.equal(blocked.data.error,"DOWNSTREAM_MATCH_LOCKED");
  }finally{f.db.close()}
});

test("two scorers on one match: the stale tap is rejected and never double counts",async()=>{
  const f=await fresh();
  try{
    const rules={format:"single_elimination",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally"};
    const {division}=await setupDivision(f,{name:"Race",eventType:"doubles",rules,teams:2,perTeam:2,courts:1});
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const [id]=knockoutReady(f,division.id),v=row(f,id).version;
    const [first,second]=await Promise.all([
      f.api(`/api/matches/${id}/rally`,{side:"A",expectedVersion:v},"POST"),
      f.api(`/api/matches/${id}/rally`,{side:"A",expectedVersion:v},"POST")
    ]);
    assert.deepEqual([first.status,second.status].sort(),[200,409]);
    assert.equal(row(f,id).current_score_a,1,"only one point recorded");
  }finally{f.db.close()}
});

test("round robin only: no knockout, champion is the top of the table",async()=>{
  const f=await fresh();
  try{
    const rules={format:"round_robin",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally"};
    const {division,strength}=await setupDivision(f,{name:"RR",eventType:"doubles",rules,teams:5,perTeam:2,courts:2});
    ok(await f.api(`/api/divisions/${division.id}/generate-round-robin`,{},"POST"),"round robin");
    const matches=groupMatches(division.id)(f);assert.equal(matches.length,10);
    const rand=seeded(5),stats={rallies:0,finalPointSideOuts:0};
    await playAll(f,matches.map(m=>m.id),strength,rand,stats);
    const refused=await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST");
    assert.equal(refused.status,400);assert.equal(refused.data.error,"ROUND_ROBIN_HAS_NO_KNOCKOUT");
    const state=ok(await f.api("/api/admin/state",undefined,"GET"),"state");
    const table=state.teams.filter(t=>t.divisionId===division.id).sort((a,b)=>a.standingRank-b.standingRank);
    for(let i=1;i<table.length;i++)assert.ok(table[i-1].w>=table[i].w,"table ordered by wins");
    assert.equal(table.reduce((n,t)=>n+t.w,0),10,"one win per match");
  }finally{f.db.close()}
});

test("three-way tie on wins is broken by the mini-league, not by name",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally",advanceCount:2};
    const {division,teamIds}=await setupDivision(f,{name:"Tie",eventType:"doubles",rules,teams:4,perTeam:2,courts:1});
    await drawAndSchedule(f,division.id,{groupCount:1,teamsPerGroup:4});
    const [t1,t2,t3,t4]=teamIds;
    // t1>t2, t2>t3, t3>t1 (circle) with different margins; all beat t4.
    const score={[`${t1}|${t2}`]:[11,9],[`${t2}|${t3}`]:[11,3],[`${t3}|${t1}`]:[11,5],[`${t1}|${t4}`]:[11,2],[`${t2}|${t4}`]:[11,2],[`${t3}|${t4}`]:[11,2]};
    for(const m of groupMatches(division.id)(f)){
      const forward=score[`${m.team_a_id}|${m.team_b_id}`],reverse=score[`${m.team_b_id}|${m.team_a_id}`];
      const set=forward||[reverse[1],reverse[0]];
      ok(await f.api(`/api/matches/${m.id}/quick-score`,{sets:[set]},"POST"),"quick score");
    }
    const state=ok(await f.api("/api/admin/state",undefined,"GET"),"state");
    const order=state.teams.filter(t=>t.divisionId===division.id).sort((a,b)=>a.standingRank-b.standingRank).map(t=>t.id);
    // Mini-league point difference: t2 +8-2=+6... t2: +8 vs t3, -2 vs t1 = +6; t3: +6 vs t1, -8 vs t2 = -2; t1: +2 vs t2, -6 vs t3 = -4.
    assert.deepEqual(order,[t2,t3,t1,t4]);
  }finally{f.db.close()}
});

test("a referee can only score the match assigned to them",async()=>{
  const f=await fresh();
  try{
    const rules={format:"single_elimination",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally"};
    const {division}=await setupDivision(f,{name:"Ref",eventType:"doubles",rules,teams:4,perTeam:2,courts:2});
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const [mine,other]=knockoutReady(f,division.id);
    f.db.prepare("UPDATE matches SET referee_user_id=? WHERE id=?").run("local",mine);
    const allowed=await f.api(`/api/matches/${mine}/rally`,{side:"A"},"POST","local");
    const denied=await f.api(`/api/matches/${other}/rally`,{side:"A"},"POST","local");
    assert.equal(allowed.status,200);assert.equal(denied.status,403);
    assert.equal(row(f,other).current_score_a,0);
  }finally{f.db.close()}
});

test("scoring rules cannot change once a division has started; names and timing still can",async()=>{
  const f=await fresh();
  try{
    const rules={format:"single_elimination",scoringMode:"rally",relaySegmentPoints:9,relayTeamSize:3,finalPointOnServe:true};
    const {division}=await setupDivision(f,{name:"Lock",rules,teams:2,perTeam:3,courts:1});
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const [id]=knockoutReady(f,division.id);
    f.db.prepare("UPDATE matches SET status='live',current_score_a=15,current_score_b=10,started_at='2026-10-11T09:10:00Z' WHERE id=?").run(id);
    // Switching 27 -> 11 mid-match would hand team A the game at 15-10.
    for(const body of [{relaySegmentPoints:0,pointsToWin:11},{bestOf:3,relaySegmentPoints:0},{scoringMode:"side_out"},{finalPointOnServe:false},{relayTeamSize:4}]){
      const r=await f.api(`/api/divisions/${division.id}`,body);
      assert.equal(r.status,409,JSON.stringify(body));assert.equal(r.data.error,"RULES_LOCKED_AFTER_START");
      const full=await f.api(`/api/divisions/${division.id}/full`,body);
      assert.equal(full.status,409,"full edit is locked too: "+JSON.stringify(body));
    }
    const d=f.db.prepare("SELECT * FROM divisions WHERE id=?").get(division.id);
    assert.equal(d.points_to_win,27);assert.equal(d.scoring_mode,"rally");
    ok(await f.api(`/api/divisions/${division.id}`,{name:"MLP (đổi tên)",matchSlotMinutes:25,minimumRestMinutes:5}),"non-scoring edits allowed");
    ok(await f.api(`/api/divisions/${division.id}`,{pointsToWin:27,relaySegmentPoints:9,relayTeamSize:3,bestOf:1,scoringMode:"rally",finalPointOnServe:true}),"re-saving the same rules is allowed");
  }finally{f.db.close()}
});

test("timeouts reset every game in a best-of-3 match",async()=>{
  const f=await fresh();
  try{
    const rules={format:"single_elimination",bestOf:3,pointsToWin:11,winByTwo:true,scoringMode:"rally"};
    const {division}=await setupDivision(f,{name:"TO",eventType:"doubles",rules,teams:2,perTeam:2,courts:1});
    ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    const [id]=knockoutReady(f,division.id);
    for(let i=0;i<2;i++)ok(await f.api(`/api/matches/${id}/timeout`,{side:"A",kind:"standard"},"POST"),"timeout");
    assert.equal((await f.api(`/api/matches/${id}/timeout`,{side:"A",kind:"standard"},"POST")).status,409);
    f.db.prepare("UPDATE matches SET status='live',current_score_a=11,current_score_b=4 WHERE id=?").run(id);
    ok(await f.api(`/api/matches/${id}/finish-set`,{},"POST"),"game 1");
    for(let i=0;i<2;i++)ok(await f.api(`/api/matches/${id}/timeout`,{side:"A",kind:"standard"},"POST"),"timeout in game 2");
    ok(await f.api(`/api/matches/${id}/timeout`,{side:"B",kind:"medical"},"POST"),"medical");
    assert.equal((await f.api(`/api/matches/${id}/timeout`,{side:"B",kind:"medical"},"POST")).status,409,"one medical timeout per match");
  }finally{f.db.close()}
});

test("a team withdrawing mid-pool drops out of standings and the bracket",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally",advanceCount:2,thirdPlaceMatch:true};
    const {division,teamIds,strength}=await setupDivision(f,{name:"Out",eventType:"doubles",rules,teams:8,perTeam:2,courts:2});
    await drawAndSchedule(f,division.id,{groupCount:2,teamsPerGroup:4});
    const quitter=teamIds[0];
    ok(await f.api(`/api/teams/${quitter}`,{status:"withdrawn"}),"withdraw");
    const rand=seeded(77),stats={rallies:0,finalPointSideOuts:0};
    const playable=groupMatches(division.id)(f).filter(m=>m.team_a_id!==quitter&&m.team_b_id!==quitter);
    await playAll(f,playable.map(m=>m.id),strength,rand,stats);
    const bracket=ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
    assert.equal(bracket.qualifiers,4);
    const inBracket=f.db.prepare("SELECT team_a_id,team_b_id FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL").all(division.id).flatMap(m=>[m.team_a_id,m.team_b_id]);
    assert.ok(!inBracket.includes(quitter),"withdrawn team never qualifies");
    await playKnockout(f,division.id,strength,rand,stats);
  }finally{f.db.close()}
});

test("the draw cannot be re-run once a pool match has been scored",async()=>{
  const f=await fresh();
  try{
    const rules={format:"pool_to_knockout",bestOf:1,pointsToWin:11,winByTwo:true,scoringMode:"rally",advanceCount:2};
    const {division}=await setupDivision(f,{name:"Redraw",eventType:"doubles",rules,teams:8,perTeam:2,courts:2});
    await drawAndSchedule(f,division.id,{groupCount:2,teamsPerGroup:4});
    const before=standings(f,division.id).map(t=>t.group_code).join("");
    const [first]=groupMatches(division.id)(f);
    ok(await f.api(`/api/matches/${first.id}/rally`,{side:"A"},"POST"),"first rally");
    const again=await f.api(`/api/divisions/${division.id}/run-draw`,{mode:"random",groupCount:2,teamsPerGroup:4},"POST");
    assert.equal(again.status,409);assert.equal(again.data.error,"GROUP_STAGE_ALREADY_STARTED");
    assert.equal(standings(f,division.id).map(t=>t.group_code).join(""),before,"groups unchanged");
  }finally{f.db.close()}
});

test("quick-score typos that cannot happen on court are rejected",async()=>{
  const f=await fresh();
  try{
    const cases=[
      [{bestOf:1,pointsToWin:11,winByTwo:true},[[11,9]],200],[{bestOf:1,pointsToWin:11,winByTwo:true},[[13,11]],200],
      [{bestOf:1,pointsToWin:11,winByTwo:true},[[15,10]],400],[{bestOf:1,pointsToWin:11,winByTwo:true},[[12,9]],400],
      [{bestOf:1,pointsToWin:11,winByTwo:true},[[11,10]],400],[{bestOf:1,pointsToWin:21,winByTwo:false},[[21,20]],200],
      [{bestOf:1,pointsToWin:21,winByTwo:false},[[22,20]],400],[{bestOf:1,pointsToWin:21,winByTwo:false},[[21,21]],400],
      [{relaySegmentPoints:9,relayTeamSize:3},[[27,26]],200],[{relaySegmentPoints:9,relayTeamSize:3},[[28,20]],400]
    ];
    let n=0;
    for(const [rules,sets,status] of cases){
      const {division}=await setupDivision(f,{name:"Typo"+(++n),eventType:"doubles",rules:{format:"single_elimination",scoringMode:"rally",...rules},teams:2,perTeam:2,courts:1});
      ok(await f.api(`/api/divisions/${division.id}/generate-bracket`,{},"POST"),"bracket");
      const [id]=knockoutReady(f,division.id);
      const r=await f.api(`/api/matches/${id}/quick-score`,{sets},"POST");
      assert.equal(r.status,status,`${JSON.stringify(rules)} ${JSON.stringify(sets)} -> ${r.status} ${r.data?.error||""}`);
    }
  }finally{f.db.close()}
});
