import test from "node:test";
import assert from "node:assert/strict";
import {validateMatchFormat,relayLeg} from "../../shared/scoring-rules.js";
import {accountFixture} from "./helpers/accounts-fixture.mjs";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";

const mlpRelay={bestOf:1,pointsToWin:27,winByTwo:false,scoringMode:"rally",relaySegmentPoints:9,finalPointOnServe:true};

async function fresh(){
  const f=await accountFixture();
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  return f;
}
function addDivision(f,id,format="pool_to_knockout"){
  f.db.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format) VALUES(?,?,?,?,?)").run(id,"own",id,"team",format);
}
function rallyMatch(f,{flag=1,a=26,b=26,serve="A"}={}){
  f.db.exec(`UPDATE divisions SET scoring_mode='rally',best_of=1,points_to_win=27,win_by_two=0,relay_segment_points=9,final_point_on_serve=${flag} WHERE id='division';
    UPDATE divisions SET event_type='team' WHERE id='division';
    UPDATE matches SET status='live',current_score_a=${a},current_score_b=${b},serving_side='${serve}',server_number=1 WHERE id='match';`);
}

test("match format validation accepts the MLP relay and rejects impossible formats",()=>{
  assert.equal(validateMatchFormat(mlpRelay),null);
  assert.equal(validateMatchFormat({bestOf:3,pointsToWin:9}),null);
  assert.equal(validateMatchFormat({bestOf:2,pointsToWin:11}),"INVALID_BEST_OF");
  assert.equal(validateMatchFormat({bestOf:3,pointsToWin:0}),"INVALID_POINTS_TO_WIN");
  assert.equal(validateMatchFormat({bestOf:3,pointsToWin:100}),"INVALID_POINTS_TO_WIN");
  assert.equal(validateMatchFormat({bestOf:3,pointsToWin:27,relaySegmentPoints:9}),"RELAY_REQUIRES_SINGLE_GAME");
  assert.equal(validateMatchFormat({bestOf:1,pointsToWin:27,relaySegmentPoints:27}),"INVALID_RELAY_SEGMENT");
  assert.equal(validateMatchFormat({bestOf:1,pointsToWin:27,relaySegmentPoints:1.5}),"INVALID_RELAY_SEGMENT");
});

test("relay leg rotates pairs at every segment of the running score",()=>{
  assert.deepEqual(relayLeg(0,0,9,27),{index:0,count:3,until:9});
  assert.deepEqual(relayLeg(8,8,9,27),{index:0,count:3,until:9});
  assert.deepEqual(relayLeg(9,4,9,27),{index:1,count:3,until:18});
  assert.deepEqual(relayLeg(16,18,9,27),{index:2,count:3,until:27});
  assert.deepEqual(relayLeg(27,20,9,27),{index:2,count:3,until:27});
  assert.equal(relayLeg(5,5,0,27),null);
});

test("receiving side winning the game-point rally only takes the serve back",async()=>{
  const f=await scoringFixture();rallyMatch(f);
  const r=await f.api("rally",{side:"B"});assert.equal(r.status,200);
  assert.equal(f.match().current_score_a,26);assert.equal(f.match().current_score_b,26);assert.equal(f.match().serving_side,"B");
  assert.equal((await f.api("rally",{side:"B"})).status,200);
  assert.equal(f.match().current_score_b,27);
  assert.equal((await f.api("finish")).status,200);assert.equal(f.match().winner_team_id,"b");
});

test("receiving side still scores ordinary rally points under the final-point rule",async()=>{
  const f=await scoringFixture();rallyMatch(f,{a:20,b:12});
  assert.equal((await f.api("rally",{side:"B"})).status,200);assert.equal(f.match().current_score_b,13);assert.equal(f.match().serving_side,"B");
});

test("without the final-point rule any rally winner takes the game point",async()=>{
  const f=await scoringFixture();rallyMatch(f,{flag:0});
  assert.equal((await f.api("rally",{side:"B"})).status,200);assert.equal(f.match().current_score_b,27);
});

