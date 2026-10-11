import QRCode from "qrcode";
import {authenticate,canManageTournament,tournamentForDivision,tournamentForCourt,canEditPlayer} from "./auth.js";
import {ok,fail,bodyJson,route,uid,slugify,nowIso,safeJsonParse,publicUser} from "./util.js";
import {loadAdminState} from "./state.js";
import {generateBracket} from "./bracket.js";
import {broadcast} from "./realtime.js";
import {validatePlayerIds,registryNameKey} from "../../shared/team-player-selection.js";
import {divisionMatchRules,divisionBracketRules,assertScoringRulesEditable,assertBracketRulesEditable} from "./division-rules.js";

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
function skillLevelValue(v){
  const s=String(v||"").trim().toUpperCase();
  return ["A+","A","B+","B","C+","C"].includes(s)?s:"B";
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
async function parseTournamentSubmission(request){
  const contentType=String(request.headers.get("content-type")||"");
  if(!contentType.toLowerCase().includes("multipart/form-data"))return {body:await bodyJson(request),banner:null};
  const form=await request.formData(),body={};
  for(const [key,value] of form.entries())if(typeof value==="string")body[key]=value;
  const candidate=form.get("banner");
  const banner=candidate&&typeof candidate==="object"&&typeof candidate.arrayBuffer==="function"&&Number(candidate.size||0)>0?candidate:null;
  return {body,banner};
}
async function validateTournamentBanner(file){
  if(!file)return null;
  if(Number(file.size||0)>5*1024*1024)throw httpError("BANNER_TOO_LARGE",413);
  const type=String(file.type||"").toLowerCase();
  const extByType={"image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
  const ext=extByType[type];if(!ext)throw httpError("INVALID_BANNER_TYPE",400);
  const bytes=new Uint8Array(await file.arrayBuffer());
  const png=bytes.length>=8&&[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>bytes[i]===v);
  const jpg=bytes.length>=3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==="RIFF"&&String.fromCharCode(...bytes.slice(8,12))==="WEBP";
  if((type==="image/png"&&!png)||(type==="image/jpeg"&&!jpg)||(type==="image/webp"&&!webp))throw httpError("INVALID_BANNER_CONTENT",400);
  return {bytes,type,ext,originalName:String(file.name||"banner")};
}
async function matchView(env,id){
  const m=await one(env,"SELECT * FROM matches WHERE id=?",id);if(!m)return null;
  const ss=await rows(env,"SELECT score_a,score_b FROM match_sets WHERE match_id=? ORDER BY set_no",id);
  return {id:m.id,divisionId:m.division_id,a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",stage:m.stage,status:m.status==="scheduled"?"wait":m.status==="completed"?"done":m.status,current:[Number(m.current_score_a||0),Number(m.current_score_b||0)],sets:ss.map(x=>[Number(x.score_a),Number(x.score_b)]),winner:m.winner_team_id||null,version:Number(m.version||1),refereeId:m.referee_user_id||null,courtId:m.court_id||null,bracketSlot:m.bracket_slot||null,bracketSeries:m.bracket_series||(m.bracket_slot?"A":null)};
}

function legacyTournamentStatus(v){
  const s=String(v||"").toLowerCase();
  if(["live","completed","cancelled","draft","registration"].includes(s))return s;
  if(["open","upcoming","registering"].includes(s))return "registration";
  if(["done","finished"].includes(s))return "completed";
  return "draft";
}
function legacyDivisionFormat(v){
  const s=String(v||"");
  return ["round_robin","pool_to_knockout","single_elimination","double_elimination"].includes(s)?s:"pool_to_knockout";
}
function legacyEventType(v){
  const s=String(v||"");
  return ["singles","doubles","mixed_doubles","team"].includes(s)?s:"doubles";
}
function legacyMatchStatus(v){
  const s=String(v||"").toLowerCase();
  if(["completed","done"].includes(s))return "completed";
  if(["live"].includes(s))return "live";
  if(["ready"].includes(s))return "ready";
  if(["walkover"].includes(s))return "walkover";
  if(["cancelled","canceled"].includes(s))return "cancelled";
  return "scheduled";
}
function safeLegacyAvatar(v){
  const s=String(v||"").trim();
  if(!s||s.startsWith("data:"))return null;
  return s.slice(0,2000);
}
function legacyScheduledAt(m,tournament){
  if(m?.scheduledAt)return String(m.scheduledAt);
  const time=String(m?.time||"").match(/^(\d{1,2}):(\d{2})$/);
  const start=tournament?.startAt||tournament?.start_at||null;
  if(time&&start){
    const date=String(start).match(/^(\d{4}-\d{2}-\d{2})/);
    const offset=String(start).match(/(Z|[+-]\d{2}:?\d{2})$/i)?.[1]||"+07:00";
    if(date&&Number(time[1])<24&&Number(time[2])<60){
      const d=new Date(`${date[1]}T${time[1].padStart(2,"0")}:${time[2]}:00${offset}`);
      if(Number.isFinite(d.getTime()))return d.toISOString();
    }
  }
  return null;
}
async function runBatches(env,statements,onBatch,size=60){
  for(let i=0;i<statements.length;i+=size){
    const batch=statements.slice(i,i+size);
    onBatch(batch,await env.DB.batch(batch));
  }
}
// D1 batches are atomic. Never split a new parent from its imported children.
async function runLegacyGroups(env,groups,onBatch,size=60){
  let batch=[];
  const flush=async()=>{
    if(!batch.length)return;
    try{onBatch(batch,await env.DB.batch(batch))}catch(error){
      if(/UNIQUE constraint failed: (teams|matches)\.id/.test(String(error.message)))throw httpError("LEGACY_IMPORT_CONFLICT",409);
      throw error;
    }
    batch=[];
  };
  for(const group of groups){
    if(group.length>size)throw httpError("LEGACY_RECORD_TOO_LARGE",413);
    if(batch.length+group.length>size)await flush();
    batch.push(...group);
  }
  await flush();
}
function uniqueSlugFactory(existing=[]){
  const used=new Set(existing.filter(Boolean).map(String));
  return value=>{
    const base=slugify(value),root=base||"item";let out=root,n=2;
    while(used.has(out))out=root+"-"+n++;
    used.add(out);return out;
  };
}
async function importLegacyState(env,user,state){
  const src=state&&typeof state==="object"?state:{};
  const tournaments=Array.isArray(src.tournaments)?src.tournaments:[];
  const divisions=Array.isArray(src.divisions)?src.divisions:[];
  const courts=Array.isArray(src.courts)?src.courts:[];
  const clubs=Array.isArray(src.clubs)?src.clubs:[];
  const players=Array.isArray(src.players)?src.players:[];
  const teams=Array.isArray(src.teams)?src.teams:[];
  const matches=Array.isArray(src.matches)?src.matches:[];
  const registrations=Array.isArray(src.registrations)?src.registrations:[];
  const sponsors=Array.isArray(src.sponsors)?src.sponsors:[];
  const posts=Array.isArray(src.posts)?src.posts:[];
  const bookings=Array.isArray(src.bookings)?src.bookings:[];
  const clubEvents=Array.isArray(src.clubEvents)?src.clubEvents:[];
  const clubTransactions=Array.isArray(src.clubTransactions)?src.clubTransactions:[];
  const teamPlayers=src.teamPlayers&&typeof src.teamPlayers==="object"?src.teamPlayers:{};
  const clubAttendance=src.clubAttendance&&typeof src.clubAttendance==="object"?src.clubAttendance:{};
  if(!tournaments.length&&!players.length&&!clubs.length)throw httpError("LEGACY_STATE_EMPTY",400);
  if(tournaments.length>300||divisions.length>1000||courts.length>3000||players.length>10000||teams.length>10000||matches.length>50000)throw httpError("LEGACY_STATE_TOO_LARGE",413);

  const now=nowIso(),counts={clubs:0,players:0,tournaments:0,divisions:0,courts:0,teams:0,teamPlayers:0,matches:0,sets:0,registrations:0,sponsors:0,posts:0,bookings:0,clubEvents:0,attendance:0,transactions:0};
  const skipped={...counts},statementKeys=new WeakMap();
  const tableCounts={clubs:"clubs",players:"players",tournaments:"tournaments",divisions:"divisions",courts:"courts",teams:"teams",team_players:"teamPlayers",matches:"matches",match_sets:"sets",registrations:"registrations",sponsors:"sponsors",content_posts:"posts",court_bookings:"bookings",club_events:"clubEvents",club_event_attendance:"attendance",club_transactions:"transactions"};
  const prepareImport=sql=>({bind:(...args)=>{
    const statement=env.DB.prepare(sql).bind(...args);
    statementKeys.set(statement,tableCounts[sql.match(/^INSERT INTO (\w+)/)?.[1]]);
    return statement;
  }});
  const countResults=(batch,results)=>batch.forEach((statement,index)=>{
    const key=statementKeys.get(statement);if(!key)return;
    const changed=Number(results[index]?.meta?.changes??results[index]?.changes??0);
    counts[key]+=changed;if(!changed)skipped[key]++;
  });
  const warnings=[];
  const existingClubSlugs=(await rows(env,"SELECT slug FROM clubs")).map(x=>x.slug);
  const existingTournamentSlugs=(await rows(env,"SELECT slug FROM tournaments")).map(x=>x.slug);
  const existingPostSlugs=(await rows(env,"SELECT slug FROM content_posts")).map(x=>x.slug);
  const clubSlug=uniqueSlugFactory(existingClubSlugs),tourSlug=uniqueSlugFactory(existingTournamentSlugs),postSlug=uniqueSlugFactory(existingPostSlugs);
  const clubIdByName=new Map();
  for(const c of clubs)if(c?.id&&c?.name)clubIdByName.set(String(c.name).trim().toLowerCase(),String(c.id));

  let statements=[];
  for(const c of clubs){
    if(!c?.id||!String(c.name||"").trim())continue;
    const existing=await one(env,"SELECT slug FROM clubs WHERE id=?",String(c.id));
    const slug=existing?.slug||clubSlug(c.slug||c.name);
    statements.push(prepareImport("INSERT INTO clubs(id,name,slug,city,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(c.id),String(c.name).trim(),slug,String(c.city||""),c.active===false?0:1,now,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  for(const p of players){
    if(!p?.id||!String(p.full_name||p.fullName||"").trim())continue;
    const clubId=p.club_id||p.clubId||null;
    statements.push(prepareImport("INSERT INTO players(id,club_id,created_by_user_id,full_name,nickname,gender,rating,skill_level,phone,avatar_url,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(p.id),clubId?String(clubId):null,user.id,String(p.full_name||p.fullName).trim(),String(p.nickname||""),genderValue(p.gender),Number(p.rating)||3,skillLevelValue(p.skillLevel||p.skill_level),String(p.phone||""),safeLegacyAvatar(p.avatar_url||p.avatarUrl),p.active===false?0:1,now,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  for(const t of tournaments){
    if(!t?.id||!String(t.name||"").trim())continue;
    const existing=await one(env,"SELECT slug FROM tournaments WHERE id=?",String(t.id));
    const slug=existing?.slug||tourSlug(t.slug||t.name);
    statements.push(prepareImport("INSERT INTO tournaments(id,owner_user_id,name,slug,venue_name,start_at,end_at,status,public_visible,is_featured,featured_rank,contact_name,contact_phone,prize_pool,entry_fee,poster_url,sponsor_package,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(t.id),user.id,String(t.name).trim(),slug,String(t.venue||t.venue_name||""),t.startAt||t.start_at||null,t.endAt||t.end_at||null,legacyTournamentStatus(t.status),t.publicVisible===false?0:1,t.isFeatured?1:0,Number(t.featuredRank||0),String(t.contactName||""),String(t.contactPhone||""),t.prizePool==null?null:String(t.prizePool),t.entryFee==null?null:String(t.entryFee),String(t.posterUrl||t.coverUrl||"")||null,String(t.sponsorPackage||"free"),now,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  for(const d of divisions){
    if(!d?.id||!d?.tournamentId)continue;
    statements.push(prepareImport("INSERT INTO divisions(id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count,tie_break_mode,scoring_mode,minimum_rest_minutes,match_slot_minutes,active,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(d.id),String(d.tournamentId),String(d.name||"Open"),legacyEventType(d.eventType),legacyDivisionFormat(d.format),[1,3,5].includes(Number(d.bestOf))?Number(d.bestOf):3,Math.max(1,Number(d.pointsToWin)||11),d.winByTwo===false?0:1,Math.max(1,Number(d.advanceCount)||2),"head_to_head",d.scoringMode==="rally"?"rally":"side_out",Math.max(0,Number(d.minimumRestMinutes??15)),Math.max(5,Number(d.matchSlotMinutes??20)),d.active===false?0:1,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  for(const c of courts){
    if(!c?.id||!c?.tournamentId)continue;
    statements.push(prepareImport("INSERT INTO courts(id,tournament_id,name,sort_order,active,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(c.id),String(c.tournamentId),String(c.name||"Sân"),Number(c.sortOrder||0),c.active===false?0:1,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  const knownTeams=new Set((await rows(env,"SELECT id FROM teams")).map(t=>String(t.id)));
  let groups=[];
  for(const t of teams){
    if(!t?.id||!t?.divisionId)continue;
    // Existing parents may have live rosters or history, including an empty roster.
    if(knownTeams.has(String(t.id))){
      skipped.teams++;skipped.teamPlayers+=Array.isArray(teamPlayers[t.id])?teamPlayers[t.id].length:0;
      continue;
    }
    knownTeams.add(String(t.id));
    const group=[];
    let clubId=t.clubId||t.club_id||null;
    if(!clubId&&t.club)clubId=clubIdByName.get(String(t.club).trim().toLowerCase())||null;
    // Plain INSERT makes a concurrent parent creation abort this whole group.
    group.push(prepareImport("INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(String(t.id),String(t.divisionId),String(t.name||"Đội"),clubId?String(clubId):null,t.seed==null?null:Number(t.seed),String(t.group||t.group_code||"")||null,String(t.status||"active"),now));
    const pids=Array.isArray(teamPlayers[t.id])?teamPlayers[t.id]:[];
    for(const [slotIndex,pid] of pids.entries()){
      // OR IGNORE still runs BEFORE INSERT guards; exclude duplicates before INSERT.
      group.push(prepareImport("INSERT INTO team_players(team_id,player_id,slot_no) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM team_players WHERE team_id=? AND player_id=?)").bind(String(t.id),String(pid),slotIndex+1,String(t.id),String(pid)));
    }
    groups.push(group);
  }
  await runLegacyGroups(env,groups,countResults);groups=[];

  const tournamentByDivision=new Map(divisions.map(d=>[String(d.id),tournaments.find(t=>String(t.id)===String(d.tournamentId))]));
  const knownMatches=new Set((await rows(env,"SELECT id FROM matches")).map(m=>String(m.id)));
  for(const m of matches){
    if(!m?.id||!m?.divisionId)continue;
    if(knownMatches.has(String(m.id))){
      skipped.matches++;skipped.sets+=Array.isArray(m.sets)?m.sets.filter(Array.isArray).length:0;
      continue;
    }
    knownMatches.add(String(m.id));
    const group=[];
    const status=legacyMatchStatus(m.status),current=Array.isArray(m.current)?m.current:[0,0],t=tournamentByDivision.get(String(m.divisionId));
    const courtState=status==="live"?"live":status==="completed"?"done":String(m.courtState||"scheduled");
    group.push(prepareImport("INSERT INTO matches(id,division_id,court_id,referee_user_id,team_a_id,team_b_id,winner_team_id,stage,round_no,bracket_slot,scheduled_at,started_at,completed_at,status,current_score_a,current_score_b,result_reason,result_note,version,court_state,serving_side,server_number,timeout_a,timeout_b,medical_timeout_a,medical_timeout_b,called_at,on_deck_at,warmup_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(String(m.id),String(m.divisionId),m.courtId?String(m.courtId):null,null,m.a&&m.a!=="TBD"?String(m.a):null,m.b&&m.b!=="TBD"?String(m.b):null,m.winner?String(m.winner):null,String(m.stage||"Vòng bảng"),m.roundNo==null?null:Number(m.roundNo),String(m.bracketSlot||"")||null,legacyScheduledAt(m,t),m.startedAt||null,m.completedAt||(status==="completed"?now:null),status,Number(current[0]||0),Number(current[1]||0),m.resultReason||null,m.resultNote||null,Math.max(1,Number(m.version)||1),["scheduled","called","on_deck","warming_up","live","done"].includes(courtState)?courtState:"scheduled",["A","B"].includes(m.servingSide)?m.servingSide:null,[1,2].includes(Number(m.serverNumber))?Number(m.serverNumber):2,Number(m.timeouts?.A||0),Number(m.timeouts?.B||0),Number(m.medicalTimeouts?.A||0),Number(m.medicalTimeouts?.B||0),m.calledAt||null,m.onDeckAt||null,m.warmupAt||null,now));
    const sets=Array.isArray(m.sets)?m.sets:[];
    sets.forEach((s,i)=>{if(!Array.isArray(s))return;group.push(prepareImport("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,?,?,?,1)").bind(String(m.id)+"-set-"+(i+1),String(m.id),i+1,Number(s[0]||0),Number(s[1]||0)))});
    groups.push(group);
  }
  await runLegacyGroups(env,groups,countResults);

  const divisionKey=new Map(divisions.map(d=>[String(tournaments.find(t=>String(t.id)===String(d.tournamentId))?.name||"").toLowerCase()+"|"+String(d.name||"").toLowerCase(),String(d.id)]));
  const teamKey=new Map(teams.map(t=>[String(t.divisionId)+"|"+String(t.name||"").toLowerCase(),String(t.id)]));
  for(const r of registrations){
    const did=divisionKey.get(String(r.tournament_name||"").toLowerCase()+"|"+String(r.division_name||"").toLowerCase());
    if(!did)continue;
    const teamId=teamKey.get(did+"|"+String(r.team_name||"").toLowerCase())||null;
    const id=String(r.id||uid()),status=["pending","approved","waitlist","cancelled"].includes(r.status)?r.status:"approved";
    const pay=["unpaid","pending","paid","refunded"].includes(r.payment_status)?r.payment_status:"unpaid";
    statements.push(prepareImport("INSERT INTO registrations(id,division_id,team_id,status,payment_status,amount,checkin_token,checked_in_at,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(id,did,teamId,status,pay,r.amount==null?null:Number(r.amount),id,r.checked_in_at||null,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  for(const s of sponsors){
    if(!s?.id||!s?.name)continue;
    statements.push(prepareImport("INSERT INTO sponsors(id,tournament_id,name,logo_url,website_url,tier,sort_order) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(s.id),s.tournamentId||s.tournament_id||null,String(s.name),s.logo_url||s.logoUrl||null,String(s.website_url||s.websiteUrl||""),String(s.tier||""),Number(s.sort_order||s.sortOrder||0)));
  }
  for(const p of posts){
    if(!p?.id||!p?.title)continue;
    const existing=await one(env,"SELECT slug FROM content_posts WHERE id=?",String(p.id));
    statements.push(prepareImport("INSERT INTO content_posts(id,tournament_id,title,slug,excerpt,body,cover_url,status,published_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(p.id),p.tournamentId||p.tournament_id||null,String(p.title),existing?.slug||postSlug(p.slug||p.title),String(p.excerpt||""),String(p.body||""),p.cover_url||p.coverUrl||null,["draft","published","archived"].includes(p.status)?p.status:"draft",p.published_at||null,user.id,now,now));
  }
  await runBatches(env,statements,countResults);statements=[];

  for(const b of bookings){
    if(!b?.id||!b?.court_id||!b?.start_at||!b?.end_at)continue;
    statements.push(prepareImport("INSERT INTO court_bookings(id,court_id,title,contact_name,contact_phone,start_at,end_at,status,notes,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(b.id),String(b.court_id),String(b.title||"Booking"),String(b.contact_name||""),String(b.contact_phone||""),String(b.start_at),String(b.end_at),["pending","confirmed","cancelled","completed"].includes(b.status)?b.status:"confirmed",String(b.notes||""),user.id,now));
  }
  for(const e of clubEvents){
    if(!e?.id||!e?.club_id||!e?.start_at)continue;
    statements.push(prepareImport("INSERT INTO club_events(id,club_id,title,event_type,venue,start_at,end_at,max_participants,fee,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(e.id),String(e.club_id),String(e.title||"Hoạt động"),["social","training","match","meeting","other"].includes(e.event_type)?e.event_type:"other",String(e.venue||""),String(e.start_at),e.end_at||null,e.max_participants==null?null:Number(e.max_participants),Number(e.fee||0),["scheduled","live","completed","cancelled"].includes(e.status)?e.status:"scheduled",user.id,now,now));
    const arr=Array.isArray(clubAttendance[e.id])?clubAttendance[e.id]:[];
    for(const a of arr){
      if(!a?.player_id)continue;
      statements.push(prepareImport("INSERT INTO club_event_attendance(event_id,player_id,status,checked_in_at,checked_in_by,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(event_id,player_id) DO NOTHING")
        .bind(String(e.id),String(a.player_id),["registered","attended","absent","cancelled"].includes(a.status)?a.status:"registered",a.checked_in_at||null,null,now));
    }
  }
  for(const x of clubTransactions){
    if(!x?.id||!x?.club_id||!(Number(x.amount)>0))continue;
    statements.push(prepareImport("INSERT INTO club_transactions(id,club_id,direction,category,amount,note,occurred_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING")
      .bind(String(x.id),String(x.club_id),x.direction==="expense"?"expense":"income",String(x.category||"other"),Number(x.amount),String(x.note||""),x.occurred_at||now,user.id,now));
  }
  await runBatches(env,statements,countResults);

  if(src.branding&&typeof src.branding==="object"){
    await env.DB.prepare("INSERT INTO app_settings(key,value,updated_by,updated_at) VALUES('branding',?,?,?) ON CONFLICT(key) DO NOTHING")
      .bind(JSON.stringify(src.branding),user.id,now).run();
  }
  if(skipped.teams||skipped.matches)warnings.push("Đội/trận đấu đã tồn tại được giữ nguyên, kể cả danh sách VĐV hoặc set đang trống; dữ liệu còn thiếu cần được kiểm tra thủ công.");
  if(Array.isArray(src.referees)&&src.referees.length)warnings.push("Không import mật khẩu/tài khoản trọng tài cũ; hãy tạo lại tài khoản trọng tài trong hệ thống mới.");
  await env.DB.prepare("INSERT INTO audit_logs(actor_user_id,entity_type,entity_id,action,after_data,reason,created_at) VALUES(?,'system','legacy-localstorage','IMPORT_LEGACY_STATE',?,?,?)")
    .bind(user.id,JSON.stringify(counts),"Import dữ liệu thật từ GitHub Pages localStorage",now).run();
  return {ok:true,counts,skipped,warnings};
}

export async function handleOperations(request,env){
  const url=new URL(request.url),path=url.pathname,method=request.method.toUpperCase();
  let p;

  p=route(path,"/api/public/matches/:id/qr");
  if(p&&method==="GET"){
    const match=await one(env,"SELECT m.id,t.public_visible FROM matches m JOIN divisions d ON d.id=m.division_id JOIN tournaments t ON t.id=d.tournament_id WHERE m.id=?",p.id);
    if(!match||!match.public_visible)return fail("NOT_FOUND",request,env,404);
    const app=String(env.PUBLIC_APP_URL||new URL(request.url).origin).replace(/\/$/,""),target=app+"/match.html?id="+encodeURIComponent(p.id);
    const svg=await QRCode.toString(target,{type:"svg",margin:2,width:420,errorCorrectionLevel:"M",color:{dark:"#0d2118",light:"#ffffff"}});
    return ok({id:p.id,url:target,dataUrl:dataSvg(svg)},request,env);
  }

  if(path==="/api/admin/import-legacy-state"&&method==="POST"){
    const user=await userRequired(request,env);
    if(user.role!=="super_admin")return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request);
    try{return ok(await importLegacyState(env,user,b.state),request,env)}
    catch(e){return fail(e.message||"LEGACY_IMPORT_FAILED",request,env,e.status||500)}
  }

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
        await env.DB.prepare("UPDATE players SET nickname=?,gender=?,rating=?,skill_level=?,phone=?,club_id=COALESCE(?,club_id),avatar_url=CASE WHEN ?<>'' THEN ? ELSE avatar_url END,active=1,updated_at=? WHERE id=?")
          .bind(String(r.nickname??existing.nickname??""),genderValue(r.gender||existing.gender),Number(r.rating||existing.rating||3),skillLevelValue(r.skillLevel||r.skill_level||existing.skill_level),String(r.phone??existing.phone??""),club?.id||null,avatar,avatar,nowIso(),existing.id).run();
        ids.push(existing.id);updated++;continue;
      }
      const id=uid();
      await env.DB.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,nickname,gender,rating,skill_level,phone,avatar_url,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)")
        .bind(id,club?.id||null,user.id,name,String(r.nickname||""),genderValue(r.gender),Number(r.rating)||3,skillLevelValue(r.skillLevel||r.skill_level),String(r.phone||""),avatar||null,nowIso(),nowIso()).run();
      ids.push(id);created++;
    }
    return ok({created,updated,ids},request,env,201);
  }

  p=route(path,"/api/divisions/:id/import-teams");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),body=await bodyJson(request),items=Array.isArray(body.rows)?body.rows:[];
    if(!items.length||items.length>5000)return fail("INVALID_IMPORT_SIZE",request,env,400);
    const division=await one(env,"SELECT id,event_type FROM divisions WHERE id=?",p.id);
    const plans=[],issues=[],plannedPlayerRows=new Map(),byName=new Map();
    for(const player of await rows(env,"SELECT id,full_name FROM players WHERE active=1")){
      const key=registryNameKey(player.full_name),matches=byName.get(key)||[];matches.push(player);byName.set(key,matches);
    }
    for(let index=0;index<items.length;index++){
      const r=items[index],name=String(r.name||r.team||"").trim();if(!name)continue;
      const playerIds=[];
      for(let slot=0;slot<4;slot++){
        const playerName=String(r[`player${slot+1}`]||"").trim();if(!playerName)continue;
        const matches=byName.get(registryNameKey(playerName))||[];
        if(matches.length!==1){
          issues.push({row:index+1,field:`player${slot+1}`,name:playerName,reason:matches.length?"AMBIGUOUS_PLAYER":"PLAYER_NOT_FOUND"});
        }else{
          playerIds.push(matches[0].id);
          const refs=plannedPlayerRows.get(matches[0].id)||[];refs.push({row:index+1,field:`player${slot+1}`,name:playerName});plannedPlayerRows.set(matches[0].id,refs);
        }
      }
      try{validatePlayerIds(division.event_type,playerIds)}catch(error){issues.push({row:index+1,field:"players",reason:error.message})}
      plans.push({row:index+1,raw:r,name,playerIds,teamId:uid()});
    }
    for(const [playerId,refs] of plannedPlayerRows){
      if(refs.length>1)for(const ref of refs)issues.push({...ref,reason:"PLAYER_ALREADY_IN_IMPORT"});
      const assigned=await one(env,"SELECT 1 AS found FROM team_players tp JOIN teams t ON t.id=tp.team_id WHERE t.division_id=? AND tp.player_id=? AND t.status<>'withdrawn'",p.id,playerId);
      if(assigned)for(const ref of refs)issues.push({...ref,reason:"PLAYER_ALREADY_IN_DIVISION"});
    }
    if(issues.length)return fail("IMPORT_PLAYER_ISSUES",request,env,400,{issues});

    const changedAt=nowIso(),newClubs=new Map(),statements=[];
    for(const plan of plans){
      const r=plan.raw;
      let clubId=null;
      if(r.clubId){
        clubId=(await one(env,"SELECT id FROM clubs WHERE id=?",r.clubId))?.id||null;
      }else{
        const clubName=String(r.club||"").trim(),key=clubName.toLocaleLowerCase("vi");
        if(clubName){
          const existing=await one(env,"SELECT id FROM clubs WHERE lower(name)=lower(?) LIMIT 1",clubName);
          if(existing)clubId=existing.id;
          else{
            if(!newClubs.has(key))newClubs.set(key,{id:uid(),name:clubName,slug:slugify(clubName)+"-"+uid().slice(0,8)});
            clubId=newClubs.get(key).id;
          }
        }
      }
      plan.clubId=clubId;
    }
    for(const club of newClubs.values())statements.push(env.DB.prepare("INSERT INTO clubs(id,name,slug,city,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").bind(club.id,club.name,club.slug,"",changedAt,changedAt));
    for(const plan of plans){
      statements.push(env.DB.prepare("INSERT INTO teams(id,division_id,name,club_id,seed,group_code,status,updated_at) VALUES(?,?,?,?,?,?,'active',?)")
        .bind(plan.teamId,p.id,plan.name,plan.clubId,Number(plan.raw.seed)||null,plan.raw.group?String(plan.raw.group):null,changedAt));
      plan.playerIds.forEach((playerId,index)=>statements.push(env.DB.prepare("INSERT INTO team_players(team_id,player_id,slot_no) VALUES(?,?,?)").bind(plan.teamId,playerId,index+1)));
    }
    if(statements.length)await env.DB.batch(statements);
    const created=plans.length,linkedPlayers=plans.reduce((sum,plan)=>sum+plan.playerIds.length,0);
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
    const rules=divisionMatchRules(b,before),bracket=divisionBracketRules(b,before);
    const scoringMode=["side_out","rally"].includes(String(b.scoringMode??before.scoring_mode))?String(b.scoringMode??before.scoring_mode):"side_out";
    await assertScoringRulesEditable(env,p.id,before,{...rules,scoringMode});
    await assertBracketRulesEditable(env,p.id,before,bracket);
    await env.DB.prepare("UPDATE divisions SET name=?,event_type=?,format=?,best_of=?,points_to_win=?,win_by_two=?,advance_count=?,tie_break_mode=?,scoring_mode=?,minimum_rest_minutes=?,match_slot_minutes=?,relay_segment_points=?,relay_team_size=?,final_point_on_serve=?,third_place_match=?,series_b_enabled=?,series_b_third_place_match=?,active=?,updated_at=? WHERE id=?")
      .bind(String(b.name??before.name),b.eventType??before.event_type,b.format??before.format,rules.bestOf,rules.pointsToWin,rules.winByTwo,bracket.advanceCount,"head_to_head",["side_out","rally"].includes(String(b.scoringMode??before.scoring_mode))?String(b.scoringMode??before.scoring_mode):"side_out",Math.max(0,Number(b.minimumRestMinutes??before.minimum_rest_minutes??15)),Math.max(5,Number(b.matchSlotMinutes??before.match_slot_minutes??20)),rules.relaySegmentPoints,rules.relayTeamSize,rules.finalPointOnServe,rules.thirdPlaceMatch,Number(bracket.seriesBEnabled),Number(bracket.seriesBThirdPlaceMatch),b.active===undefined?before.active:(b.active?1:0),nowIso(),p.id).run();
    await emit(env,"public:state",{tournamentId:tid});return ok(await one(env,"SELECT * FROM divisions WHERE id=?",p.id),request,env);
  }

  p=route(path,"/api/registrations/:id");
  if(p&&method==="PATCH"){
    const user=await userRequired(request,env),r=await registrationWithTournament(env,p.id);if(!r)return fail("NOT_FOUND",request,env,404);if(!(await scopeRegistration(env,user,r)))return fail("FORBIDDEN",request,env,403);
    const b=await bodyJson(request),status=String(b.status??r.status),paymentStatus=String(b.paymentStatus??r.payment_status);
    if(!["pending","approved","waitlist","cancelled"].includes(status))return fail("INVALID_REGISTRATION_STATUS",request,env,400);
    if(!["unpaid","pending","paid","refunded"].includes(paymentStatus))return fail("INVALID_PAYMENT_STATUS",request,env,400);
    await env.DB.prepare("UPDATE registrations SET status=?,payment_status=?,amount=? WHERE id=?").bind(status,paymentStatus,b.amount===undefined?r.amount:Number(b.amount),p.id).run();
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
    const r=await one(env,"SELECT id,status FROM registrations WHERE checkin_token=?",p.token);if(!r)return fail("NOT_FOUND",request,env,404);
    if(r.status==="cancelled")return fail("REGISTRATION_CANCELLED",request,env,409);
    const saved=await env.DB.prepare("UPDATE registrations SET checked_in_at=COALESCE(checked_in_at,?) WHERE id=? AND status<>'cancelled'").bind(nowIso(),r.id).run();
    if(Number(saved.meta?.changes??saved.changes)===0)return fail("REGISTRATION_CANCELLED",request,env,409);
    return ok({ok:true,registrationId:r.id},request,env);
  }

  if(path==="/api/public/tournaments/submit"&&method==="POST"){
    const {body:b,banner}=await parseTournamentSubmission(request);
    const name=String(b.name||"").trim(),venue=String(b.venue||b.venueName||"").trim();
    const contactName=String(b.contactName||"").trim(),contactPhone=String(b.contactPhone||"").trim();
    if(name.length<3||name.length>120)return fail("INVALID_TOURNAMENT_NAME",request,env,400);
    if(!venue)return fail("VENUE_REQUIRED",request,env,400);
    if(!contactName||!contactPhone)return fail("CONTACT_INFO_REQUIRED",request,env,400);
    const sponsorPackage=["free","highlight","top_sponsor"].includes(String(b.sponsorPackage||""))?String(b.sponsorPackage):"free";
    const id=uid(),slug=await nextTournamentSlug(env,name),did=uid();
    let posterUrl=String(b.posterUrl||"").trim()||null,bannerKey=null;
    if(banner){
      if(!env.MEDIA)throw httpError("MEDIA_STORAGE_UNAVAILABLE",503);
      const image=await validateTournamentBanner(banner);
      bannerKey="tournament-banners/"+id+"."+image.ext;
      await env.MEDIA.put(bannerKey,image.bytes,{httpMetadata:{contentType:image.type},customMetadata:{originalName:image.originalName}});
      posterUrl=new URL(request.url).origin+"/api/media/"+encodeURIComponent(bannerKey);
    }
    try{
      await env.DB.prepare("INSERT INTO tournaments(id,name,slug,venue_name,start_at,end_at,status,public_visible,contact_name,contact_phone,contact_email,prize_pool,entry_fee,poster_url,sponsor_package,created_at,updated_at) VALUES(?,?,?,?,?,?,'draft',0,?,?,?,?,?,?,?,?,?)")
        .bind(id,name,slug,venue,b.startAt||null,b.endAt||null,contactName,contactPhone,String(b.contactEmail||""),String(b.prizePool||""),String(b.entryFee||""),posterUrl,sponsorPackage,nowIso(),nowIso()).run();
      await env.DB.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count,active,updated_at) VALUES(?,?,?,?,?,3,11,1,2,1,?)")
        .bind(did,id,String(b.divisionName||"Nội dung chính"),b.eventType||"doubles",b.format||"pool_to_knockout",nowIso()).run();
    }catch(error){
      if(bannerKey&&env.MEDIA)await env.MEDIA.delete(bannerKey).catch(()=>{});
      throw error;
    }
    return ok({success:true,status:"submitted",tournament:{id,name,posterUrl},division:{id:did}},request,env,201);
  }

  p=route(path,"/api/divisions/:id/generate-bracket");
  if(p&&method==="POST"){
    const user=await userRequired(request,env),tid=await assertDivision(env,user,p.id),result=await generateBracket(env,p.id);
    await emit(env,"public:state",{tournamentId:tid});return ok(result,request,env);
  }

  return null;
}
