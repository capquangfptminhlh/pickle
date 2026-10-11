import {validateMatchFormat} from "../../shared/scoring-rules.js";
import {divisionBracketRules,bracketRulesChanged} from "../../shared/bracket-rules.js";
export {divisionBracketRules};

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
    winByTwo:flag(b.winByTwo,before.win_by_two===undefined?1:Number(before.win_by_two)),
    finalPointOnServe:flag(b.finalPointOnServe,Number(before.final_point_on_serve||0)),
    thirdPlaceMatch:flag(b.thirdPlaceMatch,Number(before.third_place_match||0))
  };
  // A relay is one running game: its target is always points per leg × legs,
  // so the server derives it instead of trusting a separately typed total.
  if(rules.relaySegmentPoints>0){
    if(!rules.relayTeamSize)rules.relayTeamSize=3;
    rules.pointsToWin=rules.relaySegmentPoints*rules.relayTeamSize;
    if(b.bestOf===undefined)rules.bestOf=1;
    // A running score ends exactly at the target; there is no deuce.
    rules.winByTwo=0;
  }else rules.relayTeamSize=0;
  const error=validateMatchFormat(rules);
  if(error)throw Object.assign(new Error(error),{status:400});
  return rules;
}

// Scoring rules that decide who wins a rally, a game or a match. Changing any
// of them after play starts would rejudge live and finished matches (e.g. a
// 15-10 relay at 27 instantly "won" if the target drops to 11).
const SCORING_COLUMNS=[["bestOf","best_of"],["pointsToWin","points_to_win"],["winByTwo","win_by_two"],["scoringMode","scoring_mode"],["relaySegmentPoints","relay_segment_points"],["relayTeamSize","relay_team_size"],["finalPointOnServe","final_point_on_serve"]];
export async function assertScoringRulesEditable(env,divisionId,before,next){
  const changed=SCORING_COLUMNS.some(([key,column])=>String(next[key])!==String(before[column]??""));
  if(!changed)return;
  const started=await env.DB.prepare("SELECT 1 AS x FROM matches WHERE division_id=? AND (started_at IS NOT NULL OR status IN ('live','completed','walkover') OR winner_team_id IS NOT NULL OR current_score_a>0 OR current_score_b>0) LIMIT 1").bind(divisionId).first();
  if(started)throw Object.assign(new Error("RULES_LOCKED_AFTER_START"),{status:409});
}

export async function assertBracketRulesEditable(env,divisionId,before,next){
  if(!bracketRulesChanged(before,next))return;
  const bracket=await env.DB.prepare("SELECT 1 AS x FROM matches WHERE division_id=? AND bracket_slot IS NOT NULL LIMIT 1").bind(divisionId).first();
  if(bracket)throw Object.assign(new Error("BRACKET_SETTINGS_LOCKED"),{status:409});
}
