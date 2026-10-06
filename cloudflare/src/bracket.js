import {uid,nowIso} from "./util.js";
import {loadState} from "./state.js";
import {isGroupStageMatch,rankGroupStandings} from "../../shared/standings.js";

async function rows(env,sql,...args){
  const r=await env.DB.prepare(sql).bind(...args).all();
  return r.results||[];
}
async function one(env,sql,...args){return env.DB.prepare(sql).bind(...args).first()}

function nextPow2(n){let p=1;while(p<n)p*=2;return p}
function isPow2(n){return n>0&&(n&(n-1))===0}
function stageName(round,total){
  const remaining=total-round;
  if(remaining===0)return "Chung kết";
  if(remaining===1)return "Bán kết";
  if(remaining===2)return "Tứ kết";
  return "Vòng "+round;
}
function seedOrder(size){
  if(size===1)return [1];
  let order=[1,2];
  for(let n=4;n<=size;n*=2){
    const next=[];
    for(const seed of order)next.push(seed,n+1-seed);
    order=next;
  }
  return order;
}
function matchInsert(env,m){
  return env.DB.prepare(
    "INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,round_no,bracket_slot,next_match_id,next_match_side,loser_next_match_id,loser_next_match_side,status,winner_team_id,completed_at,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)"
  ).bind(
    m.id,m.divisionId,m.a||null,m.b||null,m.stage,m.roundNo,m.slot,
    m.nextId||null,m.nextSide||null,m.loserNextId||null,m.loserNextSide||null,
    m.status||"scheduled",m.winner||null,m.completedAt||null,nowIso()
  );
}
async function persistBracket(env,created){
  const byId=new Map(created.map(m=>[m.id,m]));
  for(const m of created.filter(x=>x.winner&&x.nextId)){
    byId.get(m.nextId)[m.nextSide.toLowerCase()]=m.winner;
  }
  try{
    await env.DB.batch(created.map(m=>matchInsert(env,m)));
  }catch(error){
    const message=String(error?.message||"")+" "+String(error?.cause?.message||"");
    if(message.includes("BRACKET_ALREADY_EXISTS"))throw Object.assign(new Error("BRACKET_ALREADY_EXISTS"),{status:409});
    throw error;
  }
}
async function qualifiers(env,division){
  const state=await loadState(env);
  const list=state.teams.filter(t=>t.divisionId===division.id&&t.status==="active");
  if(division.format!=="pool_to_knockout")return [...list].sort((a,b)=>Number(a.seed||9999)-Number(b.seed||9999)||String(a.name).localeCompare(String(b.name),"vi"));
  const groups=[...new Set(list.map(t=>t.group||"A"))].sort();
  const selected=[];
  const count=Math.max(1,Number(division.advance_count||2));
  const divisionMatches=state.matches.filter(m=>m.divisionId===division.id);
  for(const group of groups){
    const ranked=rankGroupStandings(list.filter(t=>(t.group||"A")===group),divisionMatches);
    selected.push(...ranked.slice(0,count).map((team,index)=>({...team,groupRank:index+1})));
  }
  return selected;
}

function protectedPoolSlots(division,teams,size){
  if(division.format!=="pool_to_knockout"||Number(division.advance_count||2)!==2||size!==teams.length||!isPow2(size))return null;
  const groups=[...new Set(teams.map(t=>t.group||"A"))].sort();
  if(groups.length<2||groups.length*2!==teams.length)return null;
  const first=groups.map(g=>teams.find(t=>(t.group||"A")===g&&Number(t.groupRank||t.standingRank)===1));
  const second=groups.map(g=>teams.find(t=>(t.group||"A")===g&&Number(t.groupRank||t.standingRank)===2));
  if(first.some(x=>!x)||second.some(x=>!x))return null;
  const slots=[];
  for(let i=0;i<groups.length;i++)slots.push(first[i].id,second[groups.length-1-i].id);
  return slots;
}

async function generateSingle(env,division,teams){
  if(teams.length<2)throw Object.assign(new Error("NOT_ENOUGH_TEAMS"),{status:400});
  const size=nextPow2(teams.length),rounds=Math.log2(size);
  const ids=[];
  for(let r=1;r<=rounds;r++){
    ids[r]=[];
    const count=size/2**r;
    for(let i=0;i<count;i++)ids[r][i]=uid();
  }
  const protectedSlots=protectedPoolSlots(division,teams,size);
  const order=seedOrder(size);
  const slots=protectedSlots||Array(size).fill(null);
  if(!protectedSlots)teams.forEach((t,i)=>{const pos=order.indexOf(i+1);if(pos>=0)slots[pos]=t.id});
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
      const m={id:ids[r][i],divisionId:division.id,a,b,stage:stageName(r,rounds),roundNo:r,slot:`SE-R${r}-M${i+1}`,nextId,nextSide,status,winner,completedAt};
      created.push(m);
    }
  }
  await persistBracket(env,created);
  return {format:"single_elimination",bracketSize:size,created:created.length,qualifiers:teams.length,protectedSameGroupUntilFinal:Boolean(protectedSlots)};
}

async function generateDouble(env,division,teams){
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
  await persistBracket(env,created);
  return {format:"double_elimination",bracketSize:n,created:created.length,qualifiers:teams.length};
}

export async function generateBracket(env,divisionId){
  const division=await one(env,"SELECT * FROM divisions WHERE id=?",divisionId);
  if(!division)throw Object.assign(new Error("NOT_FOUND"),{status:404});
  if(division.format==="round_robin")throw Object.assign(new Error("ROUND_ROBIN_HAS_NO_KNOCKOUT"),{status:400});

  const existing=await rows(env,"SELECT id,status,winner_team_id,started_at,current_score_a,current_score_b FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL",divisionId);
  if(existing.length){
    const started=existing.some(m=>m.started_at||m.winner_team_id||["live","completed","walkover","cancelled"].includes(m.status)||Number(m.current_score_a||0)||Number(m.current_score_b||0));
    throw Object.assign(new Error(started?"BRACKET_ALREADY_STARTED":"BRACKET_ALREADY_EXISTS"),{status:409});
  }

  if(division.format==="pool_to_knockout"){
    const state=await loadState(env);
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

  const teams=await qualifiers(env,division);
  if(teams.length<2)throw Object.assign(new Error("NOT_ENOUGH_QUALIFIERS"),{status:400});
  if(division.format==="double_elimination")return generateDouble(env,division,teams);
  return generateSingle(env,division,teams);
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
