const score=value=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=32767;

export function validateSet(a,b,target=11,winByTwo=true){
  if(!score(a)||!score(b)||!Number.isSafeInteger(target)||target<1)return false;
  const high=Math.max(a,b),low=Math.min(a,b);
  if(a===b||high<target)return false;
  // A game stops the moment it is won: exactly at the target, or beyond it
  // only out of a win-by-two deuce, which ends exactly two points clear.
  // So 15-10 or 12-9 to 11 (and 22-20 to 21 without win-by-two) are typos.
  if(!winByTwo)return high===target;
  return high===target?high-low>=2:high-low===2;
}

// A series must stop as soon as either side wins the configured majority.
// Partial series are useful while recording sets; completion routes requireComplete.
export function validateSeries(sets,bestOf=3,target=11,winByTwo=true,{requireComplete=true}={}){
  let winsA=0,winsB=0,winner=null;
  const needed=Math.floor(bestOf/2)+1;
  const result=(valid,error=null)=>({valid,error,winner,winsA,winsB,needed});
  if(!Number.isSafeInteger(bestOf)||bestOf<1||bestOf%2!==1||!Array.isArray(sets))return result(false,"INVALID_SERIES");
  if(sets.length>bestOf)return result(false,"TOO_MANY_SETS");
  for(const set of sets){
    if(winner)return result(false,"EXTRA_SET_AFTER_WINNER");
    if(!Array.isArray(set)||set.length!==2||!validateSet(set[0],set[1],target,winByTwo))return result(false,"INVALID_SET_SCORE");
    if(set[0]>set[1])winsA++;else winsB++;
    if(winsA>=needed)winner="A";else if(winsB>=needed)winner="B";
  }
  if(requireComplete&&!winner)return result(false,"MATCH_NOT_FINISHED");
  return result(true);
}

// Returns an error code for an impossible match format, or null when playable.
// A relay ("chạy điểm") is one running game, so it cannot be split into a series.
export function validateMatchFormat({bestOf,pointsToWin,relaySegmentPoints=0,relayTeamSize=0}){
  if(![1,3,5].includes(bestOf))return "INVALID_BEST_OF";
  if(!Number.isSafeInteger(pointsToWin)||pointsToWin<1||pointsToWin>99)return "INVALID_POINTS_TO_WIN";
  if(!Number.isSafeInteger(relaySegmentPoints)||relaySegmentPoints<0||relaySegmentPoints>99)return "INVALID_RELAY_SEGMENT";
  if(!relaySegmentPoints)return null;
  if(!RELAY_TEAM_SIZES.includes(relayTeamSize))return "INVALID_RELAY_TEAM_SIZE";
  if(relaySegmentPoints*relayTeamSize!==pointsToWin)return "INVALID_RELAY_SEGMENT";
  if(bestOf!==1)return "RELAY_REQUIRES_SINGLE_GAME";
  return null;
}

// USA Pickleball: two timeouts per game to 11, three for games to 15 or 21
// (a 27-point relay game is played under the longer-game allowance).
export function timeoutsPerGame(pointsToWin){
  return Number(pointsToWin)>=15?3:2;
}

// Relay teams rotate pairs cyclically so everyone plays two legs:
// 3 players AB, BC, CA; 4 players AB, BC, CD, DA. Leg count equals team size.
export const RELAY_TEAM_SIZES=[3,4];
export function relayPairs(teamSize){
  const letters="ABCD".slice(0,teamSize);
  return [...letters].map((x,i)=>x+letters[(i+1)%teamSize]);
}

// Which relay leg is on court: AB plays until the leader reaches one segment,
// BC until two segments, and so on. null when the format has no relay.
export function relayLeg(a,b,segmentPoints,target){
  if(!segmentPoints||segmentPoints<1||!target)return null;
  const count=Math.ceil(target/segmentPoints);
  const index=Math.min(count-1,Math.floor(Math.max(Number(a)||0,Number(b)||0)/segmentPoints));
  return {index,count,until:Math.min(target,(index+1)*segmentPoints)};
}
