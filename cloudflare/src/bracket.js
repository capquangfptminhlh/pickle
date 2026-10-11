import {uid,nowIso} from "./util.js";
import {loadState} from "./state.js";
import {isGroupStageMatch,rankGroupStandings} from "../../shared/standings.js";
import {divisionBracketRules} from "../../shared/bracket-rules.js";
import {bracketSeedOrder as seedOrder,singleEliminationSlots} from "../../shared/bracket-seeding.js";

async function rows(env,sql,...args){
  const r=await env.DB.prepare(sql).bind(...args).all();
  return r.results||[];
}
async function one(env,sql,...args){return env.DB.prepare(sql).bind(...args).first()}

function isPow2(n){return n>0&&(n&(n-1))===0}
function stageName(round,total){
  const remaining=total-round;
  if(remaining===0)return "Chung kết";
  if(remaining===1)return "Bán kết";
  if(remaining===2)return "Tứ kết";
  return "Vòng "+round;
}
function matchInsert(env,m){
  return env.DB.prepare(
    "INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,round_no,bracket_slot,bracket_series,next_match_id,next_match_side,loser_next_match_id,loser_next_match_side,status,winner_team_id,completed_at,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)"
  ).bind(
    m.id,m.divisionId,m.a||null,m.b||null,m.stage,m.roundNo,m.slot,m.series||"A",
    m.nextId||null,m.nextSide||null,m.loserNextId||null,m.loserNextSide||null,
    m.status||"scheduled",m.winner||null,m.completedAt||null,nowIso()
  );
}
async function persistBracket(env,created,expectedSignature){
  const byId=new Map(created.map(m=>[m.id,m]));
  for(const m of created.filter(x=>x.winner&&x.nextId)){
    byId.get(m.nextId)[m.nextSide.toLowerCase()]=m.winner;
  }
  try{
    const divisionId=created[0].divisionId;
    await env.DB.batch([
      env.DB.prepare('INSERT INTO division_draw_reset_guards(division_id,expected_signature) VALUES(?,?)').bind(divisionId,expectedSignature),
      ...created.map(m=>matchInsert(env,m)),
      env.DB.prepare('DELETE FROM division_draw_reset_guards WHERE division_id=?').bind(divisionId)
    ]);
  }catch(error){
    const message=String(error?.message||"")+" "+String(error?.cause?.message||"");
    if(message.includes("BRACKET_ALREADY_EXISTS"))throw Object.assign(new Error("BRACKET_ALREADY_EXISTS"),{status:409});
    if(message.includes("DRAW_RESET_CONFLICT")){
      const existing=await one(env,"SELECT id FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL LIMIT 1",created[0].divisionId);
      throw Object.assign(new Error(existing?"BRACKET_ALREADY_EXISTS":"BRACKET_STATE_CHANGED"),{status:409});
    }
    throw error;
  }
}
function qualifiers(state,division){
  const list=state.teams.filter(t=>t.divisionId===division.id&&t.status==="active");
  if(division.format!=="pool_to_knockout")return {a:[...list].sort((a,b)=>Number(a.seed||9999)-Number(b.seed||9999)||String(a.name).localeCompare(String(b.name),"vi")),b:[]};
  const groups=[...new Set(list.map(t=>t.group||"A"))].sort();
  const selected=[],seriesB=[];
  const count=Math.max(1,Number(division.advance_count||2));
  const divisionMatches=state.matches.filter(m=>m.divisionId===division.id);
  for(const group of groups){
    const ranked=rankGroupStandings(list.filter(t=>(t.group||"A")===group),divisionMatches);
    selected.push(...ranked.slice(0,count).map((team,index)=>({...team,groupRank:index+1})));
    if(Number(division.series_b_enabled)===1){
      if(!ranked[2])throw Object.assign(new Error("NOT_ENOUGH_SERIES_B_QUALIFIERS"),{status:400});
      seriesB.push({...ranked[2],groupRank:3});
    }
  }
  if(Number(division.series_b_enabled)===1&&seriesB.length<2)throw Object.assign(new Error("NOT_ENOUGH_SERIES_B_QUALIFIERS"),{status:400});
  return {a:selected,b:seriesB};
}

