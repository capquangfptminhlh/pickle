import {ok,fail,bodyJson,route,uid,nowIso,audit} from "./util.js";
import {authenticate} from "./auth.js";
import {buildOpenPlayPairs} from "../../shared/open-play.js";
import {previewOpenPlayRounds} from "../../shared/open-play-rounds.js";
import {handleOpenPlayGameDay} from "./open-play-day.js";
import {addOpenPlayWaitlist,cancelOpenPlayWaitlist,cancelOpenPlayRegistrationAndPromote} from "./open-play-waitlist.js";

const STAFF=new Set(["super_admin","organizer","club_manager"]);
const problem=(code,status=400)=>Object.assign(new Error(code),{status});
const dbOne=(env,sql,...args)=>env.DB.prepare(sql).bind(...args).first();
const dbRows=async(env,sql,...args)=>(await env.DB.prepare(sql).bind(...args).all()).results||[];
async function staffUser(request,env){
  const user=await authenticate(request,env);
  if(!user)throw problem("AUTH_REQUIRED",401);
  if(!STAFF.has(user.role))throw problem("OPEN_PLAY_FORBIDDEN",403);
  return user;
}
function serializeSession(row){
  return {id:row.id,title:row.title,clubId:row.club_id||null,startsAt:row.starts_at,
    courtLabel:row.court_label||"",maxPlayers:Number(row.max_players),
    maxCombinedRating:Number(row.max_combined_rating),tolerance:Number(row.tolerance),
    status:row.status,selfSignupEnabled:Boolean(row.self_signup_enabled),organizerId:row.organizer_user_id,createdAt:row.created_at,
    updatedAt:row.updated_at};
}
async function scopedSession(env,user,id){
  const row=await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",id);
  if(!row)throw problem("OPEN_PLAY_NOT_FOUND",404);
  if(user.role!=="super_admin"&&row.organizer_user_id!==user.id)
    throw problem("OPEN_PLAY_FORBIDDEN",403);
  return row;
}
function parseNewSession(b){
  const title=String(b.title||"").trim(),startsAt=String(b.startsAt||"");
  const dt=Date.parse(startsAt),count=Number(b.maxPlayers??16);
  const cap=Number(b.maxCombinedRating??5.2),tol=Number(b.tolerance??0);
  const courtLabel=String(b.courtLabel||"").trim(),clubId=String(b.clubId||"").trim()||null;
  if(!title||title.length>120)throw problem("INVALID_OPEN_PLAY_TITLE");
  if(!Number.isFinite(dt)||!/^\d{4}-\d{2}-\d{2}T/.test(startsAt))throw problem("INVALID_OPEN_PLAY_TIME");
  if(!Number.isSafeInteger(count)||count<2||count>256)throw problem("INVALID_OPEN_PLAY_CAPACITY");
  if(!Number.isFinite(cap)||cap<2||cap>16||!Number.isFinite(tol)||tol<0||tol>0.5)
    throw problem("INVALID_OPEN_PLAY_RATING_LIMIT");
  if(courtLabel.length>100)throw problem("INVALID_OPEN_PLAY_COURT");
  return {title,startsAt:new Date(dt).toISOString(),maxPlayers:count,maxCombinedRating:cap,tolerance:tol,courtLabel,clubId};
}
async function roster(env,id){
  return dbRows(env,"SELECT r.player_id AS id,p.full_name AS name,p.rating AS rating,r.status,r.created_at AS registeredAt FROM open_play_registrations r JOIN players p ON p.id=r.player_id WHERE r.session_id=? ORDER BY r.created_at,r.player_id",id);
}
async function registerPlayer(env,user,session,playerId){
  if(session.status!=="open")throw problem("OPEN_PLAY_NOT_OPEN",409);
  if(await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",session.id))throw problem("OPEN_PLAY_ROSTER_LOCKED",409);
  const id=String(playerId||"").trim();
  if(!id||id.length>128)throw problem("INVALID_PLAYER_ID");
  const player=await dbOne(env,"SELECT id,active FROM players WHERE id=?",id);
  if(!player||!player.active)throw problem("OPEN_PLAY_PLAYER_NOT_FOUND",404);
  const existing=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",session.id,id);
  if(existing?.status==="registered")throw problem("OPEN_PLAY_ALREADY_REGISTERED",409);
  const ts=nowIso();
  if(existing?.status==="cancelled"){
    await env.DB.prepare("UPDATE open_play_registrations SET status='registered',updated_at=? WHERE session_id=? AND player_id=? AND status='cancelled' AND (SELECT COUNT(*) FROM open_play_registrations WHERE session_id=? AND status='registered') < (SELECT max_players FROM open_play_sessions WHERE id=? AND status='open')")
      .bind(ts,session.id,id,session.id,session.id).run();
  }else{
    await env.DB.prepare("INSERT OR IGNORE INTO open_play_registrations(session_id,player_id,registered_by_user_id,status,created_at,updated_at) SELECT ?,?,?,'registered',?,? WHERE (SELECT COUNT(*) FROM open_play_registrations WHERE session_id=? AND status='registered') < (SELECT max_players FROM open_play_sessions WHERE id=? AND status='open')")
      .bind(session.id,id,user.id,ts,ts,session.id,session.id).run();
  }
  const joined=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",session.id,id);
  if(joined?.status!=="registered")throw problem("OPEN_PLAY_FULL_OR_CLOSED",409);
  await audit(env,user,"open_play_registration",session.id+":"+id,existing?"REJOIN":"REGISTER",existing,{status:"registered"});
  return {sessionId:session.id,playerId:id,status:"registered",rejoined:existing?.status==="cancelled"};
}
export async function handleOpenPlay(request,env){
  const path=new URL(request.url).pathname,method=request.method.toUpperCase();
  if(!path.startsWith("/api/open-play/"))return null;
  if(path==="/api/open-play/me/matches"&&method==="GET"){
    const member=await authenticate(request,env);
    if(!member)throw problem("AUTH_REQUIRED",401);
    const own=await dbRows(env,"SELECT id FROM players WHERE user_id=? ORDER BY id LIMIT 20",member.id);
    if(!own.length)return ok([],request,env);
    const ownedIds=new Set(own.map(p=>p.id));
    const rows=await dbRows(env,"SELECT m.*,s.title,s.starts_at AS startsAt,p.point_target AS pointTarget FROM open_play_matches m JOIN open_play_plans p ON p.session_id=m.session_id JOIN open_play_sessions s ON s.id=m.session_id WHERE m.session_id IN (SELECT r.session_id FROM open_play_registrations r JOIN players pl ON pl.id=r.player_id WHERE pl.user_id=?) ORDER BY s.starts_at DESC,m.round_no,m.court_no LIMIT 1000",member.id);
    const visible=[];
    for(const row of rows){
      const a=JSON.parse(row.team_a_json),b=JSON.parse(row.team_b_json);
      const mineA=a.some(id=>ownedIds.has(id)),mineB=b.some(id=>ownedIds.has(id));
      if(!mineA&&!mineB)continue;
      visible.push({id:row.id,sessionId:row.session_id,title:row.title,startsAt:row.startsAt,
        round:row.round_no,court:row.court_no,teamA:a,teamB:b,
        myTeam:mineA?"A":"B",scoreA:row.score_a,scoreB:row.score_b,
        status:row.status,pointTarget:row.pointTarget,version:row.version});
      if(visible.length>=100)break;
    }
    return ok(visible,request,env);
  }
  if(path==="/api/open-play/me"&&method==="GET"){
    const member=await authenticate(request,env);
    if(!member)throw problem("AUTH_REQUIRED",401);
    const players=await dbRows(env,"SELECT id,full_name AS name,rating FROM players WHERE user_id=? AND active=1 ORDER BY full_name,id LIMIT 20",member.id);
    const registrations=await dbRows(env,"SELECT r.session_id AS sessionId,r.player_id AS playerId,r.status,s.title,s.starts_at AS startsAt FROM open_play_registrations r JOIN players p ON p.id=r.player_id JOIN open_play_sessions s ON s.id=r.session_id WHERE p.user_id=? ORDER BY s.starts_at DESC LIMIT 100",member.id);
    const waitlist=await dbRows(env,`SELECT w.session_id AS sessionId,w.player_id AS playerId,w.status,
      s.title,s.starts_at AS startsAt,w.created_at AS requestedAt,
      (SELECT COUNT(*) FROM open_play_waitlist q WHERE q.session_id=w.session_id AND q.status='waiting'
       AND (q.created_at<w.created_at OR (q.created_at=w.created_at AND q.player_id<=w.player_id))) AS position
      FROM open_play_waitlist w JOIN players p ON p.id=w.player_id
      JOIN open_play_sessions s ON s.id=w.session_id
      WHERE p.user_id=? AND w.status='waiting' ORDER BY w.created_at DESC LIMIT 100`,member.id);
    return ok({players,registrations,waitlist},request,env);
  }
  if(path==="/api/open-play/public/sessions"&&method==="GET"){
    const sessions=await dbRows(env,`SELECT s.id,s.title,s.club_id,s.starts_at,s.court_label,s.max_players,s.max_combined_rating,s.tolerance,
      (SELECT COUNT(*) FROM open_play_registrations r WHERE r.session_id=s.id AND r.status='registered') AS registeredCount,
      (SELECT COUNT(*) FROM open_play_waitlist w WHERE w.session_id=s.id AND w.status='waiting') AS waitingCount
      FROM open_play_sessions s WHERE s.status='open' AND s.self_signup_enabled=1 AND s.starts_at>=?
      ORDER BY s.starts_at LIMIT 100`,nowIso());
    return ok(sessions.map(row=>({id:row.id,title:row.title,clubId:row.club_id||null,startsAt:row.starts_at,courtLabel:row.court_label||"",maxPlayers:Number(row.max_players),maxCombinedRating:Number(row.max_combined_rating),tolerance:Number(row.tolerance),registeredCount:Number(row.registeredCount),waitingCount:Number(row.waitingCount)})),request,env);
  }
  const join=route(path,"/api/open-play/sessions/:id/join");
  if(join&&method==="POST"){
    const member=await authenticate(request,env);
    if(!member)throw problem("AUTH_REQUIRED",401);
    const session=await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",join.id);
    if(!session||session.status!=="open"||!session.self_signup_enabled)throw problem("OPEN_PLAY_NOT_OPEN",409);
    const b=await bodyJson(request);
    const playerId=String(b.playerId||"").trim();
    if(!playerId)return fail("PLAYER_ID_REQUIRED",request,env,400);
    const owned=await dbOne(env,"SELECT id FROM players WHERE id=? AND user_id=? AND active=1",playerId,member.id);
    if(!owned)return fail("OPEN_PLAY_PLAYER_OWNERSHIP_REQUIRED",request,env,403);
    const joined=await registerPlayer(env,member,session,playerId);
    return ok(joined,request,env,joined.rejoined?200:201);
  }
  const joinQueue=route(path,"/api/open-play/sessions/:id/waitlist/join");
  if(joinQueue&&method==="POST"){
    const member=await authenticate(request,env);
    if(!member)throw problem("AUTH_REQUIRED",401);
    const session=await dbOne(env,"SELECT id,self_signup_enabled FROM open_play_sessions WHERE id=?",joinQueue.id);
    if(!session||!session.self_signup_enabled)return fail("OPEN_PLAY_WAITLIST_UNAVAILABLE",request,env,409);
    const b=await bodyJson(request),playerId=String(b.playerId||"").trim();
    if(!playerId)return fail("PLAYER_ID_REQUIRED",request,env,400);
    const owned=await dbOne(env,"SELECT id FROM players WHERE id=? AND user_id=? AND active=1",playerId,member.id);
    if(!owned)return fail("OPEN_PLAY_PLAYER_OWNERSHIP_REQUIRED",request,env,403);
    const queued=await addOpenPlayWaitlist(env,member,joinQueue.id,playerId);
    return ok(queued,request,env,201);
  }
  const leaveQueue=route(path,"/api/open-play/sessions/:id/waitlist/self-cancel");
  if(leaveQueue&&method==="POST"){
    const member=await authenticate(request,env);
    if(!member)throw problem("AUTH_REQUIRED",401);
    const b=await bodyJson(request),playerId=String(b.playerId||"").trim();
    const owned=await dbOne(env,"SELECT id FROM players WHERE id=? AND user_id=?",playerId,member.id);
    if(!owned)return fail("OPEN_PLAY_PLAYER_OWNERSHIP_REQUIRED",request,env,403);
    const cancelled=await cancelOpenPlayWaitlist(env,member,leaveQueue.id,playerId);
    return ok(cancelled,request,env);
  }
  const cancelSelf=route(path,"/api/open-play/sessions/:id/self-cancel");
  if(cancelSelf&&method==="POST"){
    const member=await authenticate(request,env);
    if(!member)throw problem("AUTH_REQUIRED",401);
    const b=await bodyJson(request),playerId=String(b.playerId||"").trim();
    if(!playerId)return fail("PLAYER_ID_REQUIRED",request,env,400);
    const owned=await dbOne(env,"SELECT id FROM players WHERE id=? AND user_id=?",playerId,member.id);
    if(!owned)return fail("OPEN_PLAY_PLAYER_OWNERSHIP_REQUIRED",request,env,403);
    if(await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",cancelSelf.id))return fail("OPEN_PLAY_ROSTER_LOCKED",request,env,409);
    const cancelled=await cancelOpenPlayRegistrationAndPromote(env,member,cancelSelf.id,playerId,"SELF_CANCEL");
    return ok(cancelled,request,env);
  }
  const user=await staffUser(request,env);
  const gameDay=await handleOpenPlayGameDay(request,env,user);
  if(gameDay)return gameDay;
  let q=route(path,"/api/open-play/sessions/:id/waitlist");
  if(q&&method==="GET"){
    await scopedSession(env,user,q.id);
    const queue=await dbRows(env,`SELECT w.player_id AS playerId,p.full_name AS name,p.rating,
      w.status,w.created_at AS requestedAt FROM open_play_waitlist w
      JOIN players p ON p.id=w.player_id WHERE w.session_id=? AND w.status='waiting'
      ORDER BY w.created_at,w.player_id LIMIT 256`,q.id);
    return ok(queue.map((p,index)=>({...p,position:index+1})),request,env);
  }
  if(q&&method==="POST"){
    await scopedSession(env,user,q.id);
    const b=await bodyJson(request);
    return ok(await addOpenPlayWaitlist(env,user,q.id,b.playerId),request,env,201);
  }
  q=route(path,"/api/open-play/sessions/:id/waitlist/:playerId/cancel");
  if(q&&method==="POST"){
    await scopedSession(env,user,q.id);
    return ok(await cancelOpenPlayWaitlist(env,user,q.id,q.playerId),request,env);
  }
  if(path==="/api/open-play/sessions"&&method==="GET"){
    const data=user.role==="super_admin"
      ?await dbRows(env,"SELECT * FROM open_play_sessions ORDER BY starts_at DESC LIMIT 100")
      :await dbRows(env,"SELECT * FROM open_play_sessions WHERE organizer_user_id=? ORDER BY starts_at DESC LIMIT 100",user.id);
    return ok(data.map(serializeSession),request,env);
  }
  if(path==="/api/open-play/sessions"&&method==="POST"){
    const b=parseNewSession(await bodyJson(request));
    if(user.role==="club_manager"&&(!user.clubId||!b.clubId||user.clubId!==b.clubId))
      return fail("OPEN_PLAY_CLUB_SCOPE_FORBIDDEN",request,env,403);
    if(b.clubId){
      const club=await dbOne(env,"SELECT id FROM clubs WHERE id=? AND active=1",b.clubId);
      if(!club)return fail("OPEN_PLAY_CLUB_NOT_FOUND",request,env,404);
    }
    const id=uid(),ts=nowIso();
    await env.DB.prepare("INSERT INTO open_play_sessions(id,title,organizer_user_id,club_id,starts_at,court_label,max_players,max_combined_rating,tolerance,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'open',?,?)")
      .bind(id,b.title,user.id,b.clubId,b.startsAt,b.courtLabel,b.maxPlayers,b.maxCombinedRating,b.tolerance,ts,ts).run();
    const saved=serializeSession(await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",id));
    await audit(env,user,"open_play_session",id,"CREATE",null,saved);
    return ok(saved,request,env,201);
  }
  let m=route(path,"/api/open-play/sessions/:id");
  if(m){
    const session=await scopedSession(env,user,m.id);
    if(method==="GET"){
      const players=await roster(env,m.id);
      return ok({session:serializeSession(session),registrations:players},request,env);
    }
    if(method==="PATCH"){
      const b=await bodyJson(request),status=String(b.status??session.status);
      if(!["open","closed","cancelled"].includes(status))return fail("INVALID_OPEN_PLAY_STATUS",request,env,400);
      if(session.status==="cancelled"&&status!=="cancelled")return fail("OPEN_PLAY_CANCELLED",request,env,409);
      if(status==="closed"&&await dbOne(env,"SELECT id FROM open_play_matches WHERE session_id=? AND status<>\'completed\' LIMIT 1",m.id))return fail("OPEN_PLAY_UNFINISHED_MATCHES",request,env,409);
      const selfSignup=b.selfSignupEnabled===undefined?(status==="open"&&Boolean(session.self_signup_enabled)):b.selfSignupEnabled;
      if(typeof selfSignup!=="boolean")return fail("INVALID_OPEN_PLAY_SELF_SIGNUP",request,env,400);
      if(status!=="open"&&selfSignup)return fail("OPEN_PLAY_NOT_OPEN",request,env,409);
      await env.DB.prepare("UPDATE open_play_sessions SET status=?,self_signup_enabled=?,updated_at=? WHERE id=?").bind(status,selfSignup?1:0,nowIso(),m.id).run();
      const updated=serializeSession(await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",m.id));
      await audit(env,user,"open_play_session",m.id,"STATUS",serializeSession(session),updated);
      return ok(updated,request,env);
    }
  }
  m=route(path,"/api/open-play/sessions/:id/registrations");
  if(m&&method==="POST"){
    const session=await scopedSession(env,user,m.id),b=await bodyJson(request);
    const registered=await registerPlayer(env,user,session,b.playerId);
    return ok(registered,request,env,registered.rejoined?200:201);
  }
  m=route(path,"/api/open-play/sessions/:id/registrations/:playerId/cancel");
  if(m&&method==="POST"){
    await scopedSession(env,user,m.id);
    if(await dbOne(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",m.id))return fail("OPEN_PLAY_ROSTER_LOCKED",request,env,409);
    const cancelled=await cancelOpenPlayRegistrationAndPromote(env,user,m.id,m.playerId);
    return ok(cancelled,request,env);
  }
  m=route(path,"/api/open-play/sessions/:id/rounds/preview");
  if(m&&method==="GET"){
    const session=await scopedSession(env,user,m.id);
    const players=await dbRows(env,"SELECT p.id,p.rating FROM open_play_registrations r JOIN players p ON p.id=r.player_id WHERE r.session_id=? AND r.status='registered' AND p.active=1",m.id);
    const params=new URL(request.url).searchParams;
    try{
      const result=previewOpenPlayRounds(players,{
        rounds:params.get("rounds")??3,courtCount:params.get("courts")??1,
        maxCombinedRating:Number(session.max_combined_rating),
        tolerance:Number(session.tolerance)
      });
      // No round, court booking, opponent, referee or score is persisted.
      return ok({sessionId:m.id,...result},request,env);
    }catch(e){
      return fail(e.message||"OPEN_PLAY_ROUND_PREVIEW_FAILED",request,env,422);
    }
  }
  m=route(path,"/api/open-play/sessions/:id/pairs");
  if(m&&method==="GET"){
    const session=await scopedSession(env,user,m.id);
    const players=await dbRows(env,"SELECT p.id,p.rating FROM open_play_registrations r JOIN players p ON p.id=r.player_id WHERE r.session_id=? AND r.status='registered' AND p.active=1",m.id);
    try{
      const result=buildOpenPlayPairs(players,{maxCombinedRating:Number(session.max_combined_rating),tolerance:Number(session.tolerance)});
      return ok({sessionId:m.id,...result},request,env);
    }catch(e){return fail(e.message||"OPEN_PLAY_PAIRING_FAILED",request,env,422)}
  }
  return fail("NOT_FOUND",request,env,404);
}
