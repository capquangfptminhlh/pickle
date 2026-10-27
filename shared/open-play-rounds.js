import {buildOpenPlayPairs,validateOpenPlayParticipant} from "./open-play.js";

// Deterministic multi-round doubles preview. No DB writes and no random seed.
// Fairness is best-effort: prioritize people with fewer games and unseen partners.
// Court numbers are *virtual* until a venue confirms availability.
const intInRange=(value,min,max,code)=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(code);
  return n;
};
const pairKey=(a,b)=>a<b?a+"\u0000"+b:b+"\u0000"+a;
const compareId=(a,b)=>a.localeCompare(b,"en");
const preference=(a,b,partnerHistory)=>{
  const previous=partnerHistory.get(pairKey(a.id,b.id))||0;
  const sum=a.rating+b.rating;
  // Strongly discourage repeat partners; compare balance then stable id.
  return [previous,-sum,Math.abs(a.rating-b.rating),b.id];
};
const cmpScore=(x,y)=>{
  for(let i=0;i<x.length;i++){
    if(typeof x[i]==="string")return compareId(x[i],y[i]);
    if(x[i]!==y[i])return x[i]-y[i];
  }
  return 0;
};
export function previewOpenPlayRounds(players,options={}){
  // Reuse the single-round engine as the canonical rating/ID/size validator.
  const maxCombinedRating=Number(options.maxCombinedRating??5.2);
  const tolerance=Number(options.tolerance??0);
  buildOpenPlayPairs(players,{maxCombinedRating,tolerance});
  const rounds=intInRange(options.rounds??3,1,12,"INVALID_OPEN_PLAY_ROUNDS");
  const courtCount=intInRange(options.courtCount??1,1,32,"INVALID_OPEN_PLAY_COURT_COUNT");
  const participants=players.map(validateOpenPlayParticipant).sort((a,b)=>compareId(a.id,b.id));
  const played=new Map(participants.map(p=>[p.id,0]));
  const lastPlayed=new Map(participants.map(p=>[p.id,-1]));
  const partnerHistory=new Map(),opponentHistory=new Map();
  const results=[],ratingLimit=maxCombinedRating+tolerance;
  for(let round=1;round<=rounds;round++){
    const lineup=[...participants].sort((a,b)=>
      played.get(a.id)-played.get(b.id)||
      lastPlayed.get(a.id)-lastPlayed.get(b.id)||
      compareId(a.id,b.id)
    );
    const candidates=lineup.slice(0,Math.min(lineup.length,courtCount*4));
    const remaining=[...candidates],teams=[];
    while(remaining.length>=2){
      const first=remaining.shift();
      let bestIndex=-1,bestScore=null;
      for(let i=0;i<remaining.length;i++){
        const p=remaining[i];
        if(first.rating+p.rating>ratingLimit+1e-9)continue;
        const score=preference(first,p,partnerHistory);
        if(!bestScore||cmpScore(score,bestScore)<0){bestScore=score;bestIndex=i}
      }
      if(bestIndex>=0){
        const second=remaining.splice(bestIndex,1)[0];
        teams.push({playerIds:[first.id,second.id],combinedRating:+(first.rating+second.rating).toFixed(3)});
      }
    }
    const courts=[],unassignedTeams=[...teams];
    while(unassignedTeams.length>=2&&courts.length<courtCount){
      const a=unassignedTeams.shift();
      let bestIndex=0,bestScore=null;
      for(let i=0;i<unassignedTeams.length;i++){
        const b=unassignedTeams[i];
        let repeatedOpponents=0;
        for(const x of a.playerIds)for(const y of b.playerIds)
          repeatedOpponents+=opponentHistory.get(pairKey(x,y))||0;
        const score=[repeatedOpponents,Math.abs(a.combinedRating-b.combinedRating),b.playerIds.join("|")];
        if(!bestScore||cmpScore(score,bestScore)<0){bestScore=score;bestIndex=i}
      }
      const b=unassignedTeams.splice(bestIndex,1)[0];
      const assigned=[...a.playerIds,...b.playerIds];
      for(const id of assigned){played.set(id,played.get(id)+1);lastPlayed.set(id,round)}
      for(const t of [a,b]){
        const key=pairKey(...t.playerIds);
        partnerHistory.set(key,(partnerHistory.get(key)||0)+1);
      }
      for(const x of a.playerIds)for(const y of b.playerIds){
        const key=pairKey(x,y);
        opponentHistory.set(key,(opponentHistory.get(key)||0)+1);
      }
      courts.push({court:courts.length+1,teamA:a,teamB:b});
    }
    const assignedSet=new Set(courts.flatMap(c=>[...c.teamA.playerIds,...c.teamB.playerIds]));
    results.push({round,courts,waitingIds:participants.filter(p=>!assignedSet.has(p.id)).map(p=>p.id)});
  }
  const gamesByPlayer=participants.map(p=>({playerId:p.id,games:played.get(p.id)}));
  const gameCounts=gamesByPlayer.map(x=>x.games);
  return {
    mode:"rotation-preview",rounds:results,requestedRounds:rounds,courtCount,
    maxCombinedRating,tolerance,
    gamesByPlayer,
    fairGamesSpread:gameCounts.length?Math.max(...gameCounts)-Math.min(...gameCounts):0,
    previewOnly:true
  };
}
