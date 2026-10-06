const score=value=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0&&value<=32767;

export function validateSet(a,b,target=11,winByTwo=true){
  if(!score(a)||!score(b)||!Number.isSafeInteger(target)||target<1)return false;
  const high=Math.max(a,b),low=Math.min(a,b);
  return a!==b&&high>=target&&(!winByTwo||high-low>=2);
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