function buildSingle(division,teams,series="A"){
  if(teams.length<2)throw Object.assign(new Error("NOT_ENOUGH_TEAMS"),{status:400});
  const {size,slots,protectedSameGroupUntilFinal}=singleEliminationSlots(division,teams),rounds=Math.log2(size);
  const ids=[];
  for(let r=1;r<=rounds;r++){
    ids[r]=[];
    const count=size/2**r;
    for(let i=0;i<count;i++)ids[r][i]=uid();
  }
  const created=[];
  for(let r=1;r<=rounds;r++){
    const count=size/2**r;
    for(let i=0;i<count;i++){
      const nextId=r<rounds?ids[r+1][Math.floor(i/2)]:null;
      const nextSide=r<rounds?(i%2===0?"A":"B"):null;
      let a=null,b=null,status="scheduled",winner=null,completedAt=null;
      if(r===1){
        a=slots[i*2]||null;b=slots[i*2+1]||null;
        if((a&&!b)||(!a&&b)){winner=a||b;status="completed";completedAt=nowIso()}
      }
      const m={id:ids[r][i],divisionId:division.id,a,b,stage:stageName(r,rounds),roundNo:r,series,slot:`${series==="B"?"B-":""}SE-R${r}-M${i+1}`,nextId,nextSide,status,winner,completedAt};
      created.push(m);
    }
  }
  // A third-place playoff needs two real semifinal losers; a bye semifinal has none.
  const semis=rounds>=2?created.filter(m=>m.roundNo===rounds-1):[];
  const thirdPlace=Number(division.third_place_match)===1&&semis.length===2&&!semis.some(m=>m.status==="completed");
  if(thirdPlace){
    const id=uid();
    semis.forEach((m,i)=>{m.loserNextId=id;m.loserNextSide=i===0?"A":"B"});
    created.push({id,divisionId:division.id,a:null,b:null,stage:"Tranh hạng ba",roundNo:rounds,series,slot:`${series==="B"?"B-":""}SE-3RD-M1`});
  }
  return {matches:created,summary:{format:"single_elimination",bracketSize:size,created:created.length,qualifiers:teams.length,protectedSameGroupUntilFinal,thirdPlaceMatch:thirdPlace}};
}

async function generateDouble(env,division,teams,expectedSignature){
  if(teams.length<4||!isPow2(teams.length))throw Object.assign(new Error("DOUBLE_ELIMINATION_POWER_OF_TWO_REQUIRED"),{status:400});
  const n=teams.length,k=Math.log2(n);
  const w={},l={};
  for(let r=1;r<=k;r++){
    const count=n/2**r;w[r]=Array.from({length:count},()=>uid());
  }
  for(let lr=1;lr<=2*(k-1);lr++){
    const count=n/2**(Math.floor((lr+1)/2)+1);
    l[lr]=Array.from({length:count},()=>uid());
  }
  const gf=uid(),created=[];
  const ordered=[...teams].sort((a,b)=>Number(a.seed||9999)-Number(b.seed||9999)||String(a.name).localeCompare(String(b.name),"vi"));
  const slots=seedOrder(n).map(seed=>ordered[seed-1]?.id||null);

  for(let r=1;r<=k;r++){
    const count=w[r].length;
    for(let i=0;i<count;i++){
      let nextId=null,nextSide=null;
      if(r<k){nextId=w[r+1][Math.floor(i/2)];nextSide=i%2===0?"A":"B"}
      else {nextId=gf;nextSide="A"}
      let loserNextId=null,loserNextSide=null;
      if(r===1){loserNextId=l[1][Math.floor(i/2)];loserNextSide=i%2===0?"A":"B"}
      else {const lr=2*r-2;loserNextId=l[lr][i];loserNextSide="B"}
      const m={id:w[r][i],divisionId:division.id,a:r===1?slots[i*2]:null,b:r===1?slots[i*2+1]:null,stage:r===k?"Chung kết nhánh thắng":`Nhánh thắng R${r}`,roundNo:r,slot:`DE-W-R${r}-M${i+1}`,nextId,nextSide,loserNextId,loserNextSide};
      created.push(m);
    }
  }

  const loserRounds=2*(k-1);
  for(let lr=1;lr<=loserRounds;lr++){
    const count=l[lr].length;
    for(let i=0;i<count;i++){
      let nextId,nextSide;
      if(lr===loserRounds){nextId=gf;nextSide="B"}
      else if(lr%2===1){nextId=l[lr+1][i];nextSide="A"}
      else {nextId=l[lr+1][Math.floor(i/2)];nextSide=i%2===0?"A":"B"}
      const m={id:l[lr][i],divisionId:division.id,a:null,b:null,stage:lr===loserRounds?"Chung kết nhánh thua":`Nhánh thua R${lr}`,roundNo:lr,slot:`DE-L-R${lr}-M${i+1}`,nextId,nextSide};
      created.push(m);
    }
  }
  const final={id:gf,divisionId:division.id,a:null,b:null,stage:"Chung kết",roundNo:k+1,slot:"DE-GF-M1"};
  created.push(final);
  await persistBracket(env,created,expectedSignature);
  return {format:"double_elimination",bracketSize:n,created:created.length,qualifiers:teams.length};
}

