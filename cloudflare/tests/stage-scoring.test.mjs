import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";
import {stageScoringRules,isChampionshipFinal,inspectExistingMatch} from "../../shared/stage-scoring-rules.js";

async function call(f,path,{method="GET",body,actor="admin"}={}){
  const request=new Request("https://fixture.invalid"+path,{method,headers:{Authorization:"Bearer "+f.tokens[actor],"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const res=await worker.fetch(request,f.env);
  return {status:res.status,data:await res.json()};
}
test("championship detection excludes preliminary winner/loser brackets",()=>{
  assert.equal(isChampionshipFinal("Chung kết"),true);
  assert.equal(isChampionshipFinal("Chung kết tổng"),true);
  assert.equal(isChampionshipFinal("Chung kết nhánh thắng"),false);
  assert.equal(isChampionshipFinal("Bán kết"),false);
});
test("non-finals have one 11-point game; finals offer only best-of-three 11 or single 15",()=>{
  const d={best_of:3,points_to_win:11,win_by_two:1,stage_rules_enabled:1,final_format:"single_15",event_type:"doubles"};
  assert.deepEqual(stageScoringRules(d,{stage:"Bảng A"}),{best_of:1,points_to_win:11,win_by_two:0});
  assert.deepEqual(stageScoringRules(d,{stage:"Tứ kết"}),{best_of:1,points_to_win:11,win_by_two:0});
  assert.deepEqual(stageScoringRules(d,{stage:"Bán kết"}),{best_of:1,points_to_win:11,win_by_two:0});
  assert.deepEqual(stageScoringRules(d,{stage:"Chung kết"}),{best_of:1,points_to_win:15,win_by_two:0});
  assert.deepEqual(stageScoringRules({...d,final_format:"best3_11"},{stage:"Chung kết"}),{best_of:3,points_to_win:11,win_by_two:0});
  assert.deepEqual(stageScoringRules({...d,stage_rules_enabled:0},{stage:"Bảng A"}),{best_of:3,points_to_win:11,win_by_two:1});
});
test("real live score 2-11 remains recorded through confirmed rule adoption, then can finish one-game match",async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE matches SET status='live',started_at='2026-10-15T06:00:00Z',current_score_a=2,current_score_b=11,version=5 WHERE id='match'");
    const a=await call(f,"/api/divisions/division/stage-rules?finalFormat=best3_11");
    assert.equal(a.status,200);assert.equal(a.data.eligible,true);
    assert.equal(a.data.matchCount,1);assert.equal(a.data.recordedSets,0);
    const before=f.match();
    const unconfirmed=await call(f,"/api/divisions/division/stage-rules",{method:"PUT",body:{finalFormat:"best3_11",expectedSignature:a.data.expectedSignature}});
    assert.equal(unconfirmed.status,409);
    assert.equal(f.db.prepare("SELECT stage_rules_enabled FROM divisions WHERE id='division'").get().stage_rules_enabled,0);
    const apply=await call(f,"/api/divisions/division/stage-rules",{method:"PUT",body:{finalFormat:"best3_11",expectedSignature:a.data.expectedSignature,confirm:true}});
    assert.equal(apply.status,200);
    assert.deepEqual([f.match().version,f.match().current_score_a,f.match().current_score_b],[before.version,2,11]);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM match_sets WHERE match_id='match'").get().n,0);
    const st=await call(f,"/api/admin/state");
    assert.deepEqual(st.data.matches.find(m=>m.id==="match").matchRules,{bestOf:1,pointsToWin:11,winByTwo:false});
    const finished=await f.api("finish",{expectedVersion:5});
    assert.equal(finished.status,200);
    assert.equal(f.match().winner_team_id,"b");
    assert.deepEqual(f.sets().map(s=>[s.score_a,s.score_b]),[[2,11]]);
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='ACTIVATE_STAGE_SCORING'").get().n,1);
  }finally{f.db.close()}
});
test("completed best-of-three history incompatible with new one-set rules is blocked without mutation",async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE matches SET status='completed',winner_team_id='a',current_score_a=0,current_score_b=0 WHERE id='match'");
    f.db.exec("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('set1','match',1,11,4,1),('set2','match',2,11,9,1)");
    const old=f.match();
    const pre=await call(f,"/api/divisions/division/stage-rules");
    assert.equal(pre.status,200);assert.equal(pre.data.eligible,false);
    assert.equal(pre.data.blockers.length,1);
    const change=await call(f,"/api/divisions/division/stage-rules",{method:"PUT",body:{finalFormat:"single_15",expectedSignature:pre.data.expectedSignature,confirm:true}});
    assert.equal(change.status,409);
    assert.equal(f.match().version,old.version);
    assert.equal(f.db.prepare("SELECT stage_rules_enabled FROM divisions WHERE id='division'").get().stage_rules_enabled,0);
    assert.equal(f.sets().length,2);
  }finally{f.db.close()}
});
test("stale preview cannot activate rules after a score changes",async()=>{
  const f=await scoringFixture();
  try{
    const preview=await call(f,"/api/divisions/division/stage-rules");
    f.db.exec("UPDATE matches SET version=version+1 WHERE id='match'");
    const change=await call(f,"/api/divisions/division/stage-rules",{method:"PUT",body:{finalFormat:"single_15",expectedSignature:preview.data.expectedSignature,confirm:true}});
    assert.equal(change.status,409);assert.equal(change.data.error,"STAGE_RULES_PREVIEW_EXPIRED");
  }finally{f.db.close()}
});
test("final single-15 and best-three-to-11 validate at the scoring API, without win-by-two",async()=>{
  for(const [format,scores,winner] of [["single_15",[[15,14]],"a"],["best3_11",[[10,11],[11,9],[11,10]],"a"]]){
    const f=await scoringFixture();
    try{
      f.db.prepare("UPDATE matches SET stage='Chung kết' WHERE id='match'").run();
      f.db.prepare("UPDATE divisions SET stage_rules_enabled=1,final_format=? WHERE id='division'").run(format);
      const res=await f.api("quick-score",{sets:scores,expectedVersion:1});
      assert.equal(res.status,200,format+":"+JSON.stringify(res.data));
      assert.equal(f.match().winner_team_id,winner);
      assert.equal(f.sets().length,scores.length);
    }finally{f.db.close()}
  }
});
test("live current scores beyond target are flagged, without rewriting them",()=>{
  const d={event_type:"doubles",stage_rules_enabled:1,final_format:"single_15"};
  const m={id:"m",stage:"Bảng B",status:"live",current_score_a:12,current_score_b:10};
  assert.equal(inspectExistingMatch(m,[],d,"single_15").reason,"LIVE_SCORE_OUTSIDE_RULES");
});

test("a scored match cannot change its stage and implicitly change rules",async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE divisions SET stage_rules_enabled=1 WHERE id='division';UPDATE matches SET started_at='2026-10-15T09:00:00Z',status='live',current_score_a=2,current_score_b=11 WHERE id='match'");
    const res=await call(f,"/api/matches/match",{method:"PATCH",body:{stage:"Chung kết"}});
    assert.equal(res.status,409);
    assert.equal(res.data.error,"MATCH_STAGE_LOCKED");
    assert.equal(f.match().stage,"Vòng bảng");
  }finally{f.db.close()}
});
