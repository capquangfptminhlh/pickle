import {nowIso,audit} from "./util.js";

const problem=(code,status=400)=>Object.assign(new Error(code),{status});
const dbOne=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const dbRows=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];

export async function addOpenPlayWaitlist(env,user,sessionId,playerId){
  const id=String(playerId||"").trim();
  if(!id||id.length>128)throw problem("INVALID_PLAYER_ID");
  const session=await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",sessionId);
  if(!session||session.status!=="open"||await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",sessionId))
    throw problem("OPEN_PLAY_WAITLIST_UNAVAILABLE",409);
  const player=await dbOne(env,"SELECT id,active FROM players WHERE id=?",id);
  if(!player||!player.active)throw problem("OPEN_PLAY_PLAYER_NOT_FOUND",404);
  const active=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",sessionId,id);
  if(active?.status==="registered")throw problem("OPEN_PLAY_ALREADY_REGISTERED",409);
  const existing=await dbOne(env,"SELECT status FROM open_play_waitlist WHERE session_id=? AND player_id=?",sessionId,id);
  if(existing?.status==="waiting")throw problem("OPEN_PLAY_ALREADY_WAITLISTED",409);
  const ts=nowIso();
  // This guarded upsert is single-statement atomic: the queue is offered only
  // when the active roster is actually full and no official plan exists.
  const result=await env.DB.prepare(`
    INSERT INTO open_play_waitlist(session_id,player_id,requested_by_user_id,status,created_at,updated_at)
    SELECT ?,?,?,'waiting',?,? WHERE
      (SELECT status FROM open_play_sessions WHERE id=?)='open'
      AND NOT EXISTS(SELECT 1 FROM open_play_plans WHERE session_id=?)
      AND (SELECT COUNT(*) FROM open_play_registrations WHERE session_id=? AND status='registered')
          >= (SELECT max_players FROM open_play_sessions WHERE id=?)
      AND NOT EXISTS(SELECT 1 FROM open_play_registrations WHERE session_id=? AND player_id=? AND status='registered')
    ON CONFLICT(session_id,player_id) DO UPDATE SET
      requested_by_user_id=excluded.requested_by_user_id,
      status='waiting',
      created_at=excluded.created_at,
      updated_at=excluded.updated_at
    WHERE open_play_waitlist.status<>'waiting'
  `).bind(sessionId,id,user.id,ts,ts,sessionId,sessionId,sessionId,sessionId,sessionId,id).run();
  if(Number(result?.meta?.changes??result?.changes??0)!==1)throw problem("OPEN_PLAY_WAITLIST_REQUIRES_FULL_SESSION",409);
  const position=await dbOne(env,`SELECT COUNT(*) AS n FROM open_play_waitlist
    WHERE session_id=? AND status='waiting' AND (created_at<? OR (created_at=? AND player_id<=?))`,sessionId,ts,ts,id);
  await audit(env,user,"open_play_waitlist",sessionId+":"+id,"QUEUE",existing,{status:"waiting"});
  return {sessionId,playerId:id,status:"waiting",position:Number(position?.n||1)};
}

export async function cancelOpenPlayWaitlist(env,user,sessionId,playerId){
  const old=await dbOne(env,"SELECT status FROM open_play_waitlist WHERE session_id=? AND player_id=?",sessionId,playerId);
  if(!old)throw problem("OPEN_PLAY_WAITLIST_NOT_FOUND",404);
  if(old.status==="promoted")throw problem("OPEN_PLAY_WAITLIST_ALREADY_PROMOTED",409);
  if(old.status==="waiting"){
    const result=await env.DB.prepare("UPDATE open_play_waitlist SET status='cancelled',updated_at=? WHERE session_id=? AND player_id=? AND status='waiting'")
      .bind(nowIso(),sessionId,playerId).run();
    if(Number(result?.meta?.changes??result?.changes??0)!==1)throw problem("OPEN_PLAY_WAITLIST_STATE_CHANGED",409);
    await audit(env,user,"open_play_waitlist",sessionId+":"+playerId,"LEAVE_QUEUE",old,{status:"cancelled"});
  }
  return {sessionId,playerId,status:"cancelled"};
}

// D1 batch is a transaction. Cancellation, promotion and status update must
// be indivisible so a concurrent join cannot steal the newly opened slot.
export async function cancelOpenPlayRegistrationAndPromote(env,user,sessionId,playerId,action="CANCEL"){
  const before=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",sessionId,playerId);
  if(!before)throw problem("OPEN_PLAY_REGISTRATION_NOT_FOUND",404);
  if(before.status==="cancelled")return {sessionId,playerId,status:"cancelled",promotedPlayerIds:[]};
  const locked=await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",sessionId);
  if(locked)throw problem("OPEN_PLAY_ROSTER_LOCKED",409);
  const ts=nowIso();
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE open_play_registrations SET status='cancelled',updated_at=? WHERE session_id=? AND player_id=? AND status='registered' AND NOT EXISTS(SELECT 1 FROM open_play_plans WHERE session_id=?)")
      .bind(ts,sessionId,playerId,sessionId),
    env.DB.prepare(`INSERT INTO open_play_registrations(session_id,player_id,registered_by_user_id,status,created_at,updated_at)
      SELECT q.session_id,q.player_id,q.requested_by_user_id,'registered',?,?
      FROM open_play_waitlist q
      JOIN players p ON p.id=q.player_id AND p.active=1
      JOIN open_play_sessions s ON s.id=q.session_id AND s.status='open'
      WHERE q.session_id=? AND q.status='waiting'
        AND NOT EXISTS(SELECT 1 FROM open_play_plans WHERE session_id=q.session_id)
        AND NOT EXISTS(SELECT 1 FROM open_play_registrations r WHERE r.session_id=q.session_id AND r.player_id=q.player_id AND r.status='registered')
        AND (SELECT COUNT(*) FROM open_play_registrations r WHERE r.session_id=q.session_id AND r.status='registered')<s.max_players
      ORDER BY q.created_at,q.player_id LIMIT 1
      ON CONFLICT(session_id,player_id) DO UPDATE SET
        status='registered',registered_by_user_id=excluded.registered_by_user_id,updated_at=excluded.updated_at
      WHERE open_play_registrations.status='cancelled'`).bind(ts,ts,sessionId),
    env.DB.prepare(`UPDATE open_play_waitlist SET status='promoted',updated_at=?
      WHERE session_id=? AND status='waiting'
      AND EXISTS(SELECT 1 FROM open_play_registrations r WHERE r.session_id=open_play_waitlist.session_id
                 AND r.player_id=open_play_waitlist.player_id AND r.status='registered')`)
      .bind(ts,sessionId)
  ]);
  if(Number(results?.[0]?.meta?.changes??results?.[0]?.changes??0)!==1)
    throw problem("OPEN_PLAY_ROSTER_LOCKED_OR_CHANGED",409);
  const promoted=await dbRows(env,"SELECT player_id AS id FROM open_play_waitlist WHERE session_id=? AND status='promoted' AND updated_at=? ORDER BY player_id",sessionId,ts);
  const promotedPlayerIds=promoted.map(p=>p.id);
  await audit(env,user,"open_play_registration",sessionId+":"+playerId,action,before,{status:"cancelled",promotedPlayerIds});
  for(const id of promotedPlayerIds)
    await audit(env,user,"open_play_waitlist",sessionId+":"+id,"AUTO_PROMOTE",{status:"waiting"},{status:"promoted"});
  return {sessionId,playerId,status:"cancelled",promotedPlayerIds};
}
