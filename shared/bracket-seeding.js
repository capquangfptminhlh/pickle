export function nextPowerOfTwo(count){let size=1;while(size<count)size*=2;return size}
export function bracketSeedOrder(size){
  if(size===1)return [1];
  let order=[1,2];
  for(let width=4;width<=size;width*=2){const next=[];for(const seed of order)next.push(seed,width+1-seed);order=next}
  return order;
}

// Keep each pool's top two in opposite bracket halves for an exact power-of-two
// field. Rank-three Serie B passes single_elimination and keeps ordinary seeds.
export function singleEliminationSlots(division,teams){
  const size=nextPowerOfTwo(teams.length),count=Number(division.advance_count??division.advanceCount??2);
  const group=team=>team.group||team.group_code||'A';
  const groups=[...new Set(teams.map(group))].sort();
  const protectedField=division.format==='pool_to_knockout'&&count===2&&size===teams.length&&groups.length>=2&&groups.length*2===teams.length;
  if(protectedField){
    const first=groups.map(g=>teams.find(t=>group(t)===g&&Number(t.groupRank||t.standingRank)===1));
    const second=groups.map(g=>teams.find(t=>group(t)===g&&Number(t.groupRank||t.standingRank)===2));
    if(first.every(Boolean)&&second.every(Boolean)){
      const slots=[];for(let i=0;i<groups.length;i++)slots.push(first[i].id,second[groups.length-1-i].id);
      return {size,slots,protectedSameGroupUntilFinal:true};
    }
  }
  const order=bracketSeedOrder(size),slots=Array(size).fill(null);
  teams.forEach((team,index)=>{const position=order.indexOf(index+1);if(position>=0)slots[position]=team.id});
  return {size,slots,protectedSameGroupUntilFinal:false};
}
