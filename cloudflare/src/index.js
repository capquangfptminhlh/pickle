import {corsHeaders,ok,fail,bodyJson,route,uid,slugify,nowIso,audit,safeJsonParse,publicUser} from "./util.js";
import {authenticate,ensureBootstrapAdmin,hashPassword,verifyPassword,signSession,requireRole,canManageTournament,tournamentForDivision,tournamentForTeam,tournamentForCourt,canEditPlayer} from "./auth.js";
import {loadState,loadAdminState,listPublicPlayers,loadPublicPlayer} from "./state.js";
import {TournamentRoom,broadcast} from "./realtime.js";
import {handleOperations} from "./operations.js";
import {advanceBracket} from "./bracket.js";

export {TournamentRoom};

async function userRequired(request,env){
  const user=await authenticate(request,env);
  if(!user)throw Object.assign(new Error("AUTH_REQUIRED"),{status:401});
  return user;
}
function httpError(code,status=400){return Object.assign(new Error(code),{status})}
function asBool(v){return v===true||v===1||v==="1"||v==="true"}
function validEmail(v){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||""))&&String(v||"").length<=254}
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
  if(user.role==="referee")return m.referee_user_id===user.id;
  return false;
}
async function matchJson(env,id){
  const m=await getMatch(env,id);if(!m)return null;
  const sets=await rows(env,"SELECT score_a,score_b FROM match_sets WHERE match_id=? ORDER BY set_no",id);
  return {
    id:m.id,divisionId:m.division_id,stage:m.stage,a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",
    courtId:m.court_id||null,refereeId:m.referee_user_id||null,status:m.status==="scheduled"?"wait":m.status==="completed"?"done":m.status,
    current:[Number(m.current_score_a||0),Number(m.current_score_b||0)],
    sets:sets.map(s=>[Number(s.score_a||0),Number(s.score_b||0)]),
    winner:m.winner_team_id||null,version:Number(m.version||1),bracketSlot:m.bracket_slot||null,
    resultReason:m.result_reason||null,resultNote:m.result_note||null
  };
}
async function emitUpdate(env,tournamentId,matchId=null){
  await broadcast(env,"public:state",{tournamentId},"public");
  if(matchId)await broadcast(env,"match:update",{id:matchId,tournamentId},"public");
  if(tournamentId){
    await broadcast(env,"public:state",{tournamentId},tournamentId);
    if(matchId)await broadcast(env,"match:update",{id:matchId,tournamentId},tournamentId);
  }
}
function validateSet(a,b,target,winByTwo){
  const hi=Math.max(a,b),lo=Math.min(a,b);
  return a!==b&&hi>=target&&(!winByTwo||hi-lo>=2);
}
async function saveR2Upload(request,env,folder,maxBytes,allowed){
  const form=await request.formData();
  const file=[...form.values()].find(v=>typeof v==="object"&&v&&typeof v.arrayBuffer==="function");
  if(!file)throw httpError("FILE_REQUIRED",400);
  if(Number(file.size||0)>maxBytes)throw httpError("FILE_TOO_LARGE",413);
  const type=String(file.type||"application/octet-stream");
  if(!allowed.includes(type))throw httpError("INVALID_FILE_TYPE",400);
  const ext={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"}[type]||"bin";
  const key=folder+"/"+uid()+"."+ext;
  await env.MEDIA.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:type},customMetadata:{originalName:String(file.name||"")}});
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
async function handleApi(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();

  if(method==="OPTIONS")return new Response(null,{status:204,headers:corsHeaders(request,env)});
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
    const object=await env.MEDIA.get(key);
    if(!object)return fail("NOT_FOUND",request,env,404);
    const headers=new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control","public, max-age=31536000, immutable");
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
    return ok(await rows(env,"SELECT * FROM sponsors ORDER BY sort_order,name"),request,env);
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
    if(user.role==="organizer"||user.role==="referee"){
      const ids=new Set((await loadAdminState(env,user)).players.map(x=>x.id));
      data=data.filter(x=>ids.has(x.id));
    }else if(user.role==="club_manager"){
      if(!user.clubId)return fail("CLUB_SCOPE_REQUIRED",request,env,403);
      data=data.filter(x=>x.club_id===user.clubId);
    }
    return ok(data.map(x=>({
      ...x,
      phone:user.role==="referee"?"":x.phone,
      active:Boolean(x.active),rating:Number(x.rating||0)
    })),request,env);
  }
  if(path==="/api/players"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer","club_manager");
    const b=await bodyJson(request),fullName=String(b.fullName||"").trim();
    if(!fullName)return fail("NAME_REQUIRED",request,env,400);
    const clubId=user.role==="club_manager"?user.clubId:(b.clubId||user.clubId||null);
    if(user.role==="club_manager"&&!clubId)return fail("CLUB_SCOPE_REQUIRED",request,env,403);
    if(clubId&&!(await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId)))return fail("INVALID_CLUB",request,env,400);
    const id=uid(),rating=user.role==="club_manager"?3:Number(b.rating||3);
    await env.DB.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,nickname,gender,rating,phone,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,1,?,?)")
      .bind(id,clubId,user.id,fullName,String(b.nickname||""),String(b.gender||"other"),rating,String(b.phone||""),nowIso(),nowIso()).run();
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
    const fullName=String(b.fullName??before.full_name).trim(),nickname=String(b.nickname??before.nickname??"");
    const gender=String(b.gender??before.gender??"other");
    const rating=(referee||user.role==="club_manager")?before.rating:Number(b.rating??before.rating??3);
    const phone=referee?before.phone:String(b.phone??before.phone??"");
    const active=referee?before.active:(b.active===undefined?before.active:(asBool(b.active)?1:0));
    await env.DB.prepare("UPDATE players SET full_name=?,nickname=?,gender=?,rating=?,phone=?,active=?,updated_at=? WHERE id=?")
      .bind(fullName,nickname,gender,rating,phone,active,nowIso(),p.id).run();
    const after=await one(env,"SELECT * FROM players WHERE id=?",p.id);await createAudit(env,user,"player",p.id,"UPDATE",before,after);
    return ok(after,request,env);
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
    return ok(await saveR2Upload(request,env,"receipts",8*1024*1024,["image/jpeg","image/png","image/webp","application/pdf"]),request,env,201);
  }

  if(path==="/api/tournaments"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const id=uid(),slug=await nextUniqueSlug(env,"tournaments",name),created=nowIso();
    await env.DB.prepare("INSERT INTO tournaments(id,owner_user_id,name,slug,venue_name,start_at,end_at,status,public_visible,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,user.id,name,slug,String(b.venue||b.venueName||""),b.startAt||null,b.endAt||null,b.status||"draft",asBool(b.publicVisible)?1:0,created,created).run();
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
    const b=await bodyJson(request);
    await env.DB.prepare("UPDATE tournaments SET name=?,venue_name=?,start_at=?,end_at=?,status=?,public_visible=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),String(b.venue??b.venueName??before.venue_name??""),b.startAt??before.start_at,b.endAt??before.end_at,b.status??before.status,b.publicVisible===undefined?before.public_visible:(asBool(b.publicVisible)?1:0),nowIso(),p.id).run();
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
    const id=uid();
    await env.DB.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)")
      .bind(id,p.id,name,b.eventType||"doubles",b.format||"pool_to_knockout",Number(b.bestOf||3),Number(b.pointsToWin||11),asBool(b.winByTwo??true)?1:0,Number(b.advanceCount||2),nowIso()).run();
    const row=await one(env,"SELECT * FROM divisions WHERE id=?",id);await createAudit(env,user,"division",id,"CREATE",null,row);await emitUpdate(env,p.id);
    return ok(row,request,env,201);
  }
  p=route(path,"/api/divisions/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),before=await one(env,"SELECT * FROM divisions WHERE id=?",p.id),b=await bodyJson(request);
    await env.DB.prepare("UPDATE divisions SET name=?,event_type=?,format=?,best_of=?,points_to_win=?,win_by_two=?,advance_count=?,active=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),b.eventType??before.event_type,b.format??before.format,Number(b.bestOf??before.best_of),Number(b.pointsToWin??before.points_to_win),b.winByTwo===undefined?before.win_by_two:(asBool(b.winByTwo)?1:0),Number(b.advanceCount??before.advance_count),b.active===undefined?before.active:(asBool(b.active)?1:0),nowIso(),p.id).run();
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

  p=route(path,"/api/divisions/:id/teams");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const id=uid();await env.DB.prepare("INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id,p.id,name,b.clubId||null,b.seed??null,String(b.group||"A"),"active",nowIso()).run();
    const row=await one(env,"SELECT * FROM teams WHERE id=?",id);await emitUpdate(env,tid);return ok(row,request,env,201);
  }
  p=route(path,"/api/teams/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),tid=await assertTeam(env,user,p.id),before=await one(env,"SELECT * FROM teams WHERE id=?",p.id),b=await bodyJson(request);
    await env.DB.prepare("UPDATE teams SET name=?,club_id=?,seed=?,group_code=?,status=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),b.clubId===undefined?before.club_id:b.clubId,b.seed===undefined?before.seed:b.seed,String(b.group??before.group_code??""),String(b.status??before.status),nowIso(),p.id).run();
    const after=await one(env,"SELECT * FROM teams WHERE id=?",p.id);await emitUpdate(env,tid);return ok(after,request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),tid=await assertTeam(env,user,p.id);await env.DB.prepare("DELETE FROM teams WHERE id=?").bind(p.id).run();await emitUpdate(env,tid);return ok({ok:true},request,env);
  }
  p=route(path,"/api/teams/:id/players");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertTeam(env,user,p.id),b=await bodyJson(request),playerId=String(b.playerId||"");
    if(!playerId||!(await one(env,"SELECT id FROM players WHERE id=?",playerId)))return fail("PLAYER_NOT_FOUND",request,env,404);
    await env.DB.prepare("INSERT OR IGNORE INTO team_players(team_id,player_id) VALUES(?,?)").bind(p.id,playerId).run();await emitUpdate(env,tid);return ok({ok:true},request,env);
  }

  p=route(path,"/api/divisions/:id/matches");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request);
    if(!b.teamAId||!b.teamBId||b.teamAId===b.teamBId)return fail("INVALID_TEAMS",request,env,400);
    const id=uid();
    await env.DB.prepare("INSERT INTO matches(id,division_id,court_id,referee_user_id,team_a_id,team_b_id,stage,scheduled_at,status,version,created_at) VALUES(?,?,?,?,?,?,?,?,?,1,?)")
      .bind(id,p.id,b.courtId||null,b.refereeUserId||null,b.teamAId,b.teamBId,String(b.stage||"Vòng bảng"),b.scheduledAt||null,"scheduled",nowIso()).run();
    const row=await matchJson(env,id);await emitUpdate(env,tid,id);return ok(row,request,env,201);
  }
  p=route(path,"/api/matches/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m))||user.role==="referee")return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    await env.DB.prepare("UPDATE matches SET stage=?,scheduled_at=?,court_id=?,referee_user_id=?,team_a_id=?,team_b_id=?,version=version+1 WHERE id=?")
      .bind(String(b.stage??m.stage),b.scheduledAt??m.scheduled_at,b.courtId===undefined?m.court_id:b.courtId,b.refereeUserId===undefined?m.referee_user_id:b.refereeUserId,b.teamAId??m.team_a_id,b.teamBId??m.team_b_id,p.id).run();
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m))||user.role==="referee")return fail("FORBIDDEN",request,env,403);
    await env.DB.prepare("DELETE FROM matches WHERE id=?").bind(p.id).run();await emitUpdate(env,m.tournament_id,p.id);return ok({ok:true},request,env);
  }
  p=route(path,"/api/matches/:id/assignment");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!requireRole(user,"super_admin","organizer")||!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    if(b.refereeUserId){
      const ref=await one(env,"SELECT * FROM app_users WHERE id=? AND role='referee' AND active=1",b.refereeUserId);
      if(!ref||ref.tournament_id_scope&&ref.tournament_id_scope!==m.tournament_id)return fail("INVALID_REFEREE",request,env,400);
    }
    await env.DB.prepare("UPDATE matches SET court_id=?,referee_user_id=?,scheduled_at=?,version=version+1 WHERE id=?")
      .bind(b.courtId===undefined?m.court_id:b.courtId,b.refereeUserId===undefined?m.referee_user_id:b.refereeUserId,b.scheduledAt===undefined?m.scheduled_at:b.scheduledAt,p.id).run();
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  p=route(path,"/api/matches/:id/point");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),side=String(b.side||""),delta=Number(b.delta);
    if(!["A","B"].includes(side)||![1,-1].includes(delta))return fail("BAD_SCORE_ACTION",request,env,400);
    if(b.expectedVersion!==undefined&&Number(b.expectedVersion)!==Number(m.version))return fail("VERSION_CONFLICT",request,env,409,{currentVersion:Number(m.version)});
    const a=Math.max(0,Number(m.current_score_a||0)+(side==="A"?delta:0)),bb=Math.max(0,Number(m.current_score_b||0)+(side==="B"?delta:0));
    const result=await env.DB.prepare("UPDATE matches SET current_score_a=?,current_score_b=?,status='live',started_at=COALESCE(started_at,?),version=version+1 WHERE id=? AND version=?")
      .bind(a,bb,nowIso(),p.id,m.version).run();
    if(!result.meta?.changes)return fail("VERSION_CONFLICT",request,env,409);
    const fresh=await getMatch(env,p.id);
    await env.DB.prepare("INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)")
      .bind(p.id,user.id,"POINT",JSON.stringify({side,delta,before:[Number(m.current_score_a||0),Number(m.current_score_b||0)],after:[a,bb]}),fresh.version).run();
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  p=route(path,"/api/matches/:id/finish-set");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);if(b.expectedVersion!==undefined&&Number(b.expectedVersion)!==Number(m.version))return fail("VERSION_CONFLICT",request,env,409);
    const a=Number(m.current_score_a||0),bb=Number(m.current_score_b||0);
    if(!validateSet(a,bb,Number(m.points_to_win||11),Boolean(m.win_by_two)))return fail("INVALID_SET_SCORE",request,env,400);
    const count=await one(env,"SELECT COUNT(*) AS n FROM match_sets WHERE match_id=?",p.id),setNo=Number(count?.n||0)+1;
    await env.DB.prepare("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,?,?,?,1)").bind(uid(),p.id,setNo,a,bb).run();
    const setRows=await rows(env,"SELECT score_a,score_b FROM match_sets WHERE match_id=? ORDER BY set_no",p.id);
    let aw=0,bw=0;for(const s of setRows){if(s.score_a>s.score_b)aw++;else bw++}
    const need=Math.floor(Number(m.best_of||3)/2)+1,done=aw>=need||bw>=need,winner=done?(aw>bw?m.team_a_id:m.team_b_id):null;
    await env.DB.prepare("UPDATE matches SET current_score_a=0,current_score_b=0,status=?,winner_team_id=?,completed_at=?,version=version+1 WHERE id=?")
      .bind(done?"completed":"live",winner,done?nowIso():null,p.id).run();
    const fresh=await getMatch(env,p.id);
    await env.DB.prepare("INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)")
      .bind(p.id,user.id,done?"MATCH_FINISH":"SET_FINISH",JSON.stringify({set:[a,bb],setNo,winner}),fresh.version).run();
    if(done&&winner)await advanceBracket(env,p.id,winner);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  p=route(path,"/api/matches/:id/quick-score");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),sets=Array.isArray(b.sets)?b.sets.map(x=>[Number(x[0]||0),Number(x[1]||0)]).filter(x=>x[0]>0||x[1]>0):[];
    if(!sets.length)return fail("NO_SETS_PROVIDED",request,env,400);
    for(const s of sets)if(!validateSet(s[0],s[1],Number(m.points_to_win||11),Boolean(m.win_by_two)))return fail("INVALID_SET_SCORE",request,env,400);
    await env.DB.prepare("DELETE FROM match_sets WHERE match_id=?").bind(p.id).run();
    for(let i=0;i<sets.length;i++)await env.DB.prepare("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,?,?,?,1)").bind(uid(),p.id,i+1,sets[i][0],sets[i][1]).run();
    let aw=0,bw=0;for(const s of sets){if(s[0]>s[1])aw++;else bw++}
    const winner=aw===bw?null:(aw>bw?m.team_a_id:m.team_b_id);
    await env.DB.prepare("UPDATE matches SET current_score_a=0,current_score_b=0,status=?,winner_team_id=?,completed_at=?,version=version+1 WHERE id=?")
      .bind(winner?"completed":"live",winner,winner?nowIso():null,p.id).run();
    const fresh=await getMatch(env,p.id);
    await env.DB.prepare("INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)")
      .bind(p.id,user.id,winner?"MATCH_FINISH":"CORRECTION",JSON.stringify({sets,winner}),fresh.version).run();
    if(winner)await advanceBracket(env,p.id,winner);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  p=route(path,"/api/matches/:id/finish");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),winner=b.winnerTeamId||null;
    if(winner&&![m.team_a_id,m.team_b_id].includes(winner))return fail("INVALID_WINNER",request,env,400);
    let finalWinner=winner;
    if(!finalWinner){
      const sets=await rows(env,"SELECT score_a,score_b FROM match_sets WHERE match_id=?",p.id);let aw=0,bw=0;for(const s of sets){if(s.score_a>s.score_b)aw++;else if(s.score_b>s.score_a)bw++}
      finalWinner=aw===bw?null:(aw>bw?m.team_a_id:m.team_b_id);
    }
    if(!finalWinner)return fail("WINNER_REQUIRED",request,env,400);
    await env.DB.prepare("UPDATE matches SET winner_team_id=?,status='completed',completed_at=?,current_score_a=0,current_score_b=0,version=version+1 WHERE id=?").bind(finalWinner,nowIso(),p.id).run();
    const fresh=await getMatch(env,p.id);await env.DB.prepare("INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)").bind(p.id,user.id,"MATCH_FINISH",JSON.stringify({winner:finalWinner}),fresh.version).run();
    await advanceBracket(env,p.id,finalWinner);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
  }
  p=route(path,"/api/matches/:id/special-result");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),m=await getMatch(env,p.id);if(!m)return fail("NOT_FOUND",request,env,404);if(!(await authorizeMatch(env,user,m)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),winner=b.winnerTeamId,reason=String(b.reason||""),note=String(b.note||"");
    if(![m.team_a_id,m.team_b_id].includes(winner)||!["walkover","no_show","retired","injury","disqualified"].includes(reason))return fail("INVALID_SPECIAL_RESULT",request,env,400);
    await env.DB.prepare("UPDATE matches SET winner_team_id=?,status='completed',result_reason=?,result_note=?,completed_at=?,version=version+1 WHERE id=?").bind(winner,reason,note,nowIso(),p.id).run();
    const fresh=await getMatch(env,p.id);await env.DB.prepare("INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)").bind(p.id,user.id,"MATCH_FINISH",JSON.stringify({winner,reason,note}),fresh.version).run();
    await advanceBracket(env,p.id,winner);
    await emitUpdate(env,m.tournament_id,p.id);return ok(await matchJson(env,p.id),request,env);
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
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),courts=await rows(env,"SELECT id FROM courts WHERE tournament_id=? AND active=1 ORDER BY sort_order,name",tid);
    if(!courts.length)return fail("NO_COURTS",request,env,400);
    const matches=await rows(env,"SELECT id FROM matches WHERE division_id=? AND status IN ('scheduled','ready') ORDER BY scheduled_at,created_at",p.id);
    for(let i=0;i<matches.length;i++)await env.DB.prepare("UPDATE matches SET court_id=?,version=version+1 WHERE id=?").bind(courts[i%courts.length].id,matches[i].id).run();
    await emitUpdate(env,tid);return ok({ok:true,assigned:matches.length},request,env);
  }

  if(path==="/api/users"&&method==="GET"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    let data=await rows(env,"SELECT id,email,display_name,role,active,tournament_id_scope,club_id,created_at FROM app_users ORDER BY display_name");
    if(user.role==="organizer"){
      const owned=new Set((await loadAdminState(env,user)).tournaments.map(x=>x.id));
      data=data.filter(x=>x.id===user.id||(x.role==="referee"&&x.tournament_id_scope&&owned.has(x.tournament_id_scope)));
    }
    return ok(data.map(publicUser),request,env);
  }
  if(path==="/api/users"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");const b=await bodyJson(request);
    const email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),password=String(b.password||""),role=String(b.role||"referee");
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
    const id=uid(),hash=await hashPassword(password);
    await env.DB.prepare("INSERT INTO app_users(id,email,display_name,role,active,password_hash,auth_version,tournament_id_scope,club_id,created_at,updated_at) VALUES(?,?,?,?,1,?,0,?,?,?,?)")
      .bind(id,email,name,role,hash,tournamentId,clubId,nowIso(),nowIso()).run();
    const created=await one(env,"SELECT * FROM app_users WHERE id=?",id);
    await createAudit(env,user,"user",id,"CREATE_CHILD_ACCOUNT",null,publicUser(created));
    return ok(publicUser(created),request,env,201);
  }
  p=route(path,"/api/users/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const target=await one(env,"SELECT * FROM app_users WHERE id=?",p.id);if(!target)return fail("NOT_FOUND",request,env,404);
    const b=await bodyJson(request);
    if(p.id===user.id&&b.active===false)return fail("CANNOT_DISABLE_SELF",request,env,400);
    if(user.role==="organizer"){
      if(target.role!=="referee")return fail("ORGANIZER_CAN_ONLY_EDIT_REFEREE",request,env,403);
      if(!target.tournament_id_scope||!(await canManageTournament(env,user,target.tournament_id_scope)))return fail("TOURNAMENT_SCOPE_FORBIDDEN",request,env,403);
    }
    if(target.role==="super_admin"&&target.id!==user.id)return fail("OWNER_ACCOUNT_PROTECTED",request,env,403);
    const role=user.role==="organizer"?"referee":(target.role==="super_admin"?"super_admin":(b.role===undefined?target.role:String(b.role)));
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
    await env.DB.prepare("UPDATE app_users SET email=?,display_name=?,role=?,active=?,club_id=?,tournament_id_scope=?,password_hash=?,auth_version=?,updated_at=? WHERE id=?")
      .bind(email,name,role,active,clubId,tournamentId,hash,authVersion,nowIso(),p.id).run();
    const updated=await one(env,"SELECT * FROM app_users WHERE id=?",p.id);
    await createAudit(env,user,"user",p.id,"UPDATE_CHILD_ACCOUNT",publicUser(target),publicUser(updated),b.password?"Password reset":null);
    return ok(publicUser(updated),request,env);
  }
  if(path==="/api/users/referees"&&method==="GET"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    let refs=await rows(env,"SELECT id,email,display_name,role,active,tournament_id_scope,club_id,created_at FROM app_users WHERE role='referee' ORDER BY display_name");
    if(user.role==="organizer"){
      const owned=new Set((await loadAdminState(env,user)).tournaments.map(x=>x.id));refs=refs.filter(x=>!x.tournament_id_scope||owned.has(x.tournament_id_scope));
    }
    return ok(refs.map(publicUser),request,env);
  }
  if(path==="/api/users/referees"&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");const b=await bodyJson(request);b.role="referee";
    const email=String(b.email||"").trim().toLowerCase(),name=String(b.name||"").trim(),password=String(b.password||""),tournamentId=b.tournamentId||null;
    if(!email||!name||password.length<12)return fail("FIELDS_REQUIRED",request,env,400);
    if(user.role==="organizer"){if(!tournamentId)return fail("TOURNAMENT_REQUIRED",request,env,400);await assertTournament(env,user,tournamentId)}
    const id=uid(),hash=await hashPassword(password);
    try{await env.DB.prepare("INSERT INTO app_users(id,email,display_name,role,active,password_hash,auth_version,tournament_id_scope,created_at,updated_at) VALUES(?,?,?,'referee',1,?,0,?,?,?)").bind(id,email,name,hash,tournamentId,nowIso(),nowIso()).run()}
    catch{return fail("EMAIL_EXISTS",request,env,409)}
    return ok(publicUser(await one(env,"SELECT * FROM app_users WHERE id=?",id)),request,env,201);
  }
  p=route(path,"/api/users/referees/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const target=await one(env,"SELECT * FROM app_users WHERE id=? AND role='referee'",p.id);if(!target)return fail("NOT_FOUND",request,env,404);const b=await bodyJson(request);
    const scope=b.tournamentId===undefined?target.tournament_id_scope:b.tournamentId;if(user.role==="organizer"&&scope)await assertTournament(env,user,scope);
    let hash=target.password_hash,version=Number(target.auth_version||0);if(b.password){if(String(b.password).length<12)return fail("WEAK_PASSWORD",request,env,400);hash=await hashPassword(String(b.password));version++}
    await env.DB.prepare("UPDATE app_users SET display_name=?,active=?,tournament_id_scope=?,password_hash=?,auth_version=?,updated_at=? WHERE id=?")
      .bind(String(b.name??target.display_name),b.active===undefined?target.active:(asBool(b.active)?1:0),scope,hash,version,nowIso(),p.id).run();
    return ok(publicUser(await one(env,"SELECT * FROM app_users WHERE id=?",p.id)),request,env);
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
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request),id=uid();
    await env.DB.prepare("INSERT INTO registrations(id,division_id,team_id,status,payment_status,amount,checkin_token,created_at) VALUES(?,?,?,?,?,?,?,?)").bind(id,p.id,b.teamId||null,b.status||"pending",b.paymentStatus||"unpaid",Number(b.amount||0),uid(),nowIso()).run();await emitUpdate(env,tid);return ok(await one(env,"SELECT * FROM registrations WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/registrations/:id/checkin");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);await requireAdminRole(user,"super_admin","organizer");
    const r=await one(env,"SELECT r.*,d.tournament_id FROM registrations r JOIN divisions d ON d.id=r.division_id WHERE r.id=?",p.id);
    if(!r)return fail("NOT_FOUND",request,env,404);
    if(user.role==="organizer")await assertTournament(env,user,r.tournament_id);
    await env.DB.prepare("UPDATE registrations SET checked_in_at=?,checked_in_by=? WHERE id=?").bind(nowIso(),user.id,p.id).run();
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
      if(url.protocol==="http:"){
        url.protocol="https:";
        return Response.redirect(url.toString(),308);
      }
      if(url.pathname!=="/api"&&!url.pathname.startsWith("/api/")&&env.ASSETS){
        return env.ASSETS.fetch(request);
      }
      return await handleApi(request,env);
    }catch(e){
      const status=Number(e?.status||500),code=status===500?"INTERNAL_ERROR":String(e?.message||"REQUEST_FAILED");
      if(status===500)console.error(e);
      return fail(code,request,env,status);
    }
  }
};
