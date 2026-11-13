// Manual schedule writes must satisfy the same cross-division court and player
// reservations as automatic scheduling. The tournament snapshot is rechecked
// inside the atomic D1 batch, so another organizer cannot invalidate the plan
// between validation and persistence.
import {tournamentStateSql,participantKeys,reservation} from "./court-scheduling.js";

const rows=async (env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const one=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const problem=(code,status)=>Object.assign(new Error(code),{status});
const minutes=value=>Math.max(0,Number.isFinite(Number(value))?Number(value):15);
const slot=value=>Math.max(5,Number.isFinite(Number(value))?Number(value):20);
const minute=60_000;

function overlaps(aStart,aEnd,bStart,bEnd){
  return aStart<bEnd&&bStart<aEnd;
}

export function manualFieldsChanged(before,after){
  if(!before)return true;
  return ["court_id","scheduled_at","team_a_id","team_b_id"].some(key=>after[key]!==before[key]);
}

export async function manualAssignmentGuard(env,tournamentId,divisionId,candidate){
  const state=await one(env,tournamentStateSql,tournamentId);
  if(!state)throw problem("NOT_FOUND",404);
  const division=await one(env,
    "SELECT minimum_rest_minutes,match_slot_minutes FROM divisions WHERE id=? AND tournament_id=?",
    divisionId,tournamentId);
  if(!division)throw problem("NOT_FOUND",404);

  const planned=candidate.scheduled_at;
  const start=planned===null||planned===undefined||planned===""?null:Date.parse(planned);
  if(start!==null&&!Number.isFinite(start))throw problem("INVALID_SCHEDULE_TIME",400);
  if(start!==null&&!["cancelled","walkover","completed"].includes(candidate.status)){
    const duration=slot(division.match_slot_minutes)*minute;
    const end=start+duration;
    const requiredRest=minutes(division.minimum_rest_minutes)*minute;
    const matches=await rows(env,
      "SELECT m.*,d.minimum_rest_minutes,d.match_slot_minutes FROM matches m JOIN divisions d ON d.id=m.division_id WHERE d.tournament_id=? AND m.id<>?",
      tournamentId,candidate.id);
    const members=await rows(env,
      "SELECT tp.team_id,tp.player_id FROM team_players tp JOIN teams t ON t.id=tp.team_id JOIN divisions d ON d.id=t.division_id WHERE d.tournament_id=?",
      tournamentId);
    const roster=new Map();
    for(const item of members){
      const list=roster.get(item.team_id)||[];
      list.push(item.player_id);
      roster.set(item.team_id,list);
    }
    const keys=new Set(participantKeys(candidate,roster));
    const now=Date.now();
    for(const other of matches){
      const booked=reservation(other,now);
      if(!booked)continue;
      if(candidate.court_id&&candidate.court_id===other.court_id&&overlaps(start,end,booked.start,booked.end)){
        throw problem("COURT_SCHEDULE_CONFLICT",409);
      }
      if(keys.size&&participantKeys(other,roster).some(key=>keys.has(key))){
        const gap=Math.max(requiredRest,booked.rest);
        if(overlaps(start-gap,end+gap,booked.start,booked.end)){
          throw problem("PLAYER_SCHEDULE_CONFLICT",409);
        }
      }
    }
  }

  // No schema migration: reuse the existing signed division guard for an
  // atomic tournament-wide snapshot assertion, then remove it in that batch.
  const before=env.DB.prepare(
    "INSERT INTO division_draw_reset_guards(division_id,expected_signature) VALUES(?, CASE WHEN ? IS ("+
      tournamentStateSql+
    ") THEN (SELECT signature FROM division_draw_reset_state WHERE division_id=?) ELSE 'COURT_SCHEDULE_CONFLICT' END)"
  ).bind(divisionId,state.signature,tournamentId,divisionId);
  const after=env.DB.prepare("DELETE FROM division_draw_reset_guards WHERE division_id=?").bind(divisionId);
  return {before,after};
}
