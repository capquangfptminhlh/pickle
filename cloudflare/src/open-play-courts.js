import {bodyJson,uid,nowIso,ok,fail,route,audit} from "./util.js";

const one=(env,sql,...values)=>env.DB.prepare(sql).bind(...values).first();
const rows=async(env,sql,...values)=>(await env.DB.prepare(sql).bind(...values).all()).results||[];
const count=r=>Number(r?.meta?.changes??r?.changes??0);
const validDuration=n=>Number.isSafeInteger(n)&&n>=30&&n<=480&&n%15===0;
async function ownedSession(env,user,id){
 const session=await one(env,"SELECT * FROM open_play_sessions WHERE id=?",id);
 if(!session)return {error:"OPEN_PLAY_NOT_FOUND",status:404};
 if(user.role!=="super_admin"&&session.organizer_user_id!==user.id)
   return {error:"OPEN_PLAY_FORBIDDEN",status:403};
 return {session};
}
const entitled=(user,session,court)=>court.owner_user_id===user.id||
  (court.club_id&&session.club_id===court.club_id&&user.clubId===court.club_id);
const describe=row=>({id:row.id,name:row.name,clubId:row.club_id||null,active:Boolean(row.active)});
async function bookingList(env,id){
 return rows(env,`SELECT b.court_id AS courtId,c.name,b.starts_at AS startsAt,b.ends_at AS endsAt
  FROM open_play_court_bookings b JOIN open_play_venue_courts c ON c.id=b.court_id
  WHERE b.session_id=? AND b.status='active' ORDER BY c.name,c.id`,id);
}
export async function handleOpenPlayCourts(request,env,user){
 const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
 if(path==="/api/open-play/courts"&&method==="POST"){
  const data=await bodyJson(request);
  const name=typeof data.name==="string"?data.name.trim():"";
  const clubId=data.clubId===undefined||data.clubId===null?"":String(data.clubId).trim();
  if(name.length<1||name.length>80)return fail("INVALID_OPEN_PLAY_COURT_NAME",request,env,400);
  if(clubId.length>128)return fail("INVALID_OPEN_PLAY_CLUB_ID",request,env,400);
  if(clubId&&user.role!=="super_admin"&&user.clubId!==clubId)
    return fail("OPEN_PLAY_CLUB_SCOPE_FORBIDDEN",request,env,403);
  if(clubId&&!await one(env,"SELECT id FROM clubs WHERE id=? AND active=1",clubId))
    return fail("OPEN_PLAY_CLUB_NOT_FOUND",request,env,404);
  const id=uid();
  try{
   await env.DB.prepare("INSERT INTO open_play_venue_courts(id,owner_user_id,club_id,name,created_at) VALUES(?,?,?,?,?)")
    .bind(id,user.id,clubId||null,name,nowIso()).run();
  }catch(e){
   if(String(e).includes("UNIQUE constraint"))return fail("OPEN_PLAY_COURT_ALREADY_EXISTS",request,env,409);
   throw e;
  }
  const result={id,name,clubId:clubId||null,active:true};
  await audit(env,user,"open_play_venue_court",id,"CREATE",null,result);
  return ok(result,request,env,201);
 }
 let m=route(path,"/api/open-play/sessions/:id/courts");
 if(m&&method==="GET"){
  const access=await ownedSession(env,user,m.id);
  if(access.error)return fail(access.error,request,env,access.status);
  const booking=await bookingList(env,m.id);
  const duration=Number(url.searchParams.get("durationMinutes")||120);
  if(!validDuration(duration))return fail("INVALID_OPEN_PLAY_DURATION",request,env,400);
  const from=new Date(access.session.starts_at).toISOString();
  const until=new Date(Date.parse(from)+duration*60000).toISOString();
  const available=await rows(env,`SELECT c.*,
    EXISTS(SELECT 1 FROM open_play_court_bookings b WHERE b.court_id=c.id AND b.status='active'
      AND b.session_id<>? AND b.starts_at<? AND b.ends_at>?) AS isBusy
    FROM open_play_venue_courts c WHERE c.active=1 AND
    (c.owner_user_id=? OR (? <> '' AND c.club_id=?)) ORDER BY c.name,c.id LIMIT 200`,
    m.id,until,from,user.id,user.clubId||"",user.clubId||"");
  return ok({sessionId:m.id,startsAt:from,endsAt:until,bookings:booking,
    courts:available.map(c=>({...describe(c),available:!Boolean(c.isBusy)}))},request,env);
 }
 m=route(path,"/api/open-play/sessions/:id/courts/reserve");
 if(m&&method==="POST"){
  const access=await ownedSession(env,user,m.id);
  if(access.error)return fail(access.error,request,env,access.status);
  if(access.session.status!=="open")return fail("OPEN_PLAY_NOT_OPEN",request,env,409);
  if(await one(env,"SELECT session_id FROM open_play_plans WHERE session_id=?",m.id))
    return fail("OPEN_PLAY_PLAN_EXISTS",request,env,409);
  if((await bookingList(env,m.id)).length)
    return fail("OPEN_PLAY_COURTS_ALREADY_RESERVED",request,env,409);
  const b=await bodyJson(request);
  const ids=b.courtIds;
  const duration=Number(b.durationMinutes);
  if(!Array.isArray(ids)||ids.length<1||ids.length>32||ids.some(x=>typeof x!=="string"||!x.trim()||x.length>128)
    ||new Set(ids).size!==ids.length)return fail("INVALID_OPEN_PLAY_COURT_SELECTION",request,env,400);
  if(!validDuration(duration))return fail("INVALID_OPEN_PLAY_DURATION",request,env,400);
  const from=new Date(access.session.starts_at).toISOString();
  const until=new Date(Date.parse(from)+duration*60000).toISOString();
  for(const id of ids){
   const court=await one(env,"SELECT * FROM open_play_venue_courts WHERE id=? AND active=1",id);
   if(!court||!entitled(user,access.session,court))
     return fail("OPEN_PLAY_COURT_NOT_ACCESSIBLE",request,env,403);
  }
  const stamp=nowIso();
  try{
   const statements=[
     env.DB.prepare(`
       INSERT INTO open_play_court_reservations(session_id,starts_at,ends_at,created_by,created_at)
       SELECT ?,?,?,?,? WHERE (SELECT status FROM open_play_sessions WHERE id=?)='open'
         AND NOT EXISTS(SELECT 1 FROM open_play_plans WHERE session_id=?)`)
       .bind(m.id,from,until,user.id,stamp,m.id,m.id),
     ...ids.map(id=>env.DB.prepare(`
       INSERT INTO open_play_court_bookings(id,session_id,court_id,starts_at,ends_at,status,created_by,created_at)
       SELECT ?,?,?,?,?, 'active',?,?
       WHERE EXISTS(SELECT 1 FROM open_play_court_reservations WHERE session_id=? AND status='active')`)
       .bind(uid(),m.id,id,from,until,user.id,stamp,m.id))
   ];
   const results=await env.DB.batch(statements);
   if(results.some(r=>count(r)!==1))
     return fail("OPEN_PLAY_COURT_RESERVATION_CONFLICT",request,env,409);
  }catch(e){
   if(String(e).includes("OPEN_PLAY_COURT_TIME_CONFLICT"))
     return fail("OPEN_PLAY_COURT_TIME_CONFLICT",request,env,409);
   if(/UNIQUE constraint|CHECK constraint|FOREIGN KEY constraint/.test(String(e)))
     return fail("OPEN_PLAY_COURT_RESERVATION_CONFLICT",request,env,409);
   throw e;
  }
  const bookings=await bookingList(env,m.id);
  await audit(env,user,"open_play_court_booking",m.id,"RESERVE",null,{from,until,courtIds:ids});
  return ok({sessionId:m.id,startsAt:from,endsAt:until,bookings},request,env,201);
 }
 return null;
}