test("undo restores the serve after a final-point side-out",async()=>{
  const f=await scoringFixture();rallyMatch(f);
  await f.api("rally",{side:"B"});assert.equal((await f.api("undo")).status,200);
  assert.equal(f.match().serving_side,"A");assert.equal(f.match().current_score_b,26);
});

test("division routes persist relay rules and reject a relay split into a series",async()=>{
  const f=await fresh();
  try{
    const created=await f.api("/api/tournaments/own/divisions",{name:"MLP",eventType:"team",format:"pool_to_knockout",...mlpRelay,thirdPlaceMatch:true},"POST");
    assert.equal(created.status,201);
    const row=f.db.prepare("SELECT * FROM divisions WHERE id=?").get(created.data.id);
    assert.equal(row.points_to_win,27);assert.equal(row.relay_segment_points,9);assert.equal(row.final_point_on_serve,1);assert.equal(row.third_place_match,1);
    const bad=await f.api("/api/divisions/"+created.data.id,{bestOf:3});assert.equal(bad.status,400);assert.equal(bad.data.error,"RELAY_REQUIRES_SINGLE_GAME");
    const full=await f.api("/api/divisions/"+created.data.id+"/full",{relaySegmentPoints:0,bestOf:3,pointsToWin:9,finalPointOnServe:false});
    assert.equal(full.status,200);
    const after=f.db.prepare("SELECT * FROM divisions WHERE id=?").get(created.data.id);
    assert.equal(after.relay_segment_points,0);assert.equal(after.best_of,3);assert.equal(after.final_point_on_serve,0);assert.equal(after.third_place_match,1);
    const state=await f.api("/api/admin/state",undefined,"GET");
    const d=state.data.divisions.find(x=>x.id===created.data.id);
    assert.equal(d.thirdPlaceMatch,true);assert.equal(d.relaySegmentPoints,0);
  }finally{f.db.close()}
});

test("third-place playoff receives both semifinal losers",async()=>{
  const f=await fresh();
  try{
    addDivision(f,"d","single_elimination");f.db.exec("UPDATE divisions SET third_place_match=1 WHERE id='d'");
    for(let i=1;i<=4;i++)f.db.prepare("INSERT INTO teams(id,division_id,name,seed,status) VALUES(?,?,?,?,'active')").run("t"+i,"d","t"+i,i);
    const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");
    assert.equal(r.status,200);assert.equal(r.data.created,4);assert.equal(r.data.thirdPlaceMatch,true);
    const semis=f.db.prepare("SELECT * FROM matches WHERE division_id='d' AND round_no=1 ORDER BY bracket_slot").all();
    for(const m of semis){
      const q=await f.api("/api/matches/"+m.id+"/quick-score",{sets:[[11,3],[11,4]]},"POST");assert.equal(q.status,200);
    }
    const third=f.db.prepare("SELECT * FROM matches WHERE bracket_slot='SE-3RD-M1'").get();
    assert.equal(third.stage,"Tranh hạng ba");
    assert.deepEqual([third.team_a_id,third.team_b_id].sort(),semis.map(m=>m.team_b_id).sort());
    const final=f.db.prepare("SELECT * FROM matches WHERE bracket_slot='SE-R2-M1'").get();
    assert.deepEqual([final.team_a_id,final.team_b_id].sort(),semis.map(m=>m.team_a_id).sort());
  }finally{f.db.close()}
});

test("third-place playoff is skipped when a semifinal is a bye",async()=>{
  const f=await fresh();
  try{
    addDivision(f,"d","single_elimination");f.db.exec("UPDATE divisions SET third_place_match=1 WHERE id='d'");
    for(let i=1;i<=3;i++)f.db.prepare("INSERT INTO teams(id,division_id,name,seed,status) VALUES(?,?,?,?,'active')").run("t"+i,"d","t"+i,i);
    const r=await f.api("/api/divisions/d/generate-bracket",{},"POST");
    assert.equal(r.status,200);assert.equal(r.data.thirdPlaceMatch,false);assert.equal(r.data.created,3);
  }finally{f.db.close()}
});
