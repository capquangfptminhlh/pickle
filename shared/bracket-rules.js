const flag=(value,fallback)=>value===undefined||value===null?Boolean(fallback):[true,1,'1','true','on'].includes(value);
const fail=code=>{throw Object.assign(new Error(code),{status:400})};

// One qualification contract for the Worker and PostgreSQL implementations.
export function divisionBracketRules(body={},before={}){
  const format=String(body.format??before.format??'pool_to_knockout');
  const advanceCount=Number(body.advanceCount??before.advance_count??before.advanceCount??2);
  const thirdPlaceMatch=flag(body.thirdPlaceMatch,before.third_place_match??before.thirdPlaceMatch??false);
  const seriesBEnabled=flag(body.seriesBEnabled,before.series_b_enabled??before.seriesBEnabled??false);
  const seriesBThirdPlaceMatch=flag(body.seriesBThirdPlaceMatch,before.series_b_third_place_match??before.seriesBThirdPlaceMatch??false);
  if(seriesBEnabled){
    if(format!=='pool_to_knockout')fail('SERIES_B_REQUIRES_POOL_FORMAT');
    if(!Number.isInteger(advanceCount)||advanceCount<1||advanceCount>=3)fail('SERIES_B_ADVANCE_COUNT_OVERLAP');
  }
  return {format,advanceCount,thirdPlaceMatch,seriesBEnabled,seriesBThirdPlaceMatch};
}

export function bracketRulesChanged(before,next){
  const prior=divisionBracketRules({},before);
  return Object.keys(prior).some(key=>prior[key]!==next[key]);
}
