import {bodyJson,uid,nowIso,ok,fail,route,audit} from "./util.js";
import {previewOpenPlayRounds} from "../../shared/open-play-rounds.js";

// Staff-only match-day operations. Never change the tournament matches/score_events tables.
const dbOne=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const dbRows=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
const err=(code,status=400)=>Object.assign(new Error(code),{status});
const changes=r=>Number(r?.meta?.changes??r?.changes??0);
const asInt=(value,min,max,code)=>{
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<min||n>max)throw err(code);
  return n;
};
async function sessionForStaff(env,user,id){
  const session=await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",id);
  if(!session)throw err("OPEN_PLAY_NOT_FOUND",404);
  if(user.role!=="super_admin"&&session.organizer_user_id!==user.id)
    throw err("OPEN_PLAY_FORBIDDEN",403);
  return session;
}
async function loadPlan(env,id){
  const plan=await dbOne(env,"SELECT * FROM open_play_plans WHERE session_id=?",id);
  if(!plan)return null;
  const matches=await dbRows(env,"SELECT * FROM open_play_matches WHERE session_id=? ORDER BY round_no,court_no",id);
  return {
    sessionId:id,roundCount:Number(plan.round_count),courtCount:Number(plan.court_count),
    pointTarget:Number(plan.point_target),winBy:Number(plan.win_by),createdAt:plan.created_at,
    matches:matches.map(m=>({id:m.id,round:m.round_no,court:m.court_no,teamA:JSON.parse(m.team_a_json),
      teamB:JSON.parse(m.team_b_json),scoreA:m.score_a,scoreB:m.score_b,
      status:m.status,version:m.version,completedAt:m.completed_at}))
  };
}
export async function handleOpenPlayGameDay(request,env,user){
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
  let m=route(path,"/api/open-play/sessions/:id/check-in/:playerId");
  if(m&&method==="POST"){
    const session=await sessionForStaff(env,user,m.id);
    if(session.status!=="open")return fail("OPEN_PLAY_NOT_OPEN",request,env,409);
    if(await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",m.id))
      return fail("OPEN_PLAY_ROSTER_LOCKED",request,env,409);
    const registration=await dbOne(env,"SELECT r.status,p.active FROM open_play_registrations r JOIN players p ON p.id=r.player_id WHERE r.session_id=? AND r.player_id=?",m.id,m.playerId);
    if(!registration||registration.status!=="registered"||!registration.active)
      return fail("OPEN_PLAY_PLAYER_NOT_REGISTERED",request,env,404);
    const b=await bodyJson(request);
    if(typeof b.checkedIn!=="boolean")return fail("INVALID_OPEN_PLAY_CHECKIN",request,env,400);
    const before=await dbOne(env,"SELECT checked_in_at FROM open_play_checkins WHERE session_id=? AND player_id=?",m.id,m.playerId);
    if(b.checkedIn){
      await env.DB.prepare("INSERT INTO open_play_checkins(session_id,player_id,checked_in_at,checked_in_by) VALUES(?,?,?,?) ON CONFLICT(session_id,player_id) DO UPDATE SET checked_in_at=excluded.checked_in_at,checked_in_by=excluded.checked_in_by")
        .bind(m.id,m.playerId,nowIso(),user.id).run();
    }else{
      await env.DB.prepare("DELETE FROM open_play_checkins WHERE session_id=? AND player_id=?").bind(m.id,m.playerId).run();
    }
    const result={sessionId:m.id,playerId:m.playerId,checkedIn:b.checkedIn};
    if(Boolean(before)!==b.checkedIn)await audit(env,user,"open_play_checkin",m.id+":"+m.playerId,b.checkedIn?"CHECK_IN":"CHECK_OUT",before,result);
    return ok(result,request,env);
  }
  m=route(path,"/api/open-play/sessions/:id/plan");
  if(m&&method==="GET"){
    await sessionForStaff(env,user,m.id);
    const checkins=await dbRows(env,"SELECT c.player_id AS playerId,c.checked_in_at AS checkedInAt FROM open_play_checkins c JOIN open_play_registrations r ON r.session_id=c.session_id AND r.player_id=c.player_id WHERE c.session_id=? AND r.status='registered' ORDER BY c.checked_in_at,c.player_id",m.id);
    const plan=await loadPlan(env,m.id);
    return ok({sessionId:m.id,checkins,plan},request,env);
  }
  if(m&&method==="POST"){
    const session=await sessionForStaff(env,user,m.id);
    if(session.status!=="open")return fail("OPEN_PLAY_NOT_OPEN",request,env,409);
    if(await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",m.id))
      return fail("OPEN_PLAY_PLAN_EXISTS",request,env,409);
    const b=await bodyJson(request);
    const rounds=asInt(b.rounds??3,1,12,"INVALID_OPEN_PLAY_ROUNDS");
    const courts=asInt(b.courts??1,1,32,"INVALID_OPEN_PLAY_COURT_COUNT");
    const pointTarget=asInt(b.pointTarget??21,11,21,"INVALID_OPEN_PLAY_POINT_TARGET");
    if(![11,15,21].includes(pointTarget))return fail("INVALID_OPEN_PLAY_POINT_TARGET",request,env,400);
    const winBy=asInt(b.winBy??1,1,2,"INVALID_OPEN_PLAY_WIN_BY");
    const players=await dbRows(env,"SELECT p.id,p.rating FROM open_play_checkins c JOIN open_play_registrations r ON r.session_id=c.session_id AND r.player_id=c.player_id JOIN players p ON p.id=c.player_id WHERE c.session_id=? AND r.status='registered' AND p.active=1 ORDER BY p.id",m.id);
    if(players.length<4)return fail("OPEN_PLAY_NEEDS_FOUR_CHECKINS",request,env,422);
    const preview=previewOpenPlayRounds(players,{
      rounds,courtCount:courts,maxCombinedRating:Number(session.max_combined_rating),
      tolerance:Number(session.tolerance)
    });
    const rows=preview.rounds.flatMap(round=>round.courts.map(court=>({round:round.round,...court})));
    if(!rows.length)return fail("OPEN_PLAY_NO_VALID_COURT",request,env,422);
    const ts=nowIso();
    // D1 batch executes transactionally. Unique session/round/court constraints
    // block duplicate confirmations and prevent partial saved schedules.
    const statements=[
      env.DB.prepare("INSERT INTO open_play_plans(session_id,created_at,created_by,round_count,court_count,point_target,win_by) VALUES(?,?,?,?,?,?,?)")
        .bind(m.id,ts,user.id,rounds,courts,pointTarget,winBy),
      // Confirmation closes self-registration and expires pending waiting slots.
      env.DB.prepare("UPDATE open_play_sessions SET self_signup_enabled=0,updated_at=? WHERE id=?")
        .bind(ts,m.id),
      env.DB.prepare("UPDATE open_play_waitlist SET status='cancelled',updated_at=? WHERE session_id=? AND status='waiting'")
        .bind(ts,m.id),
      ...rows.map(row=>env.DB.prepare("INSERT INTO open_play_matches(id,session_id,round_no,court_no,team_a_json,team_b_json,updated_at) VALUES(?,?,?,?,?,?,?)")
        .bind(uid(),m.id,row.round,row.court,JSON.stringify(row.teamA.playerIds),JSON.stringify(row.teamB.playerIds),ts))
    ];
    try{await env.DB.batch(statements)}catch(e){
      if(await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",m.id))
        return fail("OPEN_PLAY_PLAN_EXISTS",request,env,409);
      throw e;
    }
    const saved=await loadPlan(env,m.id);
    await audit(env,user,"open_play_plan",m.id,"CONFIRM",null,{rounds,courts,matchCount:saved.matches.length});
    return ok({plan:saved,previewOnly:false},request,env,201);
  }
  m=route(path,"/api/open-play/sessions/:id/matches/:matchId/score");
  if(m&&method==="PATCH"){
    const session=await sessionForStaff(env,user,m.id);
    if(session.status==="cancelled")return fail("OPEN_PLAY_CANCELLED",request,env,409);
    const old=await dbOne(env,"SELECT * FROM open_play_matches WHERE id=? AND session_id=?",m.matchId,m.id);
    if(!old)return fail("OPEN_PLAY_MATCH_NOT_FOUND",request,env,404);
    if(old.status==="completed")return fail("OPEN_PLAY_MATCH_COMPLETED",request,env,409);
    const plan=await dbOne(env,"SELECT point_target,win_by FROM open_play_plans WHERE session_id=?",m.id);
    if(!plan)return fail("OPEN_PLAY_PLAN_NOT_FOUND",request,env,404);
    const b=await bodyJson(request);
    const version=asInt(b.version,0,2147483647,"INVALID_OPEN_PLAY_SCORE_VERSION");
    const a=asInt(b.scoreA,0,99,"INVALID_OPEN_PLAY_SCORE_A");
    const c=asInt(b.scoreB,0,99,"INVALID_OPEN_PLAY_SCORE_B");
    if(typeof b.finish!=="boolean")return fail("INVALID_OPEN_PLAY_FINISH_FLAG",request,env,400);
    if(b.finish&&(Math.max(a,c)<plan.point_target||Math.abs(a-c)<plan.win_by))
      return fail("OPEN_PLAY_INVALID_FINAL_SCORE",request,env,422);
    if(!b.finish&&(Math.max(a,c)>=plan.point_target&&Math.abs(a-c)>=plan.win_by))
      return fail("OPEN_PLAY_FINAL_SCORE_REQUIRES_FINISH",request,env,422);
    const ts=nowIso();
    const result=await env.DB.prepare("UPDATE open_play_matches SET score_a=?,score_b=?,status=?,version=version+1,completed_at=?,updated_at=? WHERE id=? AND session_id=? AND version=? AND status<>'completed'")
      .bind(a,c,b.finish?"completed":"live",b.finish?ts:null,ts,m.matchId,m.id,version).run();
    if(changes(result)!==1)return fail("OPEN_PLAY_SCORE_VERSION_CONFLICT",request,env,409);
    const next=await dbOne(env,"SELECT * FROM open_play_matches WHERE id=? AND session_id=?",m.matchId,m.id);
    const data={id:next.id,sessionId:m.id,scoreA:next.score_a,scoreB:next.score_b,status:next.status,version:next.version};
    await audit(env,user,"open_play_match",next.id,b.finish?"FINISH":"SCORE",{scoreA:old.score_a,scoreB:old.score_b,version:old.version},data);
    return ok(data,request,env);
  }
  return null;
}
