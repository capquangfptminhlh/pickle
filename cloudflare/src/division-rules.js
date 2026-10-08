import {validateMatchFormat} from "../../shared/scoring-rules.js";

const flag=(value,fallback)=>value===undefined||value===null?fallback:(value===true||value===1||value==="1"||value==="true"||value==="on")?1:0;

// Merges a create/patch body over the stored division row and validates the
// resulting match format. Throws a 400 error code the client can show.
export function divisionMatchRules(b,before={}){
  const pick=(key,column,fallback)=>b[key]!==undefined?b[key]:(before[column]??fallback);
  const rules={
    bestOf:Number(pick("bestOf","best_of",3)),
    pointsToWin:Number(pick("pointsToWin","points_to_win",11)),
    relaySegmentPoints:Number(pick("relaySegmentPoints","relay_segment_points",0)),
    relayTeamSize:Number(pick("relayTeamSize","relay_team_size",0)),
    finalPointOnServe:flag(b.finalPointOnServe,Number(before.final_point_on_serve||0)),
    thirdPlaceMatch:flag(b.thirdPlaceMatch,Number(before.third_place_match||0))
  };
  // A relay is one running game: its target is always points per leg × legs,
  // so the server derives it instead of trusting a separately typed total.
  if(rules.relaySegmentPoints>0){
    if(!rules.relayTeamSize)rules.relayTeamSize=3;
    rules.pointsToWin=rules.relaySegmentPoints*rules.relayTeamSize;
    if(b.bestOf===undefined)rules.bestOf=1;
  }else rules.relayTeamSize=0;
  const error=validateMatchFormat(rules);
  if(error)throw Object.assign(new Error(error),{status:400});
  return rules;
}
