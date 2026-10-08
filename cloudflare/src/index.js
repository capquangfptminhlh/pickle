import {corsHeaders,ok,fail,bodyJson,route,uid,slugify,nowIso,audit,safeJsonParse,publicUser} from "./util.js";
import {authenticate,ensureBootstrapAdmin,hashPassword,verifyPassword,signSession,requireRole,canManageTournament,tournamentForDivision,tournamentForTeam,tournamentForCourt,canEditPlayer} from "./auth.js";
import {loadState,loadAdminState,listPublicPlayers,loadPublicPlayer} from "./state.js";
import {TournamentRoom,broadcast} from "./realtime.js";
import {handleOperations} from "./operations.js";
import {handleScoring} from "./scoring.js";
import {divisionMatchRules} from "./division-rules.js";
import {playerCountRange,validatePlayerIds,registryNameKey} from "../../shared/team-player-selection.js";

export {TournamentRoom};

async function userRequired(request,env){
  const user=await authenticate(request,env);
  if(!user)throw Object.assign(new Error("AUTH_REQUIRED"),{status:401});
  return user;
}
function httpError(code,status=400){return Object.assign(new Error(code),{status})}
function asBool(v){return v===true||v===1||v==="1"||v==="true"}
const SKILL_LEVELS=["A+","A","B+","B","C+","C"];
const SKILL_WEIGHT={"A+":6,"A":5,"B+":4,"B":3,"C+":2,"C":1};
function skillLevel(v,fallback="B"){
  const s=String(v||"").trim().toUpperCase();
  return SKILL_LEVELS.includes(s)?s:fallback;
}
function shuffleCrypto(items){
  const out=[...items];
  for(let i=out.length-1;i>0;i--){const r=new Uint32Array(1);crypto.getRandomValues(r);const j=Math.floor((r[0]/4294967296)*(i+1));[out[i],out[j]]=[out[j],out[i]]}
  return out;
}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""))&&String(v||"").length<=254}
function accountUser(row){
  return {...publicUser(row),display_name:row.display_name,tournament_id_scope:row.tournament_id_scope||null,
    club_id:row.club_id||null,tournament_name:row.tournament_name||null,club_name:row.club_name||null};
}
function accountAudit(env,user,id,action,before,after,reason=null){
  return env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,'user',?,?,?,?,?)")
    .bind(user.id,id,action,before?JSON.stringify(accountUser(before)):null,JSON.stringify(accountUser(after)),reason);
}
async function rows(env,sql,...args){const r=await env.DB.prepare(sql).bind(...args).all();return r.results||[]}
async function one(env,sql,...args){return env.DB.prepare(sql).bind(...args).first()}
async function assertTournament(env,user,id){
  if(!(await canManageTournament(env,user,id)))throw httpError("TOURNAMENT_SCOPE_FORBIDDEN",403);
}
async function assertDivision(env,user,id){
  const tid=await tournamentForDivision(env,id);if(!tid)throw httpError("NOT_FOUND",404);
  await assertTournament(env,user,tid);return tid;
}
async function assertTeam(env,user,id){
  const tid=await tournamentForTeam(env,id);if(!tid)throw httpError("NOT_FOUND",404);
  await assertTournament(env,user,tid);return tid;
}
async function assertCourt(env,user,id){
  const tid=await tournamentForCourt(env,id);if(!tid)throw httpError("NOT_FOUND",404);
  await assertTournament(env,user,tid);return tid;
}
async function getMatch(env,id){
  return one(env,
    "SELECT m.*,d.tournament_id,d.best_of,d.points_to_win,d.win_by_two FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.id=?",id
  );
}
async function authorizeMatch(env,user,m){
  if(!m)return false;
  if(user.role==="super_admin")return true;
  if(user.role==="organizer")return canManageTournament(env,user,m.tournament_id);
  if(user.role==="referee")return m.referee_user_id===user.id&&(!user.tournamentScope||user.tournamentScope===m.tournament_id);
  return false;
}
async function matchJson(env,id){
  const m=await getMatch(env,id);if(!m)return null;
  const sets=await rows(env,"SELECT score_a,score_b FROM match_sets WHERE match_id=? ORDER BY set_no",id);
  return {
    id:m.id,divisionId:m.division_id,stage:m.stage,a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",
    courtId:m.court_id||null,refereeId:m.referee_user_id||null,status:["scheduled","ready"].includes(m.status)?"wait":m.status==="completed"?"done":m.status,
    current:[Number(m.current_score_a||0),Number(m.current_score_b||0)],
    sets:sets.map(s=>[Number(s.score_a||0),Number(s.score_b||0)]),
    winner:m.winner_team_id||null,version:Number(m.version||1),bracketSlot:m.bracket_slot||null,
    resultReason:m.result_reason||null,resultNote:m.result_note||null,
    courtState:m.status==="completed"?"done":(m.court_state||"scheduled"),servingSide:m.serving_side||null,serverNumber:Number(m.server_number||2),
    timeouts:{A:Number(m.timeout_a||0),B:Number(m.timeout_b||0)},medicalTimeouts:{A:Number(m.medical_timeout_a||0),B:Number(m.medical_timeout_b||0)},
    calledAt:m.called_at||null,onDeckAt:m.on_deck_at||null,warmupAt:m.warmup_at||null
  };
}
async function matchHasHistory(env,m){
  return Boolean(m.started_at||["live","completed","walkover"].includes(m.status)||m.winner_team_id||m.current_score_a||m.current_score_b||
    await one(env,"SELECT id FROM score_events WHERE match_id=? LIMIT 1",m.id)||await one(env,"SELECT id FROM match_sets WHERE match_id=? LIMIT 1",m.id));
}
async function validateMatchAssignment(env,user,divisionId,tournamentId,b,m=null){
  const a=b.teamAId===undefined?m?.team_a_id:b.teamAId,bb=b.teamBId===undefined?m?.team_b_id:b.teamBId;
  const changed=m&&(a!==m.team_a_id||bb!==m.team_b_id);
  if(changed&&await matchHasHistory(env,m))throw httpError("MATCH_ROSTER_LOCKED",409);
  if(a&&bb&&a===bb)throw httpError("INVALID_TEAMS");
  for(const [id,previous] of [[a,m?.team_a_id],[bb,m?.team_b_id]]){
    if(id&&(!m||id!==previous)&&!(await one(env,"SELECT id FROM teams WHERE id=? AND division_id=? AND status='active'",id,divisionId)))throw httpError("INVALID_TEAMS");
  }
  if(b.courtId&&(!m||b.courtId!==m.court_id)&&!(await one(env,"SELECT id FROM courts WHERE id=? AND tournament_id=? AND active=1",b.courtId,tournamentId)))throw httpError("INVALID_COURT_SCOPE");
  if(b.refereeUserId&&(!m||b.refereeUserId!==m.referee_user_id)){
    const ref=await one(env,"SELECT role,active,tournament_id_scope FROM app_users WHERE id=?",b.refereeUserId);
    if(!ref||ref.role!=="referee"||!ref.active||(user.role==="organizer"?ref.tournament_id_scope!==tournamentId:(ref.tournament_id_scope&&ref.tournament_id_scope!==tournamentId)))throw httpError("INVALID_REFEREE_SCOPE");
  }
  if(m&&b.expectedVersion!==undefined&&Number(b.expectedVersion)!==Number(m.version))throw httpError("VERSION_CONFLICT",409);
  return {a:a||null,b:bb||null};
}
function matchAudit(env,user,m,action,after){
  return env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) VALUES(?,'match',?,?,?,?)")
    .bind(user.id,m.id,action,JSON.stringify(m),after?JSON.stringify(after):null);
}
async function emitUpdate(env,tournamentId,matchId=null){
  if(!env?.ROOMS)return;
  try{
    await broadcast(env,"public:state",{tournamentId},"public");
    if(matchId)await broadcast(env,"match:update",{id:matchId,tournamentId},"public");
    if(tournamentId){
      await broadcast(env,"public:state",{tournamentId},tournamentId);
      if(matchId)await broadcast(env,"match:update",{id:matchId,tournamentId},tournamentId);
    }
  }catch(error){console.error("REALTIME_EMIT_FAILED",error)}
}
async function saveR2Upload(request,env,folder,maxBytes,allowed,ownerUserId=null){
  const form=await request.formData();
  const file=[...form.values()].find(v=>typeof v==="object"&&v&&typeof v.arrayBuffer==="function");
  if(!file)throw httpError("FILE_REQUIRED",400);
  if(Number(file.size||0)>maxBytes)throw httpError("FILE_TOO_LARGE",413);
  const type=String(file.type||"application/octet-stream");
  if(!allowed.includes(type))throw httpError("INVALID_FILE_TYPE",400);
  const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"}[type]||"bin";
  const key=folder+"/"+uid()+"."+ext;
  await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:type},customMetadata:{originalName:String(file.name||""),...(ownerUserId?{ownerUserId}:{})}});
  const origin=new URL(request.url).origin;
  return {key,url:origin+"/api/media/"+encodeURIComponent(key)};
}
async function createAudit(env,user,type,id,action,before,after,reason){
  try{await audit(env,user,type,id,action,before,after,reason)}catch{}
}
async function nextUniqueSlug(env,table,name){
  const base=slugify(name);let candidate=base;
  for(let i=1;i<1000;i++){
    const found=await one(env,"SELECT id FROM "+table+" WHERE slug=? LIMIT 1",candidate);
    if(!found)return candidate;
    candidate=base+"-"+(i+1);
  }
  return base+"-"+Date.now();
}
async function requireAdminRole(user,...roles){
  if(!requireRole(user,...roles))throw httpError("FORBIDDEN",403);
}
async function teamClub(env,body,statements){
  if(body.clubId){
    const club=await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",body.clubId);
    if(!club)throw httpError("INVALID_CLUB");
    return club.id;
  }
  const name=String(body.club||"").normalize("NFC").trim();
  if(!name||registryNameKey(name)===registryNameKey("Tự do"))return null;
  const existing=(await rows(env,"SELECT id,name FROM clubs WHERE active=1")).find(club=>registryNameKey(club.name)===registryNameKey(name));
  if(existing)return existing.id;
  const id=uid(),at=nowIso();
  statements.push(env.DB.prepare("INSERT INTO clubs(id,name,slug,active,created_at,updated_at) VALUES(?,?,?,1,?,?)").bind(id,name,slugify(name)+"-"+id,at,at));
  return id;
}
function rosterAudit(env,user,id,before,after){
  return env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason) VALUES(?,'team',?,'UPDATE_TEAM',?,?,?)")
    .bind(user.id,id,JSON.stringify(before),JSON.stringify(after),"Cập nhật đội / cặp");
}
async function validateDivisionRoster(env,divisionId,playerIds,{currentTeamId=null}={}){
  const d=await one(env,"SELECT id,event_type FROM divisions WHERE id=?",divisionId);
  if(!d)throw httpError("DIVISION_NOT_FOUND",404);
  let ids;
  try{ids=validatePlayerIds(d.event_type,playerIds)}catch(error){throw httpError(error.message,400)}
  const players=[];
  for(const id of ids){
    const p=await one(env,"SELECT * FROM players WHERE id=?",id);
    if(!p)throw httpError("PLAYER_NOT_FOUND",404);
    if(!p.active)throw httpError("PLAYER_INACTIVE",400);
    const duplicate=await one(env,
      "SELECT t.id FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE tp.player_id=? AND t.division_id=? AND t.status<>'withdrawn' AND (? IS NULL OR t.id<>?) LIMIT 1",
      id,divisionId,currentTeamId,currentTeamId
    );
    if(duplicate)throw httpError("PLAYER_ALREADY_IN_DIVISION",409);
    players.push(p);
  }
  return {division:d,players,ids};
}
async function handleApi(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();

  if(method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});
  const score=await handleScoring(request,env);
  if(score)return score;
  const extra=await handleOperations(request,env);
  if(extra)return extra;
  if(path==="/api/health"&&method==="GET"){
    const probe=await one(env,"SELECT 1 AS ok");
    return ok({ok:Boolean(probe?.ok),service:"pickleup-api",storage:"D1",realtime:"Durable Objects",time:nowIso()},request,env);
  }
  if(path==="/api/realtime"&&method==="GET"){
    const room=url.searchParams.get("room")||"public";
    return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
  }
  if(path.startsWith("/api/media/")&&method==="GET"){
    const key=decodeURIComponent(path.slice("/api/media/".length));
    const privateReceipt=key.startsWith("receipts/");
    let user=null,linked=[];
    if(privateReceipt){
      user=await userRequired(request,env);
      if(!requireRole(user,"super_admin","organizer","finance"))return fail("FORBIDDEN",request,env,403);
      const candidates=await rows(env,"SELECT p.receipt_url,d.tournament_id,t.club_id FROM payment_records p JOIN registrations r ON r.id=p.registration_id JOIN divisions d ON d.id=r.division_id LEFT JOIN teams t ON t.id=r.team_id WHERE p.receipt_url IS NOT NULL");
      linked=candidates.filter(r=>{try{return decodeURIComponent(new URL(r.receipt_url,request.url).pathname)==="/api/media/"+key}catch{return false}});
      if(linked.length&&user.role!=="super_admin"){
        const allowed=await Promise.all(linked.map(r=>user.role==="organizer"?canManageTournament(env,user,r.tournament_id):(!user.clubId||user.clubId===r.club_id)));
        if(!allowed.every(Boolean))return fail("FORBIDDEN",request,env,403);
      }
    }
    const object=await env.MEDIA.get(key);
    if(!object)return fail("NOT_FOUND",request,env,404);
    if(privateReceipt&&!linked.length&&user.role!=="super_admin"&&object.customMetadata?.ownerUserId!==user.id)return fail("FORBIDDEN",request,env,403);
    const headers=new Headers(corsHeaders(request,env));
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control",privateReceipt?"private, no-store":"public, max-age=31536000, immutable");
    headers.set("ETag",object.httpEtag);
    return new Response(object.body,{headers});
  }

  if(path==="/api/auth/login"&&method==="POST"){
    await ensureBootstrapAdmin(env);
    const b=await bodyJson(request),email=String(b.email||"").trim().toLowerCase(),password=String(b.password||"");
    const row=await one(env,"SELECT * FROM app_users WHERE email=?",email);
    if(!row||!row.active||!(await verifyPassword(password,row.password_hash)))return fail("INVALID_CREDENTIALS",request,env,401);
    const token=await signSession(env,row);
    return ok({token,user:publicUser(row)},request,env);
  }
  if(path==="/api/auth/logout"&&method==="POST")return ok({ok:true},request,env);
  if(path==="/api/auth/session"&&method==="GET"){
    const user=await authenticate(request,env);return ok({user},request,env);
  }
  if(path==="/api/auth/me"&&method==="GET"){
    const user=await userRequired(request,env);return ok({user},request,env);
  }
  if(path==="/api/auth/change-password"&&method==="POST"){
    const user=await userRequired(request,env),b=await bodyJson(request);
    const current=String(b.currentPassword||""),next=String(b.newPassword||"");
    if(next.length<12||next.length>128)return fail("WEAK_PASSWORD",request,env,400);
    const row=await one(env,"SELECT * FROM app_users WHERE id=?",user.id);
    if(!row||!(await verifyPassword(current,row.password_hash)))return fail("INVALID_CURRENT_PASSWORD",request,env,400);
    const hash=await hashPassword(next);
    await env.DB.prepare("UPDATE app_users SET password_hash=?,auth_version=auth_version+1,updated_at=? WHERE id=?").bind(hash,nowIso(),user.id).run();
    return ok({ok:true},request,env);
  }

  if(path==="/api/public/state"&&method==="GET")return ok(await loadState(env,{publicOnly:true}),request,env);
  if(path==="/api/public/players"&&method==="GET")return ok(await listPublicPlayers(env),request,env);
  let p=route(path,"/api/public/players/:id");
  if(p&&method==="GET"){
    const data=await loadPublicPlayer(env,p.id);return data?ok(data,request,env):fail("NOT_FOUND",request,env,404);
  }
  if(path==="/api/public/clubs"&&method==="GET"){
    const data=await rows(env,"SELECT id,name,slug,city,active FROM clubs WHERE active=1 ORDER BY name");
    return ok(data.map(x=>({...x,active:Boolean(x.active)})),request,env);
  }
  if(path==="/api/public/posts"&&method==="GET"){
    return ok(await rows(env,"SELECT * FROM content_posts WHERE status='published' ORDER BY published_at DESC,created_at DESC"),request,env);
  }
  if(path==="/api/public/sponsors"&&method==="GET"){
    return ok(await rows(env,"SELECT s.* FROM sponsors s LEFT JOIN tournaments t ON t.id=s.tournament_id WHERE s.tournament_id IS NULL OR t.public_visible=1 ORDER BY s.sort_order,s.name"),request,env);
  }
  if(path==="/api/public/branding"&&method==="GET"){
    const row=await one(env,"SELECT value FROM app_settings WHERE key='branding'");
    return ok(safeJsonParse(row?.value,{}),request,env);
  }

  if(path==="/api/admin/state"&&method==="GET"){
    const user=await userRequired(request,env);return ok(await loadAdminState(env,user),request,env);
  }

  if(path==="/api/players"&&method==="GET"){
    const user=await userRequired(request,env);
    await requireAdminRole(user,"super_admin","organizer","referee","club_manager");
    let data=await rows(env,"SELECT p.*,c.name AS club_name FROM players p LEFT JOIN clubs c ON c.id=p.club_id ORDER BY p.full_name");
    if(user.role==="referee"){
      const ids=new Set((await loadAdminState(env,user)).players.map(x=>x.id));
      data=data.filter(x=>ids.has(x.id));
    }else if(user.role==="club_manager"){
      if(!user.clubId)return fail("CLUB_SCOPE_REQUIRED",request,env,403);
      data=data.filter(x=>x.club_id===user.clubId);
    }
    return ok(data.map(x=>({
      ...x,
      phone:user.role==="referee"?"":x.phone,
      active:Boolean(x.active),rating:Number(x.rating||0),skillLevel:skillLevel(x.skill_level)
    })),request,env);
  }
  if(path==="/api/players"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer","club_manager");
    const b=await bodyJson(request),fullName=String(b.fullName||"").trim();
    if(!fullName)return fail("NAME_REQUIRED",request,env,400);
    const clubId=user.role==="club_manager"?user.clubId:(b.clubId||user.clubId||null);
    if(user.role==="club_manager"&&!clubId)return fail("CLUB_SCOPE_REQUIRED",request,env,403);
    if(clubId&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))return fail("INVALID_CLUB",request,env,400);
    const gender=String(b.gender||"other");if(!["male","female","other"].includes(gender))return fail("INVALID_GENDER",request,env,400);
    const rating=user.role==="club_manager"?3:(b.rating===undefined?3:Number(b.rating));if(!Number.isFinite(rating)||rating<0)return fail("INVALID_RATING",request,env,400);
    const id=uid(),level=skillLevel(b.skillLevel||b.skill_level);
    await env.DB.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,nickname,gender,rating,skill_level,phone,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)")
      .bind(id,clubId,user.id,fullName,String(b.nickname||""),gender,rating,level,String(b.phone||""),nowIso(),nowIso()).run();
    const row=await one(env,"SELECT * FROM players WHERE id=?",id);await createAudit(env,user,"player",id,"CREATE",null,row);
    return ok(row,request,env,201);
  }
  p=route(path,"/api/players/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env);
    if(!(await canEditPlayer(env,user,p.id)))return fail("FORBIDDEN",request,env,403);
    const before=await one(env,"SELECT * FROM players WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    const b=await bodyJson(request);
    const referee=user.role==="referee";
    const clubManager=user.role==="club_manager";
    const canCorrectRating=["super_admin","organizer"].includes(user.role);
    const fullName=String(b.fullName??before.full_name).trim();
    if(!fullName)return fail("NAME_REQUIRED",request,env,400);
    const nickname=String(b.nickname??before.nickname??"").trim();
    const gender=b.gender==null?String(before.gender||"other"):String(b.gender);
    if(!["male","female","other"].includes(gender))return fail("INVALID_GENDER",request,env,400);
    const requestedClub=b.clubId===undefined?before.club_id:(b.clubId||null);
    const clubId=(referee||clubManager)?before.club_id:requestedClub;
    if(clubId&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))return fail("INVALID_CLUB",request,env,400);
    const phone=referee?before.phone:String(b.phone??before.phone??"").trim();
    const active=referee?before.active:(b.active===undefined?before.active:(asBool(b.active)?1:0));
    const oldRating=Number(before.rating||0);
    const rating=canCorrectRating&&b.rating!==undefined?Number(b.rating):oldRating;
    const level=canCorrectRating&&b.skillLevel!==undefined?skillLevel(b.skillLevel,""):skillLevel(before.skill_level);
    if(!Number.isFinite(rating)||rating<0)return fail("INVALID_RATING",request,env,400);
    if(!level)return fail("INVALID_SKILL_LEVEL",request,env,400);
    const ratingChanged=Math.abs(rating-oldRating)>1e-9;
    const ratingReason=String(b.ratingReason||"").trim();
    if(ratingChanged&&!ratingReason)return fail("RATING_REASON_REQUIRED",request,env,400);
    const changedAt=nowIso();
    const statements=[env.DB.prepare(
      "UPDATE players SET club_id=?,full_name=?,nickname=?,gender=?,rating=?,skill_level=?,phone=?,active=?,updated_at=? WHERE id=?"
    ).bind(clubId,fullName,nickname,gender,rating,level,phone,active,changedAt,p.id)];
    if(ratingChanged)statements.push(env.DB.prepare(
      "INSERT INTO rating_history(id,player_id,before_rating,delta,after_rating,reason,created_at) VALUES(?,?,?,?,?,?,?)"
    ).bind(uid(),p.id,oldRating,rating-oldRating,rating,ratingReason,changedAt));
    await env.DB.batch(statements);
    const after=await one(env,"SELECT * FROM players WHERE id=?",p.id);await createAudit(env,user,"player",p.id,"UPDATE",before,after);
    return ok({...after,ratingHistoryRecorded:ratingChanged},request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env);if(!(await canEditPlayer(env,user,p.id))||user.role==="referee")return fail("FORBIDDEN",request,env,403);
    const before=await one(env,"SELECT * FROM players WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    await env.DB.prepare("UPDATE players SET active=0,updated_at=? WHERE id=?").bind(nowIso(),p.id).run();
    await createAudit(env,user,"player",p.id,"DEACTIVATE",before,{...before,active:0});
    return ok({ok:true},request,env);
  }
  p=route(path,"/api/players/:id/avatar");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);if(!(await canEditPlayer(env,user,p.id)))return fail("FORBIDDEN",request,env,403);
    const player=await one(env,"SELECT id FROM players WHERE id=?",p.id);if(!player)return fail("NOT_FOUND",request,env,404);
    const up=await saveR2Upload(request,env,"avatars",3*1024*1024,["image/jpeg","image/png","image/webp"]);
    await env.DB.prepare("UPDATE players SET avatar_url=?,updated_at=? WHERE id=?").bind(up.url,nowIso(),p.id).run();
    return ok({ok:true,url:up.url,avatarUrl:up.url},request,env);
  }
  if(path==="/api/uploads/image"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer","club_manager");
    return ok(await saveR2Upload(request,env,"media",6*1024*1024,["image/jpeg","image/png","image/webp"]),request,env,201);
  }
  if(path==="/api/uploads/receipt"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer","finance");
    return ok(await saveR2Upload(request,env,"receipts",8*1024*1024,["image/jpeg","image/png","image/webp","application/pdf"],user.id),request,env,201);
  }

  if(path==="/api/tournaments"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const status=String(b.status||"draft");if(!["draft","registration","live","completed","cancelled"].includes(status))return fail("INVALID_STATUS",request,env,400);
    const id=uid(),slug=await nextUniqueSlug(env,"tournaments",name),created=nowIso();
    await env.DB.prepare("INSERT INTO tournaments(id,owner_user_id,name,slug,venue_name,start_at,end_at,status,public_visible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,user.id,name,slug,String(b.venue||b.venueName||""),b.startAt||null,b.endAt||null,status,asBool(b.publicVisible)?1:0,created,created).run();
    const divId=uid();
    await env.DB.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)")
      .bind(divId,id,String(b.divisionName||"Nội dung chính"),b.eventType||"doubles",b.format||"pool_to_knockout",3,11,1,2,created).run();
    const row=await one(env,"SELECT * FROM tournaments WHERE id=?",id);await createAudit(env,user,"tournament",id,"CREATE",null,row);await emitUpdate(env,id);
    return ok(row,request,env,201);
  }
  p=route(path,"/api/tournaments/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env);await assertTournament(env,user,p.id);
    const before=await one(env,"SELECT * FROM tournaments WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    const b=await bodyJson(request),status=b.status===undefined?before.status:String(b.status);
    if(!["draft","registration","live","completed","cancelled"].includes(status))return fail("INVALID_STATUS",request,env,400);
    await env.DB.prepare("UPDATE tournaments SET name=?,venue_name=?,start_at=?,end_at=?,status=?,public_visible=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),String(b.venue??b.venueName??before.venue_name??""),b.startAt??before.start_at,b.endAt??before.end_at,status,b.publicVisible===undefined?before.public_visible:(asBool(b.publicVisible)?1:0),nowIso(),p.id).run();
    const after=await one(env,"SELECT * FROM tournaments WHERE id=?",p.id);await createAudit(env,user,"tournament",p.id,"UPDATE",before,after);await emitUpdate(env,p.id);
    return ok(after,request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env);await assertTournament(env,user,p.id);
    const before=await one(env,"SELECT * FROM tournaments WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    await env.DB.prepare("DELETE FROM tournaments WHERE id=?").bind(p.id).run();await createAudit(env,user,"tournament",p.id,"DELETE",before,null);await emitUpdate(env,p.id);
    return ok({ok:true},request,env);
  }

  p=route(path,"/api/tournaments/:id/divisions");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await assertTournament(env,user,p.id);
    const b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const eventType=String(b.eventType||"doubles"),format=String(b.format||"pool_to_knockout");
    if(!["singles","doubles","mixed_doubles","team"].includes(eventType))return fail("INVALID_EVENT_TYPE",request,env,400);
    if(!["round_robin","pool_to_knockout","single_elimination","double_elimination"].includes(format))return fail("INVALID_FORMAT",request,env,400);
    const rules=divisionMatchRules(b),id=uid();
    await env.DB.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count,tie_break_mode,scoring_mode,minimum_rest_minutes,match_slot_minutes,relay_segment_points,relay_team_size,final_point_on_serve,third_place_match,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)")
      .bind(id,p.id,name,eventType,format,rules.bestOf,rules.pointsToWin,asBool(b.winByTwo??true)?1:0,Number(b.advanceCount||2),"head_to_head",["side_out","rally"].includes(String(b.scoringMode))?String(b.scoringMode):"side_out",Math.max(0,Number(b.minimumRestMinutes??15)),Math.max(5,Number(b.matchSlotMinutes??20)),rules.relaySegmentPoints,rules.relayTeamSize,rules.finalPointOnServe,rules.thirdPlaceMatch,nowIso()).run();
    const row=await one(env,"SELECT * FROM divisions WHERE id=?",id);await createAudit(env,user,"division",id,"CREATE",null,row);await emitUpdate(env,p.id);
    return ok(row,request,env,201);
  }
  p=route(path,"/api/divisions/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),before=await one(env,"SELECT * FROM divisions WHERE id=?",p.id),b=await bodyJson(request);
    const eventType=String(b.eventType??before.event_type),format=String(b.format??before.format);
    if(!["singles","doubles","mixed_doubles","team"].includes(eventType))return fail("INVALID_EVENT_TYPE",request,env,400);
    if(!["round_robin","pool_to_knockout","single_elimination","double_elimination"].includes(format))return fail("INVALID_FORMAT",request,env,400);
    const rules=divisionMatchRules(b,before);
    await env.DB.prepare("UPDATE divisions SET name=?,event_type=?,format=?,best_of=?,points_to_win=?,win_by_two=?,advance_count=?,tie_break_mode=?,scoring_mode=?,minimum_rest_minutes=?,match_slot_minutes=?,relay_segment_points=?,relay_team_size=?,final_point_on_serve=?,third_place_match=?,active=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),eventType,format,rules.bestOf,rules.pointsToWin,b.winByTwo===undefined?before.win_by_two:(asBool(b.winByTwo)?1:0),Number(b.advanceCount??before.advance_count),"head_to_head",["side_out","rally"].includes(String(b.scoringMode??before.scoring_mode))?String(b.scoringMode??before.scoring_mode):"side_out",Math.max(0,Number(b.minimumRestMinutes??before.minimum_rest_minutes??15)),Math.max(5,Number(b.matchSlotMinutes??before.match_slot_minutes??20)),rules.relaySegmentPoints,rules.relayTeamSize,rules.finalPointOnServe,rules.thirdPlaceMatch,b.active===undefined?before.active:(asBool(b.active)?1:0),nowIso(),p.id).run();
    const after=await one(env,"SELECT * FROM divisions WHERE id=?",p.id);await createAudit(env,user,"division",p.id,"UPDATE",before,after);await emitUpdate(env,tid);return ok(after,request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),before=await one(env,"SELECT * FROM divisions WHERE id=?",p.id);
    await env.DB.prepare("DELETE FROM divisions WHERE id=?").bind(p.id).run();await createAudit(env,user,"division",p.id,"DELETE",before,null);await emitUpdate(env,tid);return ok({ok:true},request,env);
  }

  p=route(path,"/api/tournaments/:id/courts");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await assertTournament(env,user,p.id);const b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const id=uid();await env.DB.prepare("INSERT INTO courts(id,tournament_id,name,sort_order,active,updated_at) VALUES(?,?,?,?,1,?)").bind(id,p.id,name,Number(b.sortOrder||0),nowIso()).run();
    const row=await one(env,"SELECT * FROM courts WHERE id=?",id);await emitUpdate(env,p.id);return ok(row,request,env,201);
  }
  p=route(path,"/api/courts/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),tid=await assertCourt(env,user,p.id),before=await one(env,"SELECT * FROM courts WHERE id=?",p.id),b=await bodyJson(request);
    await env.DB.prepare("UPDATE courts SET name=?,sort_order=?,active=?,updated_at=? WHERE id=?").bind(String(b.name??before.name),Number(b.sortOrder??before.sort_order),b.active===undefined?before.active:(asBool(b.active)?1:0),nowIso(),p.id).run();
    const after=await one(env,"SELECT * FROM courts WHERE id=?",p.id);await emitUpdate(env,tid);return ok(after,request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),tid=await assertCourt(env,user,p.id);await env.DB.prepare("DELETE FROM courts WHERE id=?").bind(p.id).run();await emitUpdate(env,tid);return ok({ok:true},request,env);
  }

  p=route(path,"/api/divisions/:id/draw-balanced-teams");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const tid=await assertDivision(env,user,p.id),division=await one(env,"SELECT id,event_type FROM divisions WHERE id=?",p.id);
    if(!division||!["doubles","mixed_doubles"].includes(division.event_type))return fail("TEAM_DRAW_DOUBLES_ONLY",request,env,400);
    if(await one(env,"SELECT id FROM matches WHERE division_id=? LIMIT 1",p.id))return fail("TEAM_DRAW_LOCKED",request,env,409);
    const b=await bodyJson(request),requested=Array.isArray(b.playerIds)?[...new Set(b.playerIds.map(String).filter(Boolean))]:[];
    const assignedRows=await rows(env,"SELECT DISTINCT tp.player_id FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE t.division_id=? AND t.status<>'withdrawn'",p.id);
    const assigned=new Set(assignedRows.map(x=>String(x.player_id)));
    let pool;
    if(requested.length){
      pool=await rows(env,"SELECT id,full_name,gender,skill_level,club_id,active FROM players WHERE id IN ("+requested.map(()=>"?").join(",")+")",...requested);
      if(pool.length!==requested.length)return fail("PLAYER_NOT_FOUND",request,env,404);
      if(pool.some(x=>!x.active))return fail("PLAYER_INACTIVE",request,env,400);
      if(pool.some(x=>assigned.has(String(x.id))))return fail("PLAYER_ALREADY_IN_DIVISION",request,env,409);
    }else{
      pool=await rows(env,"SELECT id,full_name,gender,skill_level,club_id,active FROM players WHERE active=1 ORDER BY full_name");
      pool=pool.filter(x=>!assigned.has(String(x.id)));
    }
    if(pool.length<2)return fail("NOT_ENOUGH_PLAYERS",request,env,400);
    if(pool.length%2)return fail("ODD_PLAYER_COUNT",request,env,400);
    pool=pool.map(x=>({...x,skill_level:skillLevel(x.skill_level)}));
    let pairs=[];
    if(division.event_type==="mixed_doubles"){
      const males=shuffleCrypto(pool.filter(x=>x.gender==="male")).sort((x,y)=>SKILL_WEIGHT[y.skill_level]-SKILL_WEIGHT[x.skill_level]);
      const females=shuffleCrypto(pool.filter(x=>x.gender==="female")).sort((x,y)=>SKILL_WEIGHT[x.skill_level]-SKILL_WEIGHT[y.skill_level]);
      if(males.length!==females.length||males.length*2!==pool.length)return fail("MIXED_GENDER_COUNT_MISMATCH",request,env,400);
      pairs=males.map((m,i)=>[m,females[i]]);
    }else{
      const ordered=shuffleCrypto(pool).sort((x,y)=>SKILL_WEIGHT[y.skill_level]-SKILL_WEIGHT[x.skill_level]);
      while(ordered.length)pairs.push([ordered.shift(),ordered.pop()]);
    }
    const prepared=pairs.map(pair=>({
      pair,
      score:pair.reduce((n,x)=>n+SKILL_WEIGHT[x.skill_level],0),
      clubId:pair[0].club_id&&pair[0].club_id===pair[1].club_id?pair[0].club_id:null
    })).sort((x,y)=>y.score-x.score);
    const changedAt=nowIso(),statements=[],result=[];
    for(let i=0;i<prepared.length;i++){
      const item=prepared[i],id=uid(),name=item.pair.map(x=>x.full_name).join(" / ");
      statements.push(env.DB.prepare("INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,?,?)")
        .bind(id,p.id,name,item.clubId,i+1,null,"active",changedAt));
      for(const player of item.pair)statements.push(env.DB.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").bind(id,player.id));
      statements.push(env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,after_data,reason,created_at) VALUES(?,'team',?,'DRAW_BALANCED_TEAM',?,?,?)")
        .bind(user.id,id,JSON.stringify({divisionId:p.id,playerIds:item.pair.map(x=>x.id),skills:item.pair.map(x=>x.skill_level),seed:i+1}),name,changedAt));
      result.push({id,name,seed:i+1,totalSkill:item.score,players:item.pair.map(x=>({id:x.id,name:x.full_name,gender:x.gender,skillLevel:x.skill_level}))});
    }
    await env.DB.batch(statements);await emitUpdate(env,tid);
    return ok({created:result.length,divisionId:p.id,mode:"balanced_skill",teams:result},request,env,201);
  }

  p=route(path,"/api/divisions/:id/teams");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request);
    const roster=await validateDivisionRoster(env,p.id,b.playerIds);
    const name=String(b.name||roster.players.map(player=>player.full_name).join(" / ")).trim();
    if(!name)return fail("NAME_REQUIRED",request,env,400);
    const id=uid(),changedAt=nowIso(),statements=[];
    const clubId=await teamClub(env,b,statements);
    statements.push(env.DB.prepare("INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id,p.id,name,clubId,b.seed??null,b.group?String(b.group):null,"active",changedAt));
    for(const playerId of roster.ids)statements.push(env.DB.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").bind(id,playerId));
    await env.DB.batch(statements);
    const row=await one(env,"SELECT * FROM teams WHERE id=?",id);
    await createAudit(env,user,"team",id,"CREATE_TEAM_WITH_ROSTER",null,{...row,playerIds:roster.ids},name);
    await emitUpdate(env,tid);return ok({...row,playerIds:roster.ids},request,env,201);
  }
  p=route(path,"/api/teams/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),tid=await assertTeam(env,user,p.id),before=await one(env,"SELECT * FROM teams WHERE id=?",p.id),b=await bodyJson(request);
    const oldIds=(await rows(env,"SELECT player_id FROM team_players WHERE team_id=? ORDER BY player_id",p.id)).map(x=>x.player_id);
    const status=String(b.status??before.status);
    if(!["active","withdrawn"].includes(status))throw httpError("INVALID_TEAM_STATUS");
    let ids=oldIds,changed=false;
    if(b.playerIds!==undefined){
      const d=await one(env,"SELECT event_type FROM divisions WHERE id=?",before.division_id);
      try{ids=validatePlayerIds(d.event_type,b.playerIds)}catch(error){throw httpError(error.message)}
      changed=ids.length!==oldIds.length||ids.some(id=>!oldIds.includes(id));
    }
    if(changed){
      const locked=await one(env,"SELECT id FROM matches m WHERE (team_a_id=? OR team_b_id=?) AND (started_at IS NOT NULL OR status IN ('live','completed','walkover') OR winner_team_id IS NOT NULL OR current_score_a<>0 OR current_score_b<>0 OR EXISTS (SELECT 1 FROM match_sets s WHERE s.match_id=m.id)) LIMIT 1",p.id,p.id);
      if(locked)throw httpError("TEAM_ROSTER_LOCKED",409);
    }
    if(changed||(before.status==='withdrawn'&&status==='active'))await validateDivisionRoster(env,before.division_id,ids,{currentTeamId:p.id});
    const name=String(b.name??before.name).trim();if(!name)throw httpError("NAME_REQUIRED");
    let clubId=before.club_id;
    if(b.clubId!==undefined){clubId=b.clubId||null;if(clubId&&clubId!==before.club_id&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))throw httpError("INVALID_CLUB")}
    const changedAt=nowIso(),after={...before,name,club_id:clubId,seed:b.seed===undefined?before.seed:b.seed,group_code:String(b.group??before.group_code??""),status,updated_at:changedAt,playerIds:ids};
    const statements=[];
    if(changed)statements.push(env.DB.prepare("DELETE FROM team_players WHERE team_id=?").bind(p.id));
    statements.push(env.DB.prepare("UPDATE teams SET name=?,club_id=?,seed=?,group_code=?,status=?,updated_at=? WHERE id=?")
      .bind(after.name,after.club_id,after.seed,after.group_code,after.status,changedAt,p.id));
    if(changed)for(const id of ids)statements.push(env.DB.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").bind(p.id,id));
    statements.push(rosterAudit(env,user,p.id,{...before,playerIds:oldIds},after));
    await env.DB.batch(statements);
    await emitUpdate(env,tid);return ok(after,request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),tid=await assertTeam(env,user,p.id);await env.DB.prepare("DELETE FROM teams WHERE id=?").bind(p.id).run();await emitUpdate(env,tid);return ok({ok:true},request,env);
  }
  p=route(path,"/api/teams/:id/players");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertTeam(env,user,p.id),b=await bodyJson(request),playerId=String(b.playerId||"");
    const player=playerId?await one(env,"SELECT id,active FROM players WHERE id=?",playerId):null;
    if(!player)return fail("PLAYER_NOT_FOUND",request,env,404);
    if(!player.active)return fail("PLAYER_INACTIVE",request,env,400);
    const team=await one(env,"SELECT t.id,t.division_id,d.event_type FROM teams t JOIN divisions d ON d.id=t.division_id WHERE t.id=?",p.id);
    const existing=await one(env,"SELECT 1 AS found FROM team_players WHERE team_id=? AND player_id=?",p.id,playerId);
    if(existing)return ok({ok:true},request,env);
    const assigned=await one(env,"SELECT 1 AS found FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE t.division_id=? AND tp.player_id=? AND t.id<>? AND t.status<>'withdrawn'",team.division_id,playerId,p.id);
    if(assigned)return fail("PLAYER_ALREADY_IN_DIVISION",request,env,409);
    const count=Number((await one(env,"SELECT COUNT(*) AS count FROM team_players WHERE team_id=?",p.id))?.count||0);
    if(count>=playerCountRange(team.event_type).max)return fail("INVALID_PLAYER_COUNT",request,env,400);
    await env.DB.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").bind(p.id,playerId).run();await emitUpdate(env,tid);return ok({ok:true},request,env);
  }

  p=route(path,"/api/divisions/:id/matches");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request);
    if(!b.teamAId||!b.teamBId||b.teamAId===b.teamBId)return fail("INVALID_TEAMS",request,env,400);
    await validateMatchAssignment(env,user,p.id,tid,b);
    const id=uid();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO matches(id,division_id,court_id,referee_user_id,team_a_id,team_b_id,stage,scheduled_at,status,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)")
        .bind(id,p.id,b.courtId||null,b.refereeUserId||null,b.teamAId,b.teamBId,String(b.stage||"Vòng bảng"),b.scheduledAt||null,"scheduled",nowIso()),
      env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,after_data) VALUES(?,'match',?,'CREATE_MATCH',?)").bind(user.id,id,JSON.stringify({divisionId:p.id,...b}))
    ]);
    const row=await matchJson(env,id);await emitUpdate(env,tid,id);return ok(row,request,env,201);
  }
  p=route(path,"/api/matches/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m))||user.role==="referee")return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    const pair=await validateMatchAssignment(env,user,m.division_id,m.tournament_id,b,m);
    if(b.status!==undefined&&b.status!==m.status)return fail("USE_SCORE_ACTION",request,env,400);
    const after={...m,stage:String(b.stage??m.stage),scheduled_at:b.scheduledAt===undefined?m.scheduled_at:b.scheduledAt,court_id:b.courtId===undefined?m.court_id:b.courtId,referee_user_id:b.refereeUserId===undefined?m.referee_user_id:b.refereeUserId,team_a_id:pair.a,team_b_id:pair.b,version:Number(m.version)+1};
    await env.DB.batch([matchAudit(env,user,m,"UPDATE_MATCH",after),env.DB.prepare("UPDATE matches SET stage=?,scheduled_at=?,court_id=?,referee_user_id=?,team_a_id=?,team_b_id=?,version=version+1 WHERE id=?")
      .bind(after.stage,after.scheduled_at,after.court_id,after.referee_user_id,pair.a,pair.b,p.id)]);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m))||user.role==="referee")return fail("FORBIDDEN",request,env,403);
    if(["completed","walkover"].includes(m.status)||m.winner_team_id)return fail("COMPLETED_MATCH_LOCKED",request,env,409);
    const history=await matchHasHistory(env,m),after=history?{...m,status:"cancelled",version:Number(m.version)+1}:null;
    await env.DB.batch([matchAudit(env,user,m,history?"CANCEL_MATCH":"DELETE_MATCH",after),history?env.DB.prepare("UPDATE matches SET status='cancelled',version=version+1 WHERE id=?").bind(p.id):env.DB.prepare("DELETE FROM matches WHERE id=?").bind(p.id)]);
    await emitUpdate(env,m.tournament_id,p.id);return ok({ok:true,mode:history?"cancelled":"deleted"},request,env);
  }
  p=route(path,"/api/matches/:id/assignment");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!requireRole(user,"super_admin","organizer")||!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    await validateMatchAssignment(env,user,m.division_id,m.tournament_id,b,m);
    const after={...m,court_id:b.courtId===undefined?m.court_id:b.courtId,referee_user_id:b.refereeUserId===undefined?m.referee_user_id:b.refereeUserId,scheduled_at:b.scheduledAt===undefined?m.scheduled_at:b.scheduledAt,version:Number(m.version)+1};
    await env.DB.batch([matchAudit(env,user,m,"ASSIGN_MATCH",after),env.DB.prepare("UPDATE matches SET court_id=?,referee_user_id=?,scheduled_at=?,version=version+1 WHERE id=?")
      .bind(after.court_id,after.referee_user_id,after.scheduled_at,p.id)]);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  p=route(path,"/api/matches/:id/court-state");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);
    if(!m)return fail("NOT_FOUND",request,env,404);
    if(!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    if(["completed","walkover","cancelled"].includes(m.status)||m.winner_team_id)return fail("COMPLETED_MATCH_LOCKED",request,env,409);
    const b=await bodyJson(request),courtState=String(b.courtState||"");
    if(!["scheduled","called","on_deck","warming_up"].includes(courtState))return fail("INVALID_COURT_STATE",request,env,400);
    if(b.expectedVersion!==undefined&&Number(b.expectedVersion)!==Number(m.version))return fail("VERSION_CONFLICT",request,env,409);
    const at=nowIso();
    const after={...m,court_state:courtState,called_at:m.called_at,on_deck_at:m.on_deck_at,warmup_at:m.warmup_at,version:Number(m.version)+1};
    if(courtState==="scheduled"){after.called_at=null;after.on_deck_at=null;after.warmup_at=null}
    if(courtState==="called")after.called_at=m.called_at||at;
    if(courtState==="on_deck"){after.called_at=m.called_at||at;after.on_deck_at=m.on_deck_at||at}
    if(courtState==="warming_up"){after.called_at=m.called_at||at;after.on_deck_at=m.on_deck_at||at;after.warmup_at=m.warmup_at||at}
    await env.DB.batch([
      matchAudit(env,user,m,"COURT_STATE",after),
      env.DB.prepare("UPDATE matches SET court_state=?,called_at=?,on_deck_at=?,warmup_at=?,version=version+1 WHERE id=? AND version=?")
        .bind(after.court_state,after.called_at,after.on_deck_at,after.warmup_at,p.id,m.version)
    ]);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }

  p=route(path,"/api/divisions/:id/draw-config");
  if(p&&method==="GET"){
    const user=await userRequired(request,env);await assertDivision(env,user,p.id);
    const row=await one(env,"SELECT value FROM app_settings WHERE key=?",`draw_config:${p.id}`);
    return ok(safeJsonParse(row?.value,{}),request,env);
  }
  if(p&&method==="PUT"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    await assertDivision(env,user,p.id);
    const b=await bodyJson(request),mode=["random","seeded","manual"].includes(String(b.mode))?String(b.mode):"random";
    const groupCount=Math.max(1,Math.min(26,Number(b.groupCount||2)));
    const teamsPerGroup=Math.max(2,Math.min(32,Number(b.teamsPerGroup||4)));
    const advanceCount=Math.max(1,Math.min(16,Number(b.advanceCount||2)));
    const config={mode,groupCount,teamsPerGroup,advanceCount,courtIds:Array.isArray(b.courtIds)?b.courtIds.filter(Boolean):[],groupCourts:b.groupCourts&&typeof b.groupCourts==="object"?b.groupCourts:{},manualAssignments:b.manualAssignments&&typeof b.manualAssignments==="object"?b.manualAssignments:{}};
    await env.DB.prepare("INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at")
      .bind(`draw_config:${p.id}`,JSON.stringify(config),user.id,nowIso()).run();
    return ok(config,request,env);
  }
  p=route(path,"/api/divisions/:id/run-draw");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const tid=await assertDivision(env,user,p.id),b=await bodyJson(request);
    const division=await one(env,"SELECT * FROM divisions WHERE id=?",p.id);
    const tournament=await one(env,"SELECT id,name,public_visible FROM tournaments WHERE id=?",tid);
    const teams=await rows(env,"SELECT id,name,seed,group_code FROM teams WHERE division_id=? AND status='active' ORDER BY COALESCE(seed,9999),name",p.id);
    if(teams.length<2)return fail("NOT_ENOUGH_TEAMS",request,env,400);
    const old=await rows(env,"SELECT id,status,winner_team_id FROM matches WHERE division_id=? AND bracket_slot IS NULL AND (stage LIKE 'Bảng %' OR stage='Vòng bảng')",p.id);
    if(old.some(m=>["live","completed","walkover"].includes(m.status)||m.winner_team_id))return fail("GROUP_STAGE_ALREADY_STARTED",request,env,409);
    if(old.length){
      const history=await one(env,"SELECT COUNT(*) AS n FROM score_events se JOIN matches m ON m.id=se.match_id WHERE m.division_id=? AND m.bracket_slot IS NULL AND (m.stage LIKE 'Bảng %' OR m.stage='Vòng bảng')",p.id);
      if(Number(history?.n||0)>0)return fail("GROUP_STAGE_ALREADY_STARTED",request,env,409);
    }
    const mode=["random","seeded","manual"].includes(String(b.mode))?String(b.mode):"random";
    const teamsPerGroup=Math.max(2,Math.min(32,Number(b.teamsPerGroup||4)));
    let groupCount=Math.max(1,Math.min(26,Number(b.groupCount||Math.ceil(teams.length/teamsPerGroup))));
    groupCount=Math.min(groupCount,teams.length);
    if(teams.length<groupCount*2)return fail("GROUP_TOO_SMALL",request,env,400);
    const labels=Array.from({length:groupCount},(_,i)=>String.fromCharCode(65+i));
    const assignments={};
    if(mode==="manual"){
      const manual=b.manualAssignments&&typeof b.manualAssignments==="object"?b.manualAssignments:{};
      for(const team of teams){
        const g=String(manual[team.id]||"").toUpperCase();
        if(!labels.includes(g))return fail("MANUAL_GROUP_ASSIGNMENT_REQUIRED",request,env,400);
        assignments[team.id]=g;
      }
    }else{
      let ordered=[...teams];
      if(mode==="random"){
        for(let i=ordered.length-1;i>0;i--){
          const r=new Uint32Array(1);crypto.getRandomValues(r);
          const j=Math.floor((r[0]/4294967296)*(i+1));
          [ordered[i],ordered[j]]=[ordered[j],ordered[i]];
        }
        ordered.forEach((team,i)=>assignments[team.id]=labels[i%groupCount]);
      }else{
        ordered.sort((a,b)=>Number(a.seed||9999)-Number(b.seed||9999)||String(a.name).localeCompare(String(b.name),"vi"));
        ordered.forEach((team,i)=>{
          const cycle=Math.floor(i/groupCount),offset=i%groupCount;
          const gi=cycle%2===0?offset:(groupCount-1-offset);
          assignments[team.id]=labels[gi];
        });
      }
    }
    const grouped=new Map(labels.map(g=>[g,[]]));
    for(const team of teams)grouped.get(assignments[team.id]).push(team);
    const sizes=[...grouped.values()].map(x=>x.length);
    if(Math.min(...sizes)<2)return fail("GROUP_TOO_SMALL",request,env,400);
    if(mode!=="manual"&&Math.max(...sizes)>teamsPerGroup)return fail("GROUP_CAPACITY_EXCEEDED",request,env,400);
    const advanceCount=Math.max(1,Math.min(16,Number(b.advanceCount||division.advance_count||2)));
    if(advanceCount>Math.min(...sizes))return fail("ADVANCE_COUNT_TOO_HIGH",request,env,400);

    const activeCourts=await rows(env,"SELECT id,name,sort_order FROM courts WHERE tournament_id=? AND active=1 ORDER BY sort_order,name",tid);
    if(!activeCourts.length)return fail("NO_COURTS",request,env,400);
    const activeCourtIds=new Set(activeCourts.map(x=>x.id));
    let courtIds=(Array.isArray(b.courtIds)?b.courtIds:[]).filter(id=>activeCourtIds.has(id));
    if(!courtIds.length)courtIds=activeCourts.map(x=>x.id);
    const rawGroupCourts=b.groupCourts&&typeof b.groupCourts==="object"?b.groupCourts:{};
    const groupCourts={};
    for(const g of labels){
      let chosen=(Array.isArray(rawGroupCourts[g])?rawGroupCourts[g]:[]).filter(id=>courtIds.includes(id));
      if(!chosen.length)chosen=[...courtIds];
      groupCourts[g]=chosen;
    }
    const publicPayload={tournamentId:tid,tournamentName:tournament?.name||"",divisionId:p.id,divisionName:division?.name||"",teamCount:teams.length,groupCount,mode};
    if(tournament?.public_visible)await broadcast(env,"draw:start",publicPayload,"public");
    await broadcast(env,"draw:start",publicPayload,tid);

    await env.DB.prepare("DELETE FROM matches WHERE division_id=? AND bracket_slot IS NULL AND (stage LIKE 'Bảng %' OR stage='Vòng bảng')").bind(p.id).run();
    await env.DB.prepare("UPDATE divisions SET advance_count=?,updated_at=? WHERE id=?").bind(advanceCount,nowIso(),p.id).run();
    for(const team of teams)await env.DB.prepare("UPDATE teams SET group_code=?,updated_at=? WHERE id=?").bind(assignments[team.id],nowIso(),team.id).run();

    let created=0;
    const groupSummary=[];
    for(const g of labels){
      const list=grouped.get(g),courtPool=groupCourts[g];let ci=0;
      for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
        const courtId=courtPool[ci++%courtPool.length];
        await env.DB.prepare("INSERT INTO matches(id,division_id,court_id,team_a_id,team_b_id,stage,status,version,created_at) VALUES(?,?,?,?,?,?,'scheduled',1,?)")
          .bind(uid(),p.id,courtId,list[i].id,list[j].id,"Bảng "+g,nowIso()).run();
        created++;
      }
      groupSummary.push({group:g,count:list.length,courtIds:courtPool});
    }
    const config={mode,groupCount,teamsPerGroup,advanceCount,courtIds,groupCourts,manualAssignments:mode==="manual"?assignments:{}};
    await env.DB.batch([
      env.DB.prepare("INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES(?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(`draw_config:${p.id}`,JSON.stringify(config),user.id,nowIso()),
      env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,after_data,reason) VALUES(?,'division',?,'RUN_GROUP_DRAW',?,?)").bind(user.id,p.id,JSON.stringify({config,groupSummary,created}),"Bốc thăm chia bảng và xếp sân")
    ]);
    const teamById=new Map(teams.map(x=>[x.id,x]));
    const donePayload={...publicPayload,advanceCount,created,groups:groupSummary,assignments:Object.entries(assignments).map(([teamId,group])=>({teamId,teamName:teamById.get(teamId)?.name||"",group}))};
    if(tournament?.public_visible)await broadcast(env,"draw:complete",donePayload,"public");
    await broadcast(env,"draw:complete",donePayload,tid);
    await emitUpdate(env,tid);
    return ok({ok:true,...donePayload,config},request,env);
  }
  p=route(path,"/api/divisions/:id/auto-seed-groups");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request),count=Math.max(1,Math.min(26,Number(b.groupCount||2)));
    const teams=await rows(env,"SELECT id FROM teams WHERE division_id=? AND status='active' ORDER BY COALESCE(seed,9999),name",p.id);
    for(let i=0;i<teams.length;i++)await env.DB.prepare("UPDATE teams SET group_code=?,updated_at=? WHERE id=?").bind(String.fromCharCode(65+(i%count)),nowIso(),teams[i].id).run();
    await emitUpdate(env,tid);return ok({ok:true,groups:count},request,env);
  }
  p=route(path,"/api/divisions/:id/generate-round-robin");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id);
    const teams=await rows(env,"SELECT id,group_code FROM teams WHERE division_id=? AND status='active' ORDER BY group_code,COALESCE(seed,9999),name",p.id);
    const groups=new Map();for(const t of teams){const g=t.group_code||"A";if(!groups.has(g))groups.set(g,[]);groups.get(g).push(t)}
    let created=0;
    for(const [g,list] of groups)for(let i=0;i<list.length;i++)for(let j=i+1;j<list.length;j++){
      const exists=await one(env,"SELECT id FROM matches WHERE division_id=? AND ((team_a_id=? AND team_b_id=?) OR (team_a_id=? AND team_b_id=?))",p.id,list[i].id,list[j].id,list[j].id,list[i].id);
      if(!exists){await env.DB.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status,version,created_at) VALUES(?,?,?,?,?,'scheduled',1,?)").bind(uid(),p.id,list[i].id,list[j].id,"Bảng "+g,nowIso()).run();created++}
    }
    await emitUpdate(env,tid);return ok({ok:true,created},request,env);
  }
  p=route(path,"/api/divisions/:id/auto-schedule-courts");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id);
    const courts=await rows(env,"SELECT id FROM courts WHERE tournament_id=? AND active=1 ORDER BY sort_order,name",tid);
    if(!courts.length)return fail("NO_COURTS",request,env,400);
    const division=await one(env,"SELECT minimum_rest_minutes,match_slot_minutes FROM divisions WHERE id=?",p.id);
    const tournament=await one(env,"SELECT start_at FROM tournaments WHERE id=?",tid);
    const minRest=Math.max(0,Number(division?.minimum_rest_minutes??15));
    const slotMinutes=Math.max(5,Number(division?.match_slot_minutes??20));
    const parsedStart=Date.parse(tournament?.start_at||"");
    const baseMs=Number.isFinite(parsedStart)?parsedStart:Date.now();
    const pending=await rows(env,"SELECT id,team_a_id,team_b_id,created_at FROM matches WHERE division_id=? AND status IN ('scheduled','ready') AND team_a_id IS NOT NULL AND team_b_id IS NOT NULL ORDER BY created_at",p.id);
    const courtFree=new Map(courts.map(c=>[c.id,baseMs])),teamFree=new Map();
    const remaining=[...pending],plan=[];
    while(remaining.length){
      let best=null;
      for(let mi=0;mi<remaining.length;mi++){
        const m=remaining[mi];
        const teamsReady=Math.max(teamFree.get(m.team_a_id)||baseMs,teamFree.get(m.team_b_id)||baseMs);
        for(const court of courts){
          const start=Math.max(baseMs,courtFree.get(court.id)||baseMs,teamsReady);
          if(!best||start<best.start||(start===best.start&&mi<best.mi))best={mi,match:m,courtId:court.id,start};
        }
      }
      const chosen=remaining.splice(best.mi,1)[0],end=best.start+slotMinutes*60000,restUntil=end+minRest*60000;
      courtFree.set(best.courtId,end);teamFree.set(chosen.team_a_id,restUntil);teamFree.set(chosen.team_b_id,restUntil);
      plan.push({id:chosen.id,courtId:best.courtId,scheduledAt:new Date(best.start).toISOString()});
    }
    for(const item of plan)await env.DB.prepare("UPDATE matches SET court_id=?,scheduled_at=?,version=version+1 WHERE id=?").bind(item.courtId,item.scheduledAt,item.id).run();
    await createAudit(env,user,"division",p.id,"AUTO_SCHEDULE",null,{minRestMinutes:minRest,matchSlotMinutes:slotMinutes,courts:courts.length,matches:plan.length});
    await emitUpdate(env,tid);return ok({ok:true,updated:plan.length,assigned:plan.length,courts:courts.length,minRestMinutes:minRest,matchSlotMinutes:slotMinutes},request,env);
  }

  if(path==="/api/users"&&method==="GET"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    let data=await rows(env,"SELECT u.id,u.email,u.display_name,u.role,u.active,u.tournament_id_scope,u.club_id,u.created_at,t.name AS tournament_name,c.name AS club_name FROM app_users u LEFT JOIN tournaments t ON t.id=u.tournament_id_scope LEFT JOIN clubs c ON c.id=u.club_id ORDER BY u.display_name");
    if(user.role==="organizer"){
      const owned=new Set((await loadAdminState(env,user)).tournaments.map(x=>x.id));
      data=data.filter(x=>x.id===user.id||(x.role==="referee"&&x.tournament_id_scope&&owned.has(x.tournament_id_scope)));
    }
    return ok(data.map(accountUser),request,env);
  }
  const refereeAccount=route(path,"/api/users/referees/:id");
  const refereeWrite=path==="/api/users/referees"||Boolean(refereeAccount);
  if((path==="/api/users"||path==="/api/users/referees")&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");const b=await bodyJson(request);
    const email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),password=String(b.password||""),role=refereeWrite?"referee":String(b.role||"referee");
    if(!email||!name||!password)return fail("FIELDS_REQUIRED",request,env,400);
    if(!validEmail(email))return fail("INVALID_EMAIL",request,env,400);
    if(name.length>120)return fail("NAME_TOO_LONG",request,env,400);
    if(password.length<12||password.length>64)return fail("PASSWORD_POLICY",request,env,400);
    if(user.role==="organizer"&&role!=="referee")return fail("ORGANIZER_CAN_ONLY_CREATE_REFEREE",request,env,403);
    if(!["organizer","referee","club_manager","finance"].includes(role))return fail("INVALID_CHILD_ROLE",request,env,400);
    const scopedRole=["club_manager","finance"].includes(role);
    const clubId=scopedRole?(b.clubId||null):null;
    if(role==="club_manager"&&!clubId)return fail("CLUB_REQUIRED",request,env,400);
    if(clubId&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))return fail("INVALID_CLUB",request,env,400);
    let tournamentId=["organizer","referee"].includes(role)?(b.tournamentId||null):null;
    if(user.role==="organizer"){
      if(!tournamentId)return fail("TOURNAMENT_REQUIRED",request,env,400);
      await assertTournament(env,user,tournamentId);
    }else if(tournamentId&&!(await one(env,"SELECT id FROM tournaments WHERE id=?",tournamentId))){
      return fail("INVALID_TOURNAMENT",request,env,400);
    }
    if(await one(env,"SELECT id FROM app_users WHERE email=?",email))return fail("EMAIL_EXISTS",request,env,409);
    const id=uid(),hash=await hashPassword(password),at=nowIso();
    const after={id,email,display_name:name,role,active:1,tournament_id_scope:tournamentId,club_id:clubId};
    await env.DB.batch([
      env.DB.prepare("INSERT INTO app_users(id,email,display_name,role,active,password_hash,auth_version,tournament_id_scope,club_id,created_at,updated_at) VALUES(?,?,?,?,1,?,0,?,?,?,?)")
        .bind(id,email,name,role,hash,tournamentId,clubId,at,at),
      accountAudit(env,user,id,refereeWrite?"CREATE_REFEREE":"CREATE_CHILD_ACCOUNT",null,after)
    ]);
    const created=await one(env,"SELECT * FROM app_users WHERE id=?",id);
    return ok(accountUser(created),request,env,201);
  }
  p=refereeAccount||route(path,"/api/users/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const target=await one(env,"SELECT * FROM app_users WHERE id=?",p.id);if(!target)return fail("NOT_FOUND",request,env,404);
    if(refereeWrite&&target.role!=="referee")return fail("NOT_FOUND",request,env,404);
    const b=await bodyJson(request);
    if(p.id===user.id&&b.active!==undefined&&!asBool(b.active))return fail("CANNOT_DISABLE_SELF",request,env,400);
    if(user.role==="organizer"){
      if(target.role!=="referee")return fail("ORGANIZER_CAN_ONLY_EDIT_REFEREE",request,env,403);
      if(!target.tournament_id_scope||!(await canManageTournament(env,user,target.tournament_id_scope)))return fail("TOURNAMENT_SCOPE_FORBIDDEN",request,env,403);
    }
    if(target.role==="super_admin"&&target.id!==user.id)return fail("OWNER_ACCOUNT_PROTECTED",request,env,403);
    const role=refereeWrite||user.role==="organizer"?"referee":(target.role==="super_admin"?"super_admin":(b.role===undefined?target.role:String(b.role)));
    if(target.role!=="super_admin"&&!["organizer","referee","club_manager","finance"].includes(role))return fail("INVALID_CHILD_ROLE",request,env,400);
    const email=String(b.email??target.email).trim().toLowerCase(),name=String(b.name??b.displayName??target.display_name).trim();
    if(!email||!name)return fail("FIELDS_REQUIRED",request,env,400);
    if(!validEmail(email))return fail("INVALID_EMAIL",request,env,400);
    if(name.length>120)return fail("NAME_TOO_LONG",request,env,400);
    if(await one(env,"SELECT id FROM app_users WHERE email=? AND id<>?",email,p.id))return fail("EMAIL_EXISTS",request,env,409);
    const scopedRole=["club_manager","finance"].includes(role);
    const clubId=scopedRole?(b.clubId===undefined?(target.club_id||null):b.clubId):null;
    if(role==="club_manager"&&!clubId)return fail("CLUB_REQUIRED",request,env,400);
    if(clubId&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))return fail("INVALID_CLUB",request,env,400);
    let tournamentId=["organizer","referee"].includes(role)?(b.tournamentId===undefined?(target.tournament_id_scope||null):b.tournamentId):null;
    if(user.role==="organizer"){
      if(!tournamentId)return fail("TOURNAMENT_REQUIRED",request,env,400);
      await assertTournament(env,user,tournamentId);
    }else if(tournamentId&&!(await one(env,"SELECT id FROM tournaments WHERE id=?",tournamentId))){
      return fail("INVALID_TOURNAMENT",request,env,400);
    }
    let hash=target.password_hash,authVersion=Number(target.auth_version||0);
    if(b.password){
      const pwd=String(b.password);if(pwd.length<12||pwd.length>64)return fail("PASSWORD_POLICY",request,env,400);
      hash=await hashPassword(pwd);authVersion++;
    }
    const active=b.active===undefined?target.active:(asBool(b.active)?1:0);
    const after={...target,email,display_name:name,role,active,club_id:clubId,tournament_id_scope:tournamentId};
    await env.DB.batch([
      env.DB.prepare("UPDATE app_users SET email=?,display_name=?,role=?,active=?,club_id=?,tournament_id_scope=?,password_hash=?,auth_version=?,updated_at=? WHERE id=?")
        .bind(email,name,role,active,clubId,tournamentId,hash,authVersion,nowIso(),p.id),
      accountAudit(env,user,p.id,refereeWrite?"UPDATE_REFEREE":"UPDATE_CHILD_ACCOUNT",target,after,b.password?"Password reset":null)
    ]);
    const updated=await one(env,"SELECT * FROM app_users WHERE id=?",p.id);
    return ok(accountUser(updated),request,env);
  }
  if(path==="/api/users/referees"&&method==="GET"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    let refs=await rows(env,"SELECT u.id,u.email,u.display_name,u.role,u.active,u.tournament_id_scope,u.club_id,u.created_at,t.name AS tournament_name FROM app_users u LEFT JOIN tournaments t ON t.id=u.tournament_id_scope WHERE u.role='referee' ORDER BY u.display_name");
    if(user.role==="organizer"){
      const owned=new Set((await loadAdminState(env,user)).tournaments.map(x=>x.id));refs=refs.filter(x=>x.tournament_id_scope&&owned.has(x.tournament_id_scope));
    }
    return ok(refs.map(accountUser),request,env);
  }

  if(path==="/api/clubs"&&method==="GET"){
    await userRequired(request,env);return ok(await rows(env,"SELECT * FROM clubs ORDER BY name"),request,env);
  }
  if(path==="/api/clubs"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");const b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const id=uid(),slug=await nextUniqueSlug(env,"clubs",name);await env.DB.prepare("INSERT INTO clubs(id,name,slug,city,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").bind(id,name,slug,String(b.city||""),nowIso(),nowIso()).run();return ok(await one(env,"SELECT * FROM clubs WHERE id=?",id),request,env,201);
  }

  if(path==="/api/settings/branding"&&method==="GET"){
    await userRequired(request,env);const row=await one(env,"SELECT value FROM app_settings WHERE key='branding'");return ok(safeJsonParse(row?.value,{}),request,env);
  }
  if(path==="/api/settings/branding"&&method==="PUT"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");const b=await bodyJson(request);
    await env.DB.prepare("INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES('branding',?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(JSON.stringify(b),user.id,nowIso()).run();return ok(b,request,env);
  }

  if(path==="/api/registrations"&&method==="GET"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer","finance");
    let data=await rows(env,"SELECT r.*,d.name AS division_name,t.name AS team_name,t.club_id AS team_club_id,tr.id AS tournament_id,tr.name AS tournament_name FROM registrations r JOIN divisions d ON d.id=r.division_id JOIN tournaments tr ON tr.id=d.tournament_id LEFT JOIN teams t ON t.id=r.team_id ORDER BY r.created_at DESC");
    if(user.role==="organizer"){
      const allowed=new Set((await loadAdminState(env,user)).tournaments.map(x=>x.id));data=data.filter(x=>allowed.has(x.tournament_id));
    }else if(user.role==="finance"&&user.clubId){
      data=data.filter(x=>x.team_club_id===user.clubId);
    }
    return ok(data,request,env);
  }
  p=route(path,"/api/divisions/:id/registrations");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request),id=uid(),teamId=String(b.teamId||"");
    const team=await one(env,"SELECT id FROM teams WHERE id=? AND division_id=? AND status<>'withdrawn'",teamId,p.id);
    if(!team)return fail("TEAM_DIVISION_MISMATCH",request,env,400);
    const linked=await rows(env,"SELECT player_id FROM team_players WHERE team_id=? ORDER BY player_id",teamId);
    await validateDivisionRoster(env,p.id,linked.map(x=>x.player_id),{currentTeamId:teamId});
    const dup=await one(env,"SELECT id FROM registrations WHERE division_id=? AND team_id=? AND status<>'cancelled' LIMIT 1",p.id,teamId);
    if(dup)return fail("REGISTRATION_EXISTS",request,env,409);
    const status=String(b.status||"approved"),paymentStatus=String(b.paymentStatus||"unpaid");
    if(!["pending","approved","waitlist","cancelled"].includes(status))return fail("INVALID_REGISTRATION_STATUS",request,env,400);
    if(!["unpaid","pending","paid","refunded"].includes(paymentStatus))return fail("INVALID_PAYMENT_STATUS",request,env,400);
    await env.DB.prepare("INSERT INTO registrations(id,division_id,team_id,status,payment_status,amount,checkin_token,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,p.id,teamId,status,paymentStatus,Number(b.amount||0),uid(),nowIso()).run();await emitUpdate(env,tid);return ok(await one(env,"SELECT * FROM registrations WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/registrations/:id/checkin");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const r=await one(env,"SELECT r.*,d.tournament_id FROM registrations r JOIN divisions d ON d.id=r.division_id WHERE r.id=?",p.id);
    if(!r)return fail("NOT_FOUND",request,env,404);
    if(user.role==="organizer")await assertTournament(env,user,r.tournament_id);
    if(r.status==="cancelled")return fail("REGISTRATION_CANCELLED",request,env,409);
    const saved=await env.DB.prepare("UPDATE registrations SET checked_in_by=CASE WHEN checked_in_at IS NULL THEN ? ELSE checked_in_by END,checked_in_at=COALESCE(checked_in_at,?) WHERE id=? AND status<>'cancelled'").bind(user.id,nowIso(),p.id).run();
    if(Number(saved.meta?.changes??saved.changes)===0)return fail("REGISTRATION_CANCELLED",request,env,409);
    return ok({ok:true},request,env);
  }
  p=route(path,"/api/registrations/:id/undo-checkin");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const r=await one(env,"SELECT r.*,d.tournament_id FROM registrations r JOIN divisions d ON d.id=r.division_id WHERE r.id=?",p.id);
    if(!r)return fail("NOT_FOUND",request,env,404);
    if(user.role==="organizer")await assertTournament(env,user,r.tournament_id);
    await env.DB.prepare("UPDATE registrations SET checked_in_at=NULL,checked_in_by=NULL WHERE id=?").bind(p.id).run();
    return ok({ok:true},request,env);
  }
  if(path==="/api/reports/overview"&&method==="GET"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","finance","club_manager");
    let clubId=url.searchParams.get("clubId")||null;
    if(user.role==="club_manager"){
      if(!user.clubId)return fail("CLUB_SCOPE_REQUIRED",request,env,403);
      if(clubId&&clubId!==user.clubId)return fail("FORBIDDEN",request,env,403);
      clubId=user.clubId;
    }else if(user.role==="finance"&&user.clubId){
      if(clubId&&clubId!==user.clubId)return fail("FORBIDDEN",request,env,403);
      clubId=user.clubId;
    }
    const players=clubId
      ?await rows(env,"SELECT id FROM players WHERE active=1 AND club_id=?",clubId)
      :await rows(env,"SELECT id FROM players WHERE active=1");
    const regs=clubId
      ?await rows(env,"SELECT r.* FROM registrations r LEFT JOIN teams t ON t.id=r.team_id WHERE t.club_id=?",clubId)
      :await rows(env,"SELECT * FROM registrations");
    const payments=regs.filter(r=>r.payment_status==="paid");
    const transactions=clubId
      ?await rows(env,"SELECT direction,amount FROM club_transactions WHERE club_id=?",clubId)
      :[];
    const clubBalance=transactions.reduce((sum,x)=>sum+(x.direction==="income"?1:-1)*Number(x.amount||0),0);
    return ok({
      players:players.length,members:players.length,registrations:regs.length,
      checked_in:regs.filter(x=>x.checked_in_at).length,paid_count:payments.length,
      revenue:payments.reduce((a,x)=>a+Number(x.amount||0),0),
      matches:0,live:0,completed:0,clubBalance
    },request,env);
  }
  return fail("NOT_FOUND",request,env,404);
}

