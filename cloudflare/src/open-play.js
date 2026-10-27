import {ok,fail,bodyJson,route,uid,nowIso,audit} from "./util.js";
import {authenticate} from "./auth.js";
import {buildOpenPlayPairs} from "../../shared/open-play.js";

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
    status:row.status,organizerId:row.organizer_user_id,createdAt:row.created_at,
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
export async function handleOpenPlay(request,env){
  const path=new URL(request.url).pathname,method=request.method.toUpperCase();
  if(!path.startsWith("/api/open-play/"))return null;
  const user=await staffUser(request,env);
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
      const b=await bodyJson(request),status=String(b.status||"");
      if(!["open","closed","cancelled"].includes(status))return fail("INVALID_OPEN_PLAY_STATUS",request,env,400);
      if(session.status==="cancelled"&&status!=="cancelled")return fail("OPEN_PLAY_CANCELLED",request,env,409);
      await env.DB.prepare("UPDATE open_play_sessions SET status=?,updated_at=? WHERE id=?").bind(status,nowIso(),m.id).run();
      const updated=serializeSession(await dbOne(env,"SELECT * FROM open_play_sessions WHERE id=?",m.id));
      await audit(env,user,"open_play_session",m.id,"STATUS",serializeSession(session),updated);
      return ok(updated,request,env);
    }
  }
  m=route(path,"/api/open-play/sessions/:id/registrations");
  if(m&&method==="POST"){
    const session=await scopedSession(env,user,m.id);
    if(session.status!=="open")return fail("OPEN_PLAY_NOT_OPEN",request,env,409);
    const b=await bodyJson(request),playerId=String(b.playerId||"").trim();
    if(!playerId||playerId.length>128)return fail("INVALID_PLAYER_ID",request,env,400);
    const p=await dbOne(env,"SELECT id,active FROM players WHERE id=?",playerId);
    if(!p||!p.active)return fail("OPEN_PLAY_PLAYER_NOT_FOUND",request,env,404);
    const existing=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",m.id,playerId);
    if(existing?.status==="registered")return fail("OPEN_PLAY_ALREADY_REGISTERED",request,env,409);
    if(existing?.status==="cancelled"){
      // Rejoin is capacity-guarded in a single statement, just like first registration.
      await env.DB.prepare("UPDATE open_play_registrations SET status='registered',updated_at=? WHERE session_id=? AND player_id=? AND status='cancelled' AND (SELECT COUNT(*) FROM open_play_registrations WHERE session_id=? AND status='registered') < (SELECT max_players FROM open_play_sessions WHERE id=? AND status='open')")
        .bind(nowIso(),m.id,playerId,m.id,m.id).run();
      const joined=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",m.id,playerId);
      if(joined?.status!=="registered")return fail("OPEN_PLAY_FULL_OR_CLOSED",request,env,409);
      await audit(env,user,"open_play_registration",m.id+":"+playerId,"REJOIN",existing,{status:"registered"});
      return ok({sessionId:m.id,playerId,status:"registered"},request,env);
    }
    const ts=nowIso();
    // Single SQLite statement atomically checks the cap and inserts; concurrent requests
    // cannot both pass the capacity check and overbook the same session.
    await env.DB.prepare("INSERT OR IGNORE INTO open_play_registrations(session_id,player_id,registered_by_user_id,status,created_at,updated_at) SELECT ?,?,?,'registered',?,? WHERE (SELECT COUNT(*) FROM open_play_registrations WHERE session_id=? AND status='registered') < (SELECT max_players FROM open_play_sessions WHERE id=? AND status='open')")
      .bind(m.id,playerId,user.id,ts,ts,m.id,m.id).run();
    const inserted=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",m.id,playerId);
    if(!inserted)return fail("OPEN_PLAY_FULL_OR_CLOSED",request,env,409);
    await audit(env,user,"open_play_registration",m.id+":"+playerId,"REGISTER",null,{sessionId:m.id,playerId});
    return ok({sessionId:m.id,playerId,status:inserted.status},request,env,201);
  }
  m=route(path,"/api/open-play/sessions/:id/registrations/:playerId/cancel");
  if(m&&method==="POST"){
    await scopedSession(env,user,m.id);
    const old=await dbOne(env,"SELECT status FROM open_play_registrations WHERE session_id=? AND player_id=?",m.id,m.playerId);
    if(!old)return fail("OPEN_PLAY_REGISTRATION_NOT_FOUND",request,env,404);
    if(old.status!=="cancelled"){
      await env.DB.prepare("UPDATE open_play_registrations SET status='cancelled',updated_at=? WHERE session_id=? AND player_id=?")
        .bind(nowIso(),m.id,m.playerId).run();
      await audit(env,user,"open_play_registration",m.id+":"+m.playerId,"CANCEL",old,{status:"cancelled"});
    }
    return ok({sessionId:m.id,playerId:m.playerId,status:"cancelled"},request,env);
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
