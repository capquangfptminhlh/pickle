/* Standard PickleUp tournament rules, opt-in for pre-existing live divisions.
   Pool / quarterfinal / semifinal: one game to 11, no win-by-two.
   Championship final: either best-of-three to 11 or one game to 15. */
import {validateSeries,validateSet} from "./scoring-rules.js";

export const FINAL_FORMATS=["best3_11","single_15"];
export function isChampionshipFinal(stage){
  const value=String(stage||"").normalize("NFC").trim().toLowerCase();
  return value.startsWith("chung kết")&&!value.startsWith("chung kết nhánh thắng")&&!value.startsWith("chung kết nhánh thua");
}
export function stageScoringRules(division,match,{enabled,finalFormat}={}){
  const isEnabled=enabled===undefined?Boolean(Number(division?.stage_rules_enabled||0)):Boolean(enabled);
  const fallback={
    best_of:Number(division?.best_of??3),
    points_to_win:Number(division?.points_to_win??11),
    win_by_two:Number(division?.win_by_two??1)
  };
  if(!isEnabled||Number(division?.relay_segment_points||0)>0||String(division?.event_type||"")==="team")return fallback;
  if(isChampionshipFinal(match?.stage)){
    const type=finalFormat||division?.final_format||"single_15";
    return type==="best3_11"?{best_of:3,points_to_win:11,win_by_two:0}:{best_of:1,points_to_win:15,win_by_two:0};
  }
  return {best_of:1,points_to_win:11,win_by_two:0};
}
export function inspectExistingMatch(match,sets,division,finalFormat){
  const rules=stageScoringRules(division,match,{enabled:true,finalFormat});
  const label=match?.stage||"Vòng bảng",id=match?.id||"";
  const issue=(reason)=>({matchId:id,stage:label,reason});
  const scores=sets.map(s=>Array.isArray(s)?s:[Number(s.score_a),Number(s.score_b)]);
  const done=match.status==="completed"||Boolean(match.winner_team_id);
  const special=Boolean(match.result_reason)||match.status==="walkover";
  if(special&&!scores.length)return null;
  const series=validateSeries(scores,rules.best_of,rules.points_to_win,Boolean(rules.win_by_two),{requireComplete:done});
  if(!series.valid)return issue(series.error);
  if(done){
    if(!series.winner)return issue("MATCH_RESULT_INCOMPLETE");
    if(match.winner_team_id&&(series.winner==="A"?match.team_a_id:match.team_b_id)!==match.winner_team_id)return issue("WINNER_CONFLICT");
  }else if(series.winner)return issue("FINISHED_SET_NOT_CLOSED");
  const a=Number(match.current_score_a||0),b=Number(match.current_score_b||0);
  if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||a>rules.points_to_win||b>rules.points_to_win)return issue("LIVE_SCORE_OUTSIDE_RULES");
  if(a===rules.points_to_win&&b===rules.points_to_win)return issue("LIVE_SCORE_TIE_AT_TARGET");
  if(done&&(a||b))return issue("COMPLETED_MATCH_HAS_CURRENT_SCORE");
  return null;
}