export default {
  async fetch(request,env){
    try{
      const url=new URL(request.url);
      const fromCloudflare=Boolean(request.headers.get("cf-ray")||request.headers.get("cf-visitor"));
      if(url.protocol==="http:"&&fromCloudflare){
        url.protocol="https:";
        return Response.redirect(url.toString(),308);
      }
      if(url.pathname!=="/api"&&!url.pathname.startsWith("/api/")&&env.ASSETS){
        if(url.pathname.endsWith(".html")){
          const clean=new URL(request.url);
          if(url.pathname==="/index.html")clean.pathname="/";
          else if(url.pathname.endsWith("/index.html"))clean.pathname=url.pathname.slice(0,-10)||"/";
          else clean.pathname=url.pathname.slice(0,-5);
          const res=await env.ASSETS.fetch(new Request(clean.toString(),request));
          if(res.status===200||res.status===304)return res;
        }
        return env.ASSETS.fetch(request);
      }
      return await handleApi(request,env);
    }catch(e){
      const dbMessage=String(e?.message||"")+" "+String(e?.cause?.message||"");
      if(dbMessage.includes("UNIQUE constraint failed: app_users.email"))return fail("EMAIL_EXISTS",request,env,409);
      const constraint=["PLAYER_ALREADY_IN_DIVISION","TEAM_ROSTER_LOCKED","INVALID_PLAYER_COUNT","VERSION_CONFLICT","DOWNSTREAM_MATCH_LOCKED"].find(code=>dbMessage.includes(code));
      const status=Number(e?.status||(constraint?(constraint==='INVALID_PLAYER_COUNT'?400:409):500)),code=constraint||(status===500?"INTERNAL_ERROR":String(e?.message||"REQUEST_FAILED"));
      if(status===500)console.error(e);
      return fail(code,request,env,status);
    }
  }
};