export async function generateBracket(env,divisionId){
  // Capture the configuration and history revision before reading any rules.
  const expectedSignature=(await one(env,"SELECT signature FROM division_draw_reset_state WHERE division_id=?",divisionId))?.signature;
  const division=await one(env,"SELECT * FROM divisions WHERE id=?",divisionId);
  if(!division)throw Object.assign(new Error("NOT_FOUND"),{status:404});
  const bracketRules=divisionBracketRules({},division);
  if(division.format==="round_robin")throw Object.assign(new Error("ROUND_ROBIN_HAS_NO_KNOCKOUT"),{status:400});

  const existing=await rows(env,"SELECT id,status,winner_team_id,started_at,current_score_a,current_score_b FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL",divisionId);
  if(existing.length){
    const started=existing.some(m=>m.started_at||m.winner_team_id||["live","completed","walkover","cancelled"].includes(m.status)||Number(m.current_score_a||0)||Number(m.current_score_b||0));
    throw Object.assign(new Error(started?"BRACKET_ALREADY_STARTED":"BRACKET_ALREADY_EXISTS"),{status:409});
  }

  const state=await loadState(env);
  if(division.format==="pool_to_knockout"){
    const active=state.teams.filter(t=>t.divisionId===divisionId&&t.status==="active");
    const groups=[...new Set(active.map(t=>t.group||"A"))];
    for(const group of groups){
      const members=active.filter(t=>(t.group||"A")===group);
      const expected=members.length*(members.length-1)/2;
      const ids=new Set(members.map(t=>t.id));
      const matches=state.matches.filter(m=>m.divisionId===divisionId&&isGroupStageMatch(m)&&m.a!==m.b&&ids.has(m.a)&&ids.has(m.b));
      const played=new Set(matches.filter(m=>["done","completed","walkover"].includes(m.status)&&(m.winner===m.a||m.winner===m.b))
        .map(m=>JSON.stringify([m.a,m.b].sort())));
      if(played.size<expected||matches.some(m=>["wait","live"].includes(m.status)))throw Object.assign(new Error("GROUP_STAGE_NOT_COMPLETE"),{status:409});
    }
  }

  const teams=qualifiers(state,division);
  if(teams.a.length<2)throw Object.assign(new Error("NOT_ENOUGH_QUALIFIERS"),{status:400});
  if(division.format==="double_elimination")return generateDouble(env,division,teams.a,expectedSignature);
  const seriesA=buildSingle(division,teams.a),seriesB=bracketRules.seriesBEnabled?buildSingle({...division,format:"single_elimination",third_place_match:Number(bracketRules.seriesBThirdPlaceMatch)},teams.b,"B"):null;
  await persistBracket(env,[...seriesA.matches,...(seriesB?.matches||[])],expectedSignature);
  return {...seriesA.summary,created:seriesA.summary.created+(seriesB?.summary.created||0),qualifiers:teams.a.length+teams.b.length,seriesBEnabled:bracketRules.seriesBEnabled,seriesA:seriesA.summary,seriesB:seriesB?.summary||null};
}

export async function advanceBracket(env,matchId,winnerId){
  const m=await one(env,"SELECT * FROM matches WHERE id=?",matchId);
  if(!m||!winnerId)return;
  const loser=winnerId===m.team_a_id?m.team_b_id:m.team_a_id;
  if(m.next_match_id&&m.next_match_side){
    const col=m.next_match_side==="A"?"team_a_id":"team_b_id";
    await env.DB.prepare(`UPDATE matches SET ${col}=?,version=version+1 WHERE id=?`).bind(winnerId,m.next_match_id).run();
  }
  if(loser&&m.loser_next_match_id&&m.loser_next_match_side){
    const col=m.loser_next_match_side==="A"?"team_a_id":"team_b_id";
    await env.DB.prepare(`UPDATE matches SET ${col}=?,version=version+1 WHERE id=?`).bind(loser,m.loser_next_match_id).run();
  }
}

export async function rewindBracket(env,matchId,winnerId){
  const m=await one(env,"SELECT * FROM matches WHERE id=?",matchId);
  if(!m)return;
  const loser=winnerId===m.team_a_id?m.team_b_id:m.team_a_id;
  if(m.next_match_id&&m.next_match_side){
    const col=m.next_match_side==="A"?"team_a_id":"team_b_id";
    const next=await one(env,`SELECT ${col} AS team FROM matches WHERE id=?`,m.next_match_id);
    if(next?.team===winnerId)await env.DB.prepare(`UPDATE matches SET ${col}=NULL,version=version+1 WHERE id=?`).bind(m.next_match_id).run();
  }
  if(loser&&m.loser_next_match_id&&m.loser_next_match_side){
    const col=m.loser_next_match_side==="A"?"team_a_id":"team_b_id";
    const next=await one(env,`SELECT ${col} AS team FROM matches WHERE id=?`,m.loser_next_match_id);
    if(next?.team===loser)await env.DB.prepare(`UPDATE matches SET ${col}=NULL,version=version+1 WHERE id=?`).bind(m.loser_next_match_id).run();
  }
}
