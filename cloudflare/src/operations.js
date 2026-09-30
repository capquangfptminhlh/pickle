import QRCode from "qrcode";
import {authenticate,canManageTournament,tournamentForDivision,tournamentForCourt,canEditPlayer} from "./auth.js";
import {ok,fail,bodyJson,route,uid,slugify,nowIso,safeJsonParse,publicUser} from "./util.js";
import {loadAdminState} from "./state.js";
import {generateBracket,rewindBracket} from "./bracket.js";
import {broadcast} from "./realtime.js";

async function rows(env,sql,...args){const r=await env.DB.prepare(sql).bind(...args).all();return r.results||[]}
async function one(env,sql,...args){return env.DB.prepare(sql).bind(...args).first()}
function httpError(code,status=400){return Object.assign(new Error(code),{status})}
async function userRequired(request,env){
  const u=await authenticate(request,env);if(!u)throw httpError("AUTH_REQUIRED",401);return u;
}
function hasRole(user,...roles){return Boolean(user&&roles.includes(user.role))}
async function assertTournament(env,user,id){
  if(!(await canManageTournament(env,user,id)))throw httpError("TOURNAMENT_SCOPE_FORBIDDEN",403);
}
async function assertDivision(env,user,id){
  const tid=await tournamentForDivision(env,id);if(!tid)throw httpError("NOT_FOUND",404);await assertTournament(env,user,tid);return tid;
}
async function registrationWithTournament(env,id){
  return one(env,"SELECT r.*,d.tournament_id,t.club_id AS team_club_id FROM registrations r JOIN divisions d ON d.id=r.division_id LEFT JOIN teams t ON t.id=r.team_id WHERE r.id=?",id);
}
async function paymentWithTournament(env,id){
  return one(env,"SELECT p.*,d.tournament_id,t.club_id AS team_club_id FROM payment_records p JOIN registrations r ON r.id=p.registration_id JOIN divisions d ON d.id=r.division_id LEFT JOIN teams t ON t.id=r.team_id WHERE p.id=?",id);
}
async function emit(env,event,payload={},room="public"){
  try{await broadcast(env,event,payload,room)}catch{}
}
async function getOrCreateClub(env,name){
  const clean=String(name||"").trim();if(!clean)return null;
  let c=await one(env,"SELECT * FROM clubs WHERE lower(name)=lower(?) LIMIT 1",clean);
  if(c)return c;
  const id=uid(),base=slugify(clean);let slug=base,n=2;
  while(await one(env,"SELECT id FROM clubs WHERE slug=?",slug))slug=base+"-"+n++;
  await env.DB.prepare("INSERT INTO clubs(id,name,slug,city,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").bind(id,clean,slug,"",nowIso(),nowIso()).run();
  return one(env,"SELECT * FROM clubs WHERE id=?",id);
}
function genderValue(v){
  const s=String(v||"").trim().toLowerCase();
  if(["male","nam","m"].includes(s))return "male";
  if(["female","nữ","nu","f"].includes(s))return "female";
  if(s==="other")return "other";
  return "other";
}
function dataSvg(svg){return "data:image/svg+xml;charset=utf-8,"+encodeURIComponent(svg)}
async function scopeRegistration(env,user,r){
  if(!r)return false;
  if(user.role==="super_admin")return true;
  if(user.role==="organizer")return canManageTournament(env,user,r.tournament_id);
  return false;
}
async function scopeClub(user,clubId){
  if(user.role==="super_admin")return true;
  if(user.role==="club_manager")return Boolean(user.clubId&&user.clubId===clubId);
  if(user.role==="finance")return !user.clubId||user.clubId===clubId;
  return false;
}
async function eventWithClub(env,id){return one(env,"SELECT * FROM club_events WHERE id=?",id)}
async function bookingWithTournament(env,id){
  return one(env,"SELECT b.*,c.tournament_id FROM court_bookings b JOIN courts c ON c.id=b.court_id WHERE b.id=?",id);
}
async function nextTournamentSlug(env,name){
  const base=slugify(name);let s=base,n=2;
  while(await one(env,"SELECT id FROM tournaments WHERE slug=?",s))s=base+"-"+n++;
  return s;
}
async function matchView(env,id){
  const m=await one(env,"SELECT * FROM matches WHERE id=?",id);if(!m)return null;
  const ss=await rows(env,"SELECT score_a,score_b FROM match_sets WHERE match_id=? ORDER BY set_no",id);
  return {id:m.id,divisionId:m.division_id,a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",stage:m.stage,status:m.status==="scheduled"?"wait":m.status==="completed"?"done":m.status,current:[Number(m.current_score_a||0),Number(m.current_score_b||0)],sets:ss.map(x=>[Number(x.score_a),Number(x.score_b)]),winner:m.winner_team_id||null,version:Number(m.version||1),refereeId:m.referee_user_id||null,courtId:m.court_id||null,bracketSlot:m.bracket_slot||null};
}

export async function handleOperations(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
  let p;

  if(path==="/api/import/players"&&method==="POST"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","organizer"))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),items=Array.isArray(b.rows)?b.rows:[];
    if(!items.length||items.length>5000)return fail("INVALID_IMPORT_SIZE",request,env,400);
    let created=0,updated=0;const ids=[];
    for(const r of items){
      const name=String(r.fullName||r.name||"").trim();if(!name)continue;
      const existing=await one(env,"SELECT * FROM players WHERE lower(full_name)=lower(?) LIMIT 1",name);
      const club=r.clubId?await one(env,"SELECT * FROM clubs WHERE id=?",r.clubId):await getOrCreateClub(env,r.club);
      const avatar=String(r.avatarUrl||r.avatar_url||r.avatar||"").trim();
      if(existing){
        await env.DB.prepare("UPDATE players SET nickname=?,gender=?,rating=?,phone=?,club_id=COALESCE(?,club_id),avatar_url=CASE WHEN ?<>'' THEN ? ELSE avatar_url END,active=1,updated_at=? WHERE id=?")
          .bind(String(r.nickname??existing.nickname??""),genderValue(r.gender||existing.gender),Number(r.rating||existing.rating||3),String(r.phone??existing.phone??""),club?.id||null,avatar,avatar,nowIso(),existing.id).run();
        ids.push(existing.id);updated++;continue;
      }
      const id=uid();
      await env.DB.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,nickname,gender,rating,phone,avatar_url,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)")
        .bind(id,club?.id||null,user.id,name,String(r.nickname||""),genderValue(r.gender),Number(r.rating)||3,String(r.phone||""),avatar||null,nowIso(),nowIso()).run();
      ids.push(id);created++;
    }
    return ok({created,updated,ids},request,env,201);
  }

  p=route(path,"/api/divisions/:id/import-teams");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),b=await bodyJson(request),items=Array.isArray(b.rows)?b.rows:[];
    if(!items.length||items.length>5000)return fail("INVALID_IMPORT_SIZE",request,env,400);
    let created=0,linkedPlayers=0;
    for(const r of items){
      const name=String(r.name||r.team||"").trim();if(!name)continue;
      const club=r.clubId?await one(env,"SELECT * FROM clubs WHERE id=?",r.clubId):await getOrCreateClub(env,r.club);
      const teamId=uid();
      await env.DB.prepare("INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,'active',?)")
        .bind(teamId,p.id,name,club?.id||null,Number(r.seed)||null,String(r.group||"A"),nowIso()).run();
      for(const rawName of [r.player1,r.player2,r.player3,r.player4].filter(Boolean)){
        const playerName=String(rawName).trim();if(!playerName)continue;
        let pl=await one(env,"SELECT * FROM players WHERE lower(full_name)=lower(?) LIMIT 1",playerName);
        if(!pl){
          const playerId=uid();
          await env.DB.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,gender,rating,active,created_at,updated_at) VALUES(?,?,?,?,?,3,1,?,?)")
            .bind(playerId,club?.id||null,user.id,playerName,"other",nowIso(),nowIso()).run();
          pl=await one(env,"SELECT * FROM players WHERE id=?",playerId);
        }
        await env.DB.prepare("INSERT OR IGNORE INTO team_players(team_id,player_id) VALUES(?,?)").bind(teamId,pl.id).run();
        linkedPlayers++;
      }
      created++;
    }
    await emit(env,"public:state",{tournamentId:tid});
    return ok({created,linkedPlayers},request,env,201);
  }

  p=route(path,"/api/players/:id/rating-adjust");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","organizer")||!(await canEditPlayer(env,user,p.id)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),delta=Number(b.delta),reason=String(b.reason||"").trim();
    if(!Number.isFinite(delta)||Math.abs(delta)>1||!reason)return fail("DELTA_AND_REASON_REQUIRED",request,env,400);
    const before=await one(env,"SELECT rating FROM players WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    const oldRating=Number(before.rating||3),newRating=Math.max(0,Math.round((oldRating+delta)*1000)/1000);
    await env.DB.prepare("UPDATE players SET rating=?,updated_at=? WHERE id=?").bind(newRating,nowIso(),p.id).run();
    await env.DB.prepare("INSERT INTO rating_history(id,player_id,before_rating,delta,after_rating,reason,created_at) VALUES(?,?,?,?,?,?,?)").bind(uid(),p.id,oldRating,delta,newRating,reason,nowIso()).run();
    return ok({id:p.id,rating:newRating,beforeRating:oldRating,delta,reason},request,env);
  }

  p=route(path,"/api/clubs/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),before=await one(env,"SELECT * FROM clubs WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    if(!hasRole(user,"super_admin","organizer","club_manager"))return fail("FORBIDDEN",request,env,403);
    if(user.role==="club_manager"&&user.clubId!==p.id)return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    await env.DB.prepare("UPDATE clubs SET name=?,city=?,active=?,updated_at=? WHERE id=?").bind(String(b.name??before.name),String(b.city??before.city??""),b.active===undefined?before.active:(b.active?1:0),nowIso(),p.id).run();
    return ok(await one(env,"SELECT * FROM clubs WHERE id=?",p.id),request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env);if(!hasRole(user,"super_admin","organizer"))return fail("FORBIDDEN",request,env,403);
    const before=await one(env,"SELECT * FROM clubs WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    await env.DB.prepare("UPDATE clubs SET active=0,updated_at=? WHERE id=?").bind(nowIso(),p.id).run();return ok({ok:true},request,env);
  }

  if(path==="/api/sponsors"&&method==="GET"){
    await userRequired(request,env);return ok(await rows(env,"SELECT * FROM sponsors ORDER BY sort_order,name"),request,env);
  }
  if(path==="/api/sponsors"&&method==="POST"){
    const user=await userRequired(request,env);if(!hasRole(user,"super_admin","organizer"))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),name=String(b.name||"").trim(),tid=b.tournamentId||null;if(!name)return fail("NAME_REQUIRED",request,env,400);
    if(tid&&user.role==="organizer")await assertTournament(env,user,tid);
    const id=uid();await env.DB.prepare("INSERT INTO sponsors(id,tournament_id,name,logo_url,website_url,tier,sort_order) VALUES(?,?,?,?,?,?,?)").bind(id,tid,name,b.logoUrl||null,b.websiteUrl||null,b.tier||null,Number(b.sortOrder||0)).run();
    return ok(await one(env,"SELECT * FROM sponsors WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/sponsors/:id");
  if(p&&["PATCH","DELETE"].includes(method)){
    const user=await userRequired(request,env),before=await one(env,"SELECT * FROM sponsors WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    if(!hasRole(user,"super_admin","organizer"))return fail("FORBIDDEN",request,env,403);
    if(user.role==="organizer"&&before.tournament_id)await assertTournament(env,user,before.tournament_id);
    if(method==="DELETE"){await env.DB.prepare("DELETE FROM sponsors WHERE id=?").bind(p.id).run();return ok({ok:true},request,env)}
    const b=await bodyJson(request);
    await env.DB.prepare("UPDATE sponsors SET name=?,logo_url=?,website_url=?,tier=?,sort_order=? WHERE id=?").bind(String(b.name??before.name),b.logoUrl??b.logo_url??before.logo_url,b.websiteUrl??b.website_url??before.website_url,b.tier??before.tier,Number(b.sortOrder??b.sort_order??before.sort_order),p.id).run();
    return ok(await one(env,"SELECT * FROM sponsors WHERE id=?",p.id),request,env);
  }

  if(path==="/api/posts"&&method==="GET"){
    await userRequired(request,env);return ok(await rows(env,"SELECT * FROM content_posts ORDER BY created_at DESC"),request,env);
  }
  if(path==="/api/posts"&&method==="POST"){
    const user=await userRequired(request,env);if(!hasRole(user,"super_admin","organizer"))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),title=String(b.title||"").trim();if(!title)return fail("TITLE_REQUIRED",request,env,400);
    const tid=b.tournamentId||null;if(tid&&user.role==="organizer")await assertTournament(env,user,tid);
    const id=uid(),base=slugify(b.slug||title);let slug=base,n=2;while(await one(env,"SELECT id FROM content_posts WHERE slug=?",slug))slug=base+"-"+n++;
    const status=["draft","published","archived"].includes(b.status)?b.status:"draft";
    await env.DB.prepare("INSERT INTO content_posts(id,tournament_id,title,slug,excerpt,body,cover_url,status,published_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,tid,title,slug,String(b.excerpt||""),String(b.body||""),b.coverUrl||null,status,status==="published"?nowIso():null,user.id,nowIso(),nowIso()).run();
    return ok(await one(env,"SELECT * FROM content_posts WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/posts/:id");
  if(p&&["PATCH","DELETE"].includes(method)){
    const user=await userRequired(request,env),before=await one(env,"SELECT * FROM content_posts WHERE id=?",p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    if(!hasRole(user,"super_admin","organizer"))return fail("FORBIDDEN",request,env,403);
    if(user.role==="organizer"&&before.tournament_id)await assertTournament(env,user,before.tournament_id);
    if(method==="DELETE"){await env.DB.prepare("DELETE FROM content_posts WHERE id=?").bind(p.id).run();return ok({ok:true},request,env)}
    const b=await bodyJson(request),status=b.status??before.status;
    await env.DB.prepare("UPDATE content_posts SET title=?,excerpt=?,body=?,cover_url=?,status=?,published_at=?,updated_at=? WHERE id=?")
      .bind(String(b.title??before.title),String(b.excerpt??before.excerpt??""),String(b.body??before.body??""),b.coverUrl??before.cover_url,status,status==="published"?(before.published_at||nowIso()):before.published_at,nowIso(),p.id).run();
    return ok(await one(env,"SELECT * FROM content_posts WHERE id=?",p.id),request,env);
  }

  if(path==="/api/club-events"&&method==="GET"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager","finance"))return fail("FORBIDDEN",request,env,403);
    let clubId=url.searchParams.get("clubId")||null;
    if(user.role==="club_manager"){
      if(!user.clubId)return ok([],request,env);
      if(clubId&&clubId!==user.clubId)return fail("FORBIDDEN",request,env,403);
      clubId=user.clubId;
    }else if(user.role==="finance"&&user.clubId){
      if(clubId&&clubId!==user.clubId)return fail("FORBIDDEN",request,env,403);
      clubId=user.clubId;
    }
    const data=clubId?await rows(env,"SELECT * FROM club_events WHERE club_id=? ORDER BY start_at DESC",clubId):await rows(env,"SELECT * FROM club_events ORDER BY start_at DESC");
    return ok(data,request,env);
  }
  if(path==="/api/club-events"&&method==="POST"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager"))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),clubId=user.role==="club_manager"?user.clubId:(b.clubId||null);
    if(!clubId)return fail("CLUB_REQUIRED",request,env,400);
    if(!(await scopeClub(user,clubId)))return fail("FORBIDDEN",request,env,403);
    const title=String(b.title||"").trim(),start=String(b.startAt||"");if(!title||!start)return fail("FIELDS_REQUIRED",request,env,400);
    if(b.endAt&&new Date(b.endAt)<=new Date(start))return fail("INVALID_EVENT_TIME",request,env,400);
    const id=uid();await env.DB.prepare("INSERT INTO club_events(id,club_id,title,event_type,venue,start_at,end_at,max_participants,fee,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,clubId,title,b.eventType||"social",String(b.venue||""),start,b.endAt||null,b.maxParticipants?Number(b.maxParticipants):null,Number(b.fee||0),b.status||"scheduled",user.id,nowIso(),nowIso()).run();
    return ok(await one(env,"SELECT * FROM club_events WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/club-events/:id");
  if(p&&["PATCH","DELETE"].includes(method)){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager"))return fail("FORBIDDEN",request,env,403);
    const before=await eventWithClub(env,p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    if(!(await scopeClub(user,before.club_id)))return fail("FORBIDDEN",request,env,403);
    if(method==="DELETE"){
      await env.DB.prepare("UPDATE club_events SET status='cancelled',updated_at=? WHERE id=?").bind(nowIso(),p.id).run();
      return ok({mode:"cancelled",entity:await eventWithClub(env,p.id)},request,env);
    }
    const b=await bodyJson(request),start=b.startAt??before.start_at,end=b.endAt===undefined?before.end_at:b.endAt;if(end&&new Date(end)<=new Date(start))return fail("INVALID_EVENT_TIME",request,env,400);
    await env.DB.prepare("UPDATE club_events SET title=?,event_type=?,venue=?,start_at=?,end_at=?,max_participants=?,fee=?,status=?,updated_at=? WHERE id=?")
      .bind(String(b.title??before.title),b.eventType??before.event_type,String(b.venue??before.venue??""),start,end,b.maxParticipants===undefined?before.max_participants:(b.maxParticipants?Number(b.maxParticipants):null),Number(b.fee??before.fee),b.status??before.status,nowIso(),p.id).run();
    return ok(await eventWithClub(env,p.id),request,env);
  }
  p=route(path,"/api/club-events/:id/attendance");
  if(p&&method==="GET"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager"))return fail("FORBIDDEN",request,env,403);
    const event=await eventWithClub(env,p.id);if(!event)return fail("NOT_FOUND",request,env,404);if(!(await scopeClub(user,event.club_id)))return fail("FORBIDDEN",request,env,403);
    return ok(await rows(env,"SELECT a.*,p.full_name,p.avatar_url,p.rating FROM club_event_attendance a JOIN players p ON p.id=a.player_id WHERE a.event_id=? ORDER BY p.full_name",p.id),request,env);
  }
  if(p&&method==="POST"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager"))return fail("FORBIDDEN",request,env,403);
    const event=await eventWithClub(env,p.id);if(!event)return fail("NOT_FOUND",request,env,404);if(!(await scopeClub(user,event.club_id)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),playerId=String(b.playerId||"");if(!playerId)return fail("PLAYER_REQUIRED",request,env,400);
    const player=await one(env,"SELECT id,club_id FROM players WHERE id=? AND active=1",playerId);
    if(!player||player.club_id!==event.club_id)return fail("PLAYER_CLUB_MISMATCH",request,env,400);
    await env.DB.prepare("INSERT INTO club_event_attendance(event_id,player_id,status,created_at) VALUES(?,?,'registered',?) ON CONFLICT(event_id,player_id) DO UPDATE SET status='registered',checked_in_at=NULL,checked_in_by=NULL").bind(p.id,playerId,nowIso()).run();
    return ok({ok:true},request,env,201);
  }
  p=route(path,"/api/club-events/:id/attendance/:playerId");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager"))return fail("FORBIDDEN",request,env,403);
    const event=await eventWithClub(env,p.id);if(!event)return fail("NOT_FOUND",request,env,404);if(!(await scopeClub(user,event.club_id)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),status=String(b.status||"");if(!["registered","attended","absent","cancelled"].includes(status))return fail("INVALID_STATUS",request,env,400);
    await env.DB.prepare("UPDATE club_event_attendance SET status=?,checked_in_at=?,checked_in_by=? WHERE event_id=? AND player_id=?").bind(status,status==="attended"?nowIso():null,status==="attended"?user.id:null,p.id,p.playerId).run();
    return ok({ok:true},request,env);
  }

  if(path==="/api/club-transactions"&&method==="GET"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager","finance"))return fail("FORBIDDEN",request,env,403);
    let clubId=url.searchParams.get("clubId")||null;
    if(user.role==="club_manager"){
      if(!user.clubId)return ok([],request,env);
      if(clubId&&clubId!==user.clubId)return fail("FORBIDDEN",request,env,403);
      clubId=user.clubId;
    }else if(user.role==="finance"&&user.clubId){
      if(clubId&&clubId!==user.clubId)return fail("FORBIDDEN",request,env,403);
      clubId=user.clubId;
    }
    const data=clubId?await rows(env,"SELECT * FROM club_transactions WHERE club_id=? ORDER BY occurred_at DESC",clubId):await rows(env,"SELECT * FROM club_transactions ORDER BY occurred_at DESC");
    return ok(data,request,env);
  }
  if(path==="/api/club-transactions"&&method==="POST"){
    const user=await userRequired(request,env);
    if(!hasRole(user,"super_admin","club_manager","finance"))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    const clubId=user.role==="club_manager"?user.clubId:(user.role==="finance"&&user.clubId?user.clubId:(b.clubId||null));
    if(!clubId||!(await scopeClub(user,clubId)))return fail("FORBIDDEN",request,env,403);
    if(!["income","expense"].includes(b.direction)||!(Number(b.amount)>0))return fail("INVALID_TRANSACTION",request,env,400);
    const id=uid();await env.DB.prepare("INSERT INTO club_transactions(id,club_id,direction,category,amount,note,occurred_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id,clubId,b.direction,String(b.category||"other"),Number(b.amount),String(b.note||""),b.occurredAt||nowIso(),user.id,nowIso()).run();
    return ok(await one(env,"SELECT * FROM club_transactions WHERE id=?",id),request,env,201);
  }

  if(path==="/api/bookings"&&method==="GET"){
    const user=await userRequired(request,env);if(!hasRole(user,"super_admin"))return fail("FORBIDDEN",request,env,403);
    return ok(await rows(env,"SELECT b.*,c.name AS court_name,t.name AS tournament_name FROM court_bookings b JOIN courts c ON c.id=b.court_id JOIN tournaments t ON t.id=c.tournament_id ORDER BY b.start_at DESC"),request,env);
  }
  if(path==="/api/bookings"&&method==="POST"){
    const user=await userRequired(request,env);if(!hasRole(user,"super_admin"))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);if(!b.courtId||!b.title||!b.startAt||!b.endAt)return fail("FIELDS_REQUIRED",request,env,400);
    if(new Date(b.endAt)<=new Date(b.startAt))return fail("INVALID_BOOKING_TIME",request,env,400);
    const overlap=await one(env,"SELECT id FROM court_bookings WHERE court_id=? AND status<>'cancelled' AND start_at<? AND end_at>? LIMIT 1",b.courtId,b.endAt,b.startAt);if(overlap)return fail("BOOKING_CONFLICT",request,env,409);
    const id=uid();await env.DB.prepare("INSERT INTO court_bookings(id,court_id,title,contact_name,contact_phone,start_at,end_at,status,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,b.courtId,String(b.title),String(b.contactName||""),String(b.contactPhone||""),b.startAt,b.endAt,b.status||"confirmed",String(b.notes||""),user.id,nowIso()).run();
    return ok(await one(env,"SELECT * FROM court_bookings WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/bookings/:id");
  if(p&&["PATCH","DELETE"].includes(method)){
    const user=await userRequired(request,env);if(!hasRole(user,"super_admin"))return fail("FORBIDDEN",request,env,403);
    const before=await bookingWithTournament(env,p.id);if(!before)return fail("NOT_FOUND",request,env,404);
    if(method==="DELETE"){await env.DB.prepare("DELETE FROM court_bookings WHERE id=?").bind(p.id).run();return ok({ok:true},request,env)}
    const b=await bodyJson(request),start=b.startAt??before.start_at,end=b.endAt??before.end_at;if(new Date(end)<=new Date(start))return fail("INVALID_BOOKING_TIME",request,env,400);
    await env.DB.prepare("UPDATE court_bookings SET title=?,contact_name=?,contact_phone=?,start_at=?,end_at=?,status=?,notes=? WHERE id=?")
      .bind(String(b.title??before.title),String(b.contactName??before.contact_name??""),String(b.contactPhone??before.contact_phone??""),start,end,b.status??before.status,String(b.notes??before.notes??""),p.id).run();
    return ok(await bookingWithTournament(env,p.id),request,env);
  }

  p=route(path,"/api/divisions/:id/full");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),before=await one(env,"SELECT * FROM divisions WHERE id=?",p.id),b=await bodyJson(request);
    await env.DB.prepare("UPDATE divisions SET name=?,event_type=?,format=?,best_of=?,points_to_win=?,win_by_two=?,advance_count=?,active=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),b.eventType??before.event_type,b.format??before.format,Number(b.bestOf??before.best_of),Number(b.pointsToWin??before.points_to_win),b.winByTwo===undefined?before.win_by_two:(b.winByTwo?1:0),Number(b.advanceCount??before.advance_count),b.active===undefined?before.active:(b.active?1:0),nowIso(),p.id).run();
    await emit(env,"public:state",{tournamentId:tid});return ok(await one(env,"SELECT * FROM divisions WHERE id=?",p.id),request,env);
  }

  p=route(path,"/api/registrations/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),r=await registrationWithTournament(env,p.id);if(!r)return fail("NOT_FOUND",request,env,404);if(!(await scopeRegistration(env,user,r)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    await env.DB.prepare("UPDATE registrations SET status=?,payment_status=?,amount=? WHERE id=?").bind(b.status??r.status,b.paymentStatus??r.payment_status,b.amount===undefined?r.amount:Number(b.amount),p.id).run();
    return ok(await registrationWithTournament(env,p.id),request,env);
  }
  if(p&&method==="DELETE"){
    const user=await userRequired(request,env),r=await registrationWithTournament(env,p.id);if(!r)return fail("NOT_FOUND",request,env,404);if(!(await scopeRegistration(env,user,r)))return fail("FORBIDDEN",request,env,403);
    const pay=await one(env,"SELECT id FROM payment_records WHERE registration_id=? LIMIT 1",p.id);
    if(r.checked_in_at||pay){await env.DB.prepare("UPDATE registrations SET status='cancelled' WHERE id=?").bind(p.id).run();return ok({mode:"cancelled",entity:await registrationWithTournament(env,p.id)},request,env)}
    await env.DB.prepare("DELETE FROM registrations WHERE id=?").bind(p.id).run();return ok({mode:"deleted"},request,env);
  }
  p=route(path,"/api/registrations/:id/checkin-qr");
  if(p&&method==="GET"){
    const user=await userRequired(request,env),r=await registrationWithTournament(env,p.id);if(!r)return fail("NOT_FOUND",request,env,404);if(!(await scopeRegistration(env,user,r)))return fail("FORBIDDEN",request,env,403);
    let token=r.checkin_token;if(!token){token=uid();await env.DB.prepare("UPDATE registrations SET checkin_token=? WHERE id=?").bind(token,p.id).run()}
    const app=String(env.PUBLIC_APP_URL||"https://capquangfptminhlh.github.io/pickle").replace(/\/$/,""),target=app+"/checkin.html?token="+encodeURIComponent(token);
    const svg=await QRCode.toString(target,{type:"svg",margin:2,width:420,errorCorrectionLevel:"M"});
    return ok({token,url:target,dataUrl:dataSvg(svg)},request,env);
  }

  p=route(path,"/api/registrations/:id/payment");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),r=await registrationWithTournament(env,p.id);if(!r)return fail("NOT_FOUND",request,env,404);
    if(!hasRole(user,"super_admin","organizer","finance"))return fail("FORBIDDEN",request,env,403);
    if(user.role==="organizer"&&!(await canManageTournament(env,user,r.tournament_id)))return fail("FORBIDDEN",request,env,403);
    if(user.role==="finance"&&user.clubId&&r.team_club_id!==user.clubId)return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),id=uid();
    await env.DB.prepare("INSERT INTO payment_records(id,registration_id,method,reference_code,receipt_url,status,created_at) VALUES(?,?,?,?,?,'pending',?)")
      .bind(id,p.id,b.method||"bank_transfer",b.referenceCode||null,b.receiptUrl||null,nowIso()).run();
    await env.DB.prepare("UPDATE registrations SET payment_status='pending' WHERE id=?").bind(p.id).run();
    return ok(await one(env,"SELECT * FROM payment_records WHERE id=?",id),request,env,201);
  }
  p=route(path,"/api/payment-records/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),pay=await paymentWithTournament(env,p.id);if(!pay)return fail("NOT_FOUND",request,env,404);
    if(!hasRole(user,"super_admin","organizer","finance"))return fail("FORBIDDEN",request,env,403);
    if(user.role==="organizer"&&!(await canManageTournament(env,user,pay.tournament_id)))return fail("FORBIDDEN",request,env,403);
    if(user.role==="finance"&&user.clubId&&pay.team_club_id!==user.clubId)return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),status=String(b.status||"");if(!["approved","rejected","refunded"].includes(status))return fail("INVALID_STATUS",request,env,400);
    await env.DB.prepare("UPDATE payment_records SET status=?,reviewed_by=?,reviewed_at=? WHERE id=?").bind(status,user.id,nowIso(),p.id).run();
    await env.DB.prepare("UPDATE registrations SET payment_status=? WHERE id=?").bind(status==="approved"?"paid":status==="refunded"?"refunded":"unpaid",pay.registration_id).run();
    return ok(await one(env,"SELECT * FROM payment_records WHERE id=?",p.id),request,env);
  }

  p=route(path,"/api/checkin/:token");
  if(p&&method==="GET"){
    const r=await one(env,"SELECT r.id,r.status,r.checked_in_at,t.name AS team_name,d.name AS division_name,tr.name AS tournament_name,tr.venue_name,tr.start_at FROM registrations r JOIN divisions d ON d.id=r.division_id JOIN tournaments tr ON tr.id=d.tournament_id LEFT JOIN teams t ON t.id=r.team_id WHERE r.checkin_token=?",p.token);
    return r?ok(r,request,env):fail("NOT_FOUND",request,env,404);
  }
  p=route(path,"/api/checkin/:token/confirm");
  if(p&&method==="POST"){
    const r=await one(env,"SELECT id FROM registrations WHERE checkin_token=?",p.token);if(!r)return fail("NOT_FOUND",request,env,404);
    await env.DB.prepare("UPDATE registrations SET checked_in_at=COALESCE(checked_in_at,?) WHERE id=?").bind(nowIso(),r.id).run();
    return ok({ok:true,registrationId:r.id},request,env);
  }

  if(path==="/api/public/tournaments/submit"&&method==="POST"){
    const b=await bodyJson(request),name=String(b.name||"").trim();if(!name)return fail("NAME_REQUIRED",request,env,400);
    const id=uid(),slug=await nextTournamentSlug(env,name);
    await env.DB.prepare("INSERT INTO tournaments(id,name,slug,venue_name,start_at,end_at,status,public_visible,contact_name,contact_phone,contact_email,prize_pool,entry_fee,poster_url,sponsor_package,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',0,?,?,?,?,?,?,?,?,?)")
      .bind(id,name,slug,String(b.venue||b.venueName||""),b.startAt||null,b.endAt||null,String(b.contactName||""),String(b.contactPhone||""),String(b.contactEmail||""),String(b.prizePool||""),String(b.entryFee||""),b.posterUrl||null,b.sponsorPackage||"free",nowIso(),nowIso()).run();
    const did=uid();await env.DB.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count,active,updated_at) VALUES(?,?,?,?,?,3,11,1,2,1,?)")
      .bind(did,id,String(b.divisionName||"Nội dung chính"),b.eventType||"doubles",b.format||"pool_to_knockout",nowIso()).run();
    return ok({ok:true,id,status:"submitted"},request,env,201);
  }

  p=route(path,"/api/divisions/:id/generate-bracket");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),result=await generateBracket(env,p.id);
    await emit(env,"public:state",{tournamentId:tid});return ok(result,request,env);
  }

  p=route(path,"/api/matches/:id/undo");
  if(p&&method==="POST"){
    const user=await userRequired(request,env);
    const m=await one(env,"SELECT m.*,d.tournament_id FROM matches m JOIN divisions d ON d.id=m.division_id WHERE m.id=?",p.id);if(!m)return fail("NOT_FOUND",request,env,404);
    const allowed=user.role==="super_admin"||(user.role==="organizer"&&await canManageTournament(env,user,m.tournament_id))||(user.role==="referee"&&m.referee_user_id===user.id);
    if(!allowed)return fail("FORBIDDEN",request,env,403);
    const ev=await one(env,"SELECT * FROM score_events WHERE match_id=? AND undone_at IS NULL ORDER BY id DESC LIMIT 1",p.id);if(!ev)return fail("NOTHING_TO_UNDO",request,env,400);
    const payload=safeJsonParse(ev.payload,{});
    const winner=m.winner_team_id||payload.winner||null;
    if(payload.before&&Array.isArray(payload.before)){
      await env.DB.prepare("UPDATE matches SET current_score_a=?,current_score_b=?,status='live',version=version+1 WHERE id=?").bind(Number(payload.before[0]||0),Number(payload.before[1]||0),p.id).run();
    }else if(payload.set&&payload.setNo){
      await env.DB.prepare("DELETE FROM match_sets WHERE match_id=? AND set_no=?").bind(p.id,Number(payload.setNo)).run();
      await env.DB.prepare("UPDATE matches SET current_score_a=?,current_score_b=?,winner_team_id=NULL,completed_at=NULL,result_reason=NULL,result_note=NULL,status='live',version=version+1 WHERE id=?").bind(Number(payload.set[0]||0),Number(payload.set[1]||0),p.id).run();
    }else if(Array.isArray(payload.sets)){
      await env.DB.prepare("DELETE FROM match_sets WHERE match_id=?").bind(p.id).run();
      await env.DB.prepare("UPDATE matches SET current_score_a=0,current_score_b=0,winner_team_id=NULL,completed_at=NULL,result_reason=NULL,result_note=NULL,status='scheduled',version=version+1 WHERE id=?").bind(p.id).run();
    }else{
      await env.DB.prepare("UPDATE matches SET winner_team_id=NULL,completed_at=NULL,result_reason=NULL,result_note=NULL,status='live',version=version+1 WHERE id=?").bind(p.id).run();
    }
    if(winner)await rewindBracket(env,p.id,winner);
    await env.DB.prepare("UPDATE score_events SET undone_at=? WHERE id=?").bind(nowIso(),ev.id).run();
    const fresh=await one(env,"SELECT version FROM matches WHERE id=?",p.id);
    await env.DB.prepare("INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES(?,?,?,?,?)").bind(p.id,user.id,"UNDO",JSON.stringify({undidEventId:ev.id}),Number(fresh?.version||m.version)+0).run();
    await emit(env,"match:update",{id:p.id,tournamentId:m.tournament_id});await emit(env,"public:state",{tournamentId:m.tournament_id});
    return ok(await matchView(env,p.id),request,env);
  }

  return null;
}
