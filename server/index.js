import "dotenv/config";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import fs from "node:fs/promises";
import {randomUUID} from "node:crypto";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import multer from "multer";
import QRCode from "qrcode";
import {Server as SocketServer} from "socket.io";
import {pool,tx} from "./db.js";
import {authRequired,allow,signUser,verifyPassword} from "./auth.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,"..");
const app=express();
const server=http.createServer(app);
const io=new SocketServer(server,{cors:{origin:true,credentials:true}});
const port=Number(process.env.PORT||8080);
const uploadRoot=path.join(root,"uploads");
const avatarDir=path.join(uploadRoot,"avatars");
const mediaDir=path.join(uploadRoot,"media");
await fs.mkdir(avatarDir,{recursive:true});
await fs.mkdir(mediaDir,{recursive:true});
const imageMimeExt={ "image/jpeg":".jpg","image/png":".png","image/webp":".webp" };
const avatarUpload=multer({
  storage:multer.diskStorage({
    destination:(req,file,cb)=>cb(null,avatarDir),
    filename:(req,file,cb)=>{
      const ext=imageMimeExt[file.mimetype]||".img";
      cb(null,`player-${randomUUID()}${ext}`);
    }
  }),
  limits:{fileSize:3*1024*1024},
  fileFilter:(req,file,cb)=>cb(null,Object.hasOwn(imageMimeExt,file.mimetype))
});
const mediaUpload=multer({
  storage:multer.diskStorage({
    destination:(req,file,cb)=>cb(null,mediaDir),
    filename:(req,file,cb)=>cb(null,`media-${randomUUID()}${imageMimeExt[file.mimetype]||".img"}`)
  }),
  limits:{fileSize:6*1024*1024},
  fileFilter:(req,file,cb)=>cb(null,Object.hasOwn(imageMimeExt,file.mimetype))
});
if(!process.env.DATABASE_URL)throw new Error("DATABASE_URL is required");
if(!process.env.JWT_SECRET||process.env.JWT_SECRET.length<32)throw new Error("JWT_SECRET must be at least 32 characters");

app.set("trust proxy",1);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"2mb"}));
app.use(cookieParser());

const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const slugify=s=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/đ/g,"d").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const nowTime=d=>d?new Date(d).toLocaleTimeString("vi-VN",{hour:"2-digit",minute:"2-digit"}):"—";
const publicStatus=s=>s==="scheduled"?"wait":s==="completed"?"done":s;

async function loadState({publicOnly=false}={}){
  const tSql=publicOnly
    ?"select * from tournaments where public_visible=true order by start_at desc"
    :"select * from tournaments order by start_at desc";
  const tournaments=(await pool.query(tSql)).rows.map(t=>({
    id:t.id,name:t.name,date:t.start_at?new Date(t.start_at).toLocaleDateString("vi-VN"):"Chưa chốt",
    startAt:t.start_at,endAt:t.end_at,venue:t.venue_name||"Chưa chốt",format:"Tournament",
    status:t.status==="registration"?"open":t.status,publicVisible:t.public_visible,teams:0
  }));
  const tournamentIds=tournaments.map(t=>t.id);
  if(!tournamentIds.length)return {tournaments:[],divisions:[],courts:[],teams:[],matches:[],audit:[]};

  const divisions=(await pool.query(
    publicOnly
      ?"select * from divisions where tournament_id=any($1::uuid[]) and active=true"
      :"select * from divisions where tournament_id=any($1::uuid[])",
    [tournamentIds]
  )).rows;
  for(const t of tournaments)t.format=divisions.filter(d=>d.tournament_id===t.id).map(d=>d.name).join(" • ")||"Tournament";
  const divisionIds=divisions.map(d=>d.id);
  const teamRows=divisionIds.length?(await pool.query(`
    select t.*,c.name club_name from teams t left join clubs c on c.id=t.club_id
    where t.division_id=any($1::uuid[]) ${publicOnly?"and t.status='active'":""} order by t.group_code,t.seed,t.name
  `,[divisionIds])).rows:[];
  const matchRows=divisionIds.length?(await pool.query(`
    select m.*, c.name court_name
    from matches m left join courts c on c.id=m.court_id
    where m.division_id=any($1::uuid[]) ${publicOnly?"and m.status<>'cancelled'":""}
    order by m.scheduled_at,m.created_at
  `,[divisionIds])).rows:[];

  const matchIds=matchRows.map(m=>m.id);
  const sets=matchIds.length?(await pool.query("select * from match_sets where match_id=any($1::uuid[]) order by set_no",[matchIds])).rows:[];
  const setMap=new Map();
  for(const s of sets){if(!setMap.has(s.match_id))setMap.set(s.match_id,[]);setMap.get(s.match_id).push([s.score_a,s.score_b]);}

  const stats=new Map(teamRows.map(t=>[t.id,{w:0,l:0,pf:0,pa:0}]));
  for(const m of matchRows.filter(x=>x.status==="completed"&&x.stage.startsWith("Bảng")&&x.winner_team_id)){
    const ms=setMap.get(m.id)||[];let ap=0,bp=0;for(const [a,b] of ms){ap+=a;bp+=b}
    const sa=stats.get(m.team_a_id),sb=stats.get(m.team_b_id);
    if(sa){sa.pf+=ap;sa.pa+=bp;m.winner_team_id===m.team_a_id?sa.w++:sa.l++}
    if(sb){sb.pf+=bp;sb.pa+=ap;m.winner_team_id===m.team_b_id?sb.w++:sb.l++}
  }
  const teams=teamRows.map(t=>({id:t.id,divisionId:t.division_id,name:t.name,club:t.club_name||"Tự do",clubId:t.club_id||null,group:t.group_code||"",seed:t.seed,status:t.status,...stats.get(t.id)}));
  const courtIndex={};
  const courts=(await pool.query(
    publicOnly
      ?"select * from courts where tournament_id=any($1::uuid[]) and active=true order by sort_order"
      :"select * from courts where tournament_id=any($1::uuid[]) order by sort_order",
    [tournamentIds]
  )).rows;
  courts.forEach((c,i)=>courtIndex[c.id]=c.sort_order||i+1);

  const matches=matchRows.map(m=>({
    id:m.id,divisionId:m.division_id,stage:m.stage,court:courtIndex[m.court_id]||m.court_name||"—",time:nowTime(m.scheduled_at),
    a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",status:publicStatus(m.status),sets:setMap.get(m.id)||[],
    current:[m.current_score_a,m.current_score_b],winner:m.winner_team_id||null,version:m.version,refereeId:m.referee_user_id||null,courtId:m.court_id||null,resultReason:m.result_reason||null,resultNote:m.result_note||null,bracketSlot:m.bracket_slot||null
  }));
  const audit=publicOnly?[]:(await pool.query(`
    select a.*,u.display_name from audit_logs a left join app_users u on u.id=a.actor_user_id
    order by a.created_at desc limit 100
  `)).rows.map(a=>({
    time:nowTime(a.created_at),user:a.display_name||"System",action:a.action,detail:a.reason||a.entity_type
  }));
  for(const t of tournaments)t.teams=teamRows.filter(x=>divisions.some(d=>d.id===x.division_id&&d.tournament_id===t.id)).length;
  return {tournaments,divisions:divisions.map(d=>({id:d.id,tournamentId:d.tournament_id,name:d.name,eventType:d.event_type,format:d.format,bestOf:d.best_of,pointsToWin:d.points_to_win,winByTwo:d.win_by_two,advanceCount:d.advance_count,active:d.active})),courts:courts.map(c=>({id:c.id,tournamentId:c.tournament_id,name:c.name,sortOrder:c.sort_order,active:c.active})),teams,matches,audit};
}

async function audit(c,user,entityType,entityId,action,beforeData,afterData,reason){
  await c.query(`
    insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data,reason)
    values($1,$2,$3,$4,$5,$6,$7)
  `,[user?.sub||null,entityType,String(entityId||""),action,beforeData||null,afterData||null,reason||null]);
}
async function emitState(){
  const state=await loadState({publicOnly:true});
  io.emit("public:state",state);
}
async function getMatch(c,id,lock=false){
  const q=`select m.*,d.best_of,d.points_to_win,d.win_by_two,d.tournament_id
    from matches m join divisions d on d.id=m.division_id where m.id=$1 ${lock?"for update":""}`;
  return (await c.query(q,[id])).rows[0];
}
function validateSet(a,b,target,winByTwo){
  const hi=Math.max(a,b),lo=Math.min(a,b);
  return hi>=target&&(!winByTwo||hi-lo>=2);
}
async function authorizeMatch(c,user,m){
  if(["super_admin","organizer"].includes(user.role))return true;
  if(user.role==="referee"&&m.referee_user_id===user.sub)return true;
  return false;
}

app.post("/api/auth/login",wrap(async(req,res)=>{
  const email=String(req.body.email||"").toLowerCase().trim();
  const password=String(req.body.password||"");
  const u=(await pool.query("select * from app_users where email=$1 and active=true",[email])).rows[0];
  if(!u||!u.password_hash||!(await verifyPassword(password,u.password_hash)))return res.status(401).json({error:"INVALID_CREDENTIALS"});
  const token=signUser(u);
  res.cookie("pickle_token",token,{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:12*60*60*1000});
  res.json({user:{id:u.id,email:u.email,name:u.display_name,role:u.role}});
}));
app.post("/api/auth/logout",(req,res)=>{res.clearCookie("pickle_token");res.json({ok:true})});
app.post("/api/auth/change-password",authRequired,wrap(async(req,res)=>{
  const current=String(req.body.currentPassword||""),next=String(req.body.newPassword||"");
  if(next.length<10)return res.status(400).json({error:"PASSWORD_TOO_SHORT"});
  const u=(await pool.query("select * from app_users where id=$1",[req.user.sub])).rows[0];
  if(!u||!u.password_hash||!(await verifyPassword(current,u.password_hash)))return res.status(401).json({error:"INVALID_CURRENT_PASSWORD"});
  const {hashPassword}=await import("./auth.js");const h=await hashPassword(next);
  await pool.query("update app_users set password_hash=$1 where id=$2",[h,u.id]);
  res.clearCookie("pickle_token");res.json({ok:true,reauthenticate:true});
}));
app.get("/api/auth/me",authRequired,(req,res)=>res.json({user:req.user}));

app.get("/api/public/players",wrap(async(req,res)=>{
  const {rows}=await pool.query(`
    select p.id,p.full_name,p.nickname,p.gender,p.rating,p.avatar_url,c.name club_name
    from players p left join clubs c on c.id=p.club_id
    where p.active=true order by p.rating desc nulls last,p.full_name
  `);
  res.json(rows);
}));
app.get("/api/public/players/:id",wrap(async(req,res)=>{
  const p=(await pool.query(`
    select p.id,p.full_name,p.nickname,p.gender,p.rating,p.avatar_url,p.bio,p.dominant_hand,p.birth_year,
      c.id club_id,c.name club_name,c.city club_city
    from players p left join clubs c on c.id=p.club_id
    where p.id=$1 and p.active=true
  `,[req.params.id])).rows[0];
  if(!p)return res.status(404).json({error:"NOT_FOUND"});

  const teamRows=(await pool.query(`
    select t.id,t.name,t.division_id,d.name division_name,tr.id tournament_id,tr.name tournament_name,tr.start_at,tr.status tournament_status
    from team_players tp
    join teams t on t.id=tp.team_id
    join divisions d on d.id=t.division_id
    join tournaments tr on tr.id=d.tournament_id
    where tp.player_id=$1
    order by tr.start_at desc nulls last
  `,[p.id])).rows;
  const teamIds=teamRows.map(t=>t.id);

  const partnerRows=teamIds.length?(await pool.query(`
    select distinct p2.id,p2.full_name,p2.nickname,p2.avatar_url,p2.rating,c.name club_name
    from team_players mine
    join team_players other on other.team_id=mine.team_id and other.player_id<>mine.player_id
    join players p2 on p2.id=other.player_id
    left join clubs c on c.id=p2.club_id
    where mine.player_id=$1
    order by p2.full_name
  `,[p.id])).rows:[];

  const matchRows=teamIds.length?(await pool.query(`
    select m.*,d.name division_name,tr.id tournament_id,tr.name tournament_name,tr.start_at tournament_start,
      ta.name team_a_name,tb.name team_b_name
    from matches m
    join divisions d on d.id=m.division_id
    join tournaments tr on tr.id=d.tournament_id
    left join teams ta on ta.id=m.team_a_id
    left join teams tb on tb.id=m.team_b_id
    where m.team_a_id=any($1::uuid[]) or m.team_b_id=any($1::uuid[])
    order by coalesce(m.completed_at,m.scheduled_at,m.created_at) desc
    limit 100
  `,[teamIds])).rows:[];
  const matchIds=matchRows.map(m=>m.id);
  const sets=matchIds.length?(await pool.query("select * from match_sets where match_id=any($1::uuid[]) order by match_id,set_no",[matchIds])).rows:[];
  const setMap=new Map();for(const s of sets){if(!setMap.has(s.match_id))setMap.set(s.match_id,[]);setMap.get(s.match_id).push([s.score_a,s.score_b])}

  let wins=0,losses=0,pf=0,pa=0;
  const matches=matchRows.map(m=>{
    const myTeam=teamIds.includes(m.team_a_id)?m.team_a_id:m.team_b_id;
    const side=myTeam===m.team_a_id?"A":"B";
    const ms=setMap.get(m.id)||[];
    let myPoints=0,oppPoints=0;
    for(const s of ms){if(side==="A"){myPoints+=s[0];oppPoints+=s[1]}else{myPoints+=s[1];oppPoints+=s[0]}}
    pf+=myPoints;pa+=oppPoints;
    const won=m.status==="completed"&&m.winner_team_id===myTeam;
    const lost=m.status==="completed"&&m.winner_team_id&&m.winner_team_id!==myTeam;
    if(won)wins++;if(lost)losses++;
    return {
      id:m.id,tournamentId:m.tournament_id,tournamentName:m.tournament_name,divisionName:m.division_name,
      stage:m.stage,status:publicStatus(m.status),scheduledAt:m.scheduled_at,completedAt:m.completed_at,
      teamAId:m.team_a_id,teamBId:m.team_b_id,teamAName:m.team_a_name||"TBD",teamBName:m.team_b_name||"TBD",
      myTeamId:myTeam,mySide:side,winnerTeamId:m.winner_team_id,won,lost,sets:ms,myPoints,oppPoints
    };
  });

  const ratingHistory=(await pool.query(`
    select before_rating,delta,after_rating,reason,created_at
    from rating_history where player_id=$1 order by created_at desc limit 100
  `,[p.id])).rows;

  res.json({
    profile:{
      id:p.id,fullName:p.full_name,nickname:p.nickname,gender:p.gender,rating:Number(p.rating||0),
      avatarUrl:p.avatar_url,bio:p.bio,dominantHand:p.dominant_hand,birthYear:p.birth_year,
      clubId:p.club_id,clubName:p.club_name,clubCity:p.club_city
    },
    stats:{wins,losses,matches:wins+losses,winRate:(wins+losses)?Math.round(wins*1000/(wins+losses))/10:0,pointsFor:pf,pointsAgainst:pa,diff:pf-pa},
    teams:teamRows,partners:partnerRows,matches,ratingHistory
  });
}));

app.get("/api/public/clubs",wrap(async(req,res)=>{
  const {rows}=await pool.query("select id,name,slug,city from clubs where active=true order by name");res.json(rows);
}));

app.get("/api/public/state",wrap(async(req,res)=>res.json(await loadState({publicOnly:true}))));

app.get("/api/public/posts",wrap(async(req,res)=>{
  const {rows}=await pool.query(`
    select id,tournament_id,title,slug,excerpt,body,cover_url,published_at
    from content_posts where status='published'
    order by published_at desc nulls last,created_at desc limit 100
  `);
  res.json(rows);
}));
app.get("/api/public/posts/:slug",wrap(async(req,res)=>{
  const row=(await pool.query(`
    select id,tournament_id,title,slug,excerpt,body,cover_url,published_at
    from content_posts where slug=$1 and status='published'
  `,[req.params.slug])).rows[0];
  if(!row)return res.status(404).json({error:"NOT_FOUND"});res.json(row);
}));
app.get("/api/public/sponsors",wrap(async(req,res)=>{
  const {rows}=await pool.query("select id,tournament_id,name,logo_url,website_url,tier,sort_order from sponsors order by sort_order,name");
  res.json(rows);
}));
app.get("/api/public/branding",wrap(async(req,res)=>{
  const row=(await pool.query("select value from app_settings where key='branding'")).rows[0];
  res.json(row?.value||{});
}));
app.get("/api/checkin/:token",wrap(async(req,res)=>{
  const row=(await pool.query(`
    select r.id,r.checked_in_at,t.name team_name,d.name division_name,tr.name tournament_name,tr.start_at
    from registrations r
    join divisions d on d.id=r.division_id
    join tournaments tr on tr.id=d.tournament_id
    left join teams t on t.id=r.team_id
    where r.checkin_token=$1
  `,[req.params.token])).rows[0];
  if(!row)return res.status(404).json({error:"NOT_FOUND"});res.json(row);
}));

app.get("/api/admin/state",authRequired,wrap(async(req,res)=>res.json(await loadState())));

app.get("/api/players",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query(`
    select p.id,p.full_name,p.nickname,p.gender,p.rating,p.phone,p.active,p.avatar_url,p.bio,p.dominant_hand,p.birth_year,c.id club_id,c.name club_name
    from players p left join clubs c on c.id=p.club_id order by p.full_name
  `);res.json(rows);
}));
app.post("/api/players",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {fullName,nickname,gender,rating=3,phone,clubId}=req.body;if(!fullName)return res.status(400).json({error:"NAME_REQUIRED"});
  const row=(await pool.query("insert into players(full_name,nickname,gender,rating,phone,club_id) values($1,$2,$3,$4,$5,$6) returning *",[fullName,nickname||null,gender||null,rating,phone||null,clubId||null])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'player',$2,'CREATE_PLAYER',$3)",[req.user.sub,row.id,row]);res.status(201).json(row);
}));
app.patch("/api/players/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query(`
    update players set full_name=coalesce($1,full_name),nickname=coalesce($2,nickname),gender=coalesce($3,gender),
      phone=coalesce($4,phone),club_id=coalesce($5,club_id),active=coalesce($6,active)
    where id=$7 returning *
  `,[req.body.fullName??null,req.body.nickname??null,req.body.gender??null,req.body.phone??null,req.body.clubId??null,req.body.active??null,req.params.id])).rows[0];
  if(!row)return res.status(404).json({error:"NOT_FOUND"});res.json(row);
}));
app.post("/api/players/:id/avatar",authRequired,allow("super_admin","organizer"),avatarUpload.single("avatar"),wrap(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:"INVALID_AVATAR"});
  const p=(await pool.query("select id,avatar_url from players where id=$1",[req.params.id])).rows[0];
  if(!p){await fs.unlink(req.file.path).catch(()=>{});return res.status(404).json({error:"NOT_FOUND"})}
  const avatarUrl=`/uploads/avatars/${req.file.filename}`;
  await pool.query("update players set avatar_url=$1 where id=$2",[avatarUrl,p.id]);
  if(p.avatar_url?.startsWith("/uploads/avatars/")){
    const old=path.join(root,p.avatar_url.replace(/^\//,""));await fs.unlink(old).catch(()=>{});
  }
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'player',$2,'UPDATE_AVATAR',$3)",[req.user.sub,p.id,{avatarUrl}]);
  res.json({avatarUrl});
}));

app.post("/api/players/:id/rating-adjust",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const delta=Number(req.body.delta),reason=String(req.body.reason||"").trim();
  if(!Number.isFinite(delta)||Math.abs(delta)>1||!reason)return res.status(400).json({error:"DELTA_AND_REASON_REQUIRED"});
  const row=await tx(async c=>{
    const p=(await c.query("select * from players where id=$1 for update",[req.params.id])).rows[0];
    if(!p)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const before=Number(p.rating||0),after=Math.max(0,before+delta);
    await c.query("update players set rating=$1 where id=$2",[after,p.id]);
    await c.query("insert into rating_history(player_id,before_rating,delta,after_rating,reason) values($1,$2,$3,$4,$5)",[p.id,before,delta,after,reason]);
    await audit(c,req.user,"player",p.id,"ADJUST_RATING",{rating:before},{rating:after},reason);
    return {...p,rating:after};
  });res.json(row);
}));
app.get("/api/clubs",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query("select * from clubs order by name");res.json(rows);
}));
app.post("/api/clubs",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const name=String(req.body.name||"").trim();if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  let slug=slugify(name);if((await pool.query("select 1 from clubs where slug=$1",[slug])).rowCount)slug+=`-${Date.now().toString().slice(-4)}`;
  const row=(await pool.query("insert into clubs(name,slug,city) values($1,$2,$3) returning *",[name,slug,req.body.city||null])).rows[0];res.status(201).json(row);
}));
app.post("/api/teams/:id/players",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const playerId=req.body.playerId;if(!playerId)return res.status(400).json({error:"PLAYER_REQUIRED"});
  await pool.query("insert into team_players(team_id,player_id) values($1,$2) on conflict do nothing",[req.params.id,playerId]);res.status(201).json({ok:true});
}));

app.post("/api/tournaments",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {name,venue,startAt,eventType="doubles",format="pool_to_knockout"}=req.body;
  if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  const data=await tx(async c=>{
    let slug=slugify(name);const exists=(await c.query("select 1 from tournaments where slug=$1",[slug])).rowCount;
    if(exists)slug+=`-${Date.now().toString().slice(-6)}`;
    const t=(await c.query(`
      insert into tournaments(owner_user_id,name,slug,venue_name,start_at,status,public_visible)
      values($1,$2,$3,$4,$5,'registration',true) returning *
    `,[req.user.sub,name,slug,venue||null,startAt||null])).rows[0];
    const d=(await c.query(`
      insert into divisions(tournament_id,name,event_type,format) values($1,$2,$3,$4) returning *
    `,[t.id,req.body.divisionName||"Open",eventType,format])).rows[0];
    await audit(c,req.user,"tournament",t.id,"CREATE_TOURNAMENT",null,t,name);
    return {tournament:t,division:d};
  });
  await emitState();res.status(201).json(data);
}));


app.post("/api/tournaments/:id/divisions",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {name,eventType="doubles",format="pool_to_knockout",bestOf=3,pointsToWin=11,winByTwo=true,advanceCount=2}=req.body;
  if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  if(!["singles","doubles","mixed_doubles","team"].includes(eventType))return res.status(400).json({error:"INVALID_EVENT_TYPE"});
  if(!["round_robin","pool_to_knockout","single_elimination","double_elimination"].includes(format))return res.status(400).json({error:"INVALID_FORMAT"});
  const row=(await pool.query(`
    insert into divisions(tournament_id,name,event_type,format,best_of,points_to_win,win_by_two,advance_count)
    values($1,$2,$3,$4,$5,$6,$7,$8) returning *
  `,[req.params.id,name,eventType,format,bestOf,pointsToWin,Boolean(winByTwo),advanceCount])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'division',$2,'CREATE_DIVISION',$3)",[req.user.sub,row.id,row]);
  await emitState();res.status(201).json(row);
}));

app.post("/api/tournaments/:id/courts",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const name=String(req.body.name||"").trim();if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  const sortOrder=req.body.sortOrder??Number((await pool.query("select coalesce(max(sort_order),0)+1 n from courts where tournament_id=$1",[req.params.id])).rows[0].n);
  const row=(await pool.query("insert into courts(tournament_id,name,sort_order,active) values($1,$2,$3,true) returning *",[req.params.id,name,sortOrder])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'court',$2,'CREATE_COURT',$3)",[req.user.sub,row.id,row]);
  await emitState();res.status(201).json(row);
}));

app.patch("/api/courts/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query("update courts set name=coalesce($1,name),active=coalesce($2,active),sort_order=coalesce($3,sort_order) where id=$4 returning *",[req.body.name??null,req.body.active??null,req.body.sortOrder??null,req.params.id])).rows[0];
  if(!row)return res.status(404).json({error:"NOT_FOUND"});await emitState();res.json(row);
}));

app.patch("/api/tournaments/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const fields=["name","venue_name","start_at","end_at","status","public_visible"];const vals=[];const sets=[];
  for(const f of fields){const key=f==="venue_name"?"venue":f==="start_at"?"startAt":f==="end_at"?"endAt":f==="public_visible"?"publicVisible":f;if(req.body[key]!==undefined){vals.push(req.body[key]);sets.push(`${f}=$${vals.length}`)}}
  if(!sets.length)return res.status(400).json({error:"NO_CHANGES"});
  vals.push(req.params.id);
  const before=(await pool.query("select * from tournaments where id=$1",[req.params.id])).rows[0];
  const after=(await pool.query(`update tournaments set ${sets.join(",")} where id=$${vals.length} returning *`,vals)).rows[0];
  if(!after)return res.status(404).json({error:"NOT_FOUND"});
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'tournament',$2,'UPDATE_TOURNAMENT',$3,$4)",[req.user.sub,after.id,before,after]);
  await emitState();res.json(after);
}));

app.post("/api/divisions/:id/teams",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {name,club,group="A",seed}=req.body;if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  const row=await tx(async c=>{
    let clubId=null;
    if(club){
      let cr=(await c.query("select id from clubs where lower(name)=lower($1) limit 1",[club])).rows[0];
      if(!cr)cr=(await c.query("insert into clubs(name,slug) values($1,$2) returning id",[club,slugify(club)+"-"+Date.now().toString().slice(-4)])).rows[0];
      clubId=cr.id;
    }
    const t=(await c.query("insert into teams(division_id,name,club_id,group_code,seed) values($1,$2,$3,$4,$5) returning *",[req.params.id,name,clubId,group,seed||null])).rows[0];
    await audit(c,req.user,"team",t.id,"CREATE_TEAM",null,t,name);return t;
  });
  await emitState();res.status(201).json(row);
}));

app.patch("/api/matches/:id/assignment",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {courtId,refereeUserId,scheduledAt}=req.body;
  const before=(await pool.query("select * from matches where id=$1",[req.params.id])).rows[0];
  if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const after=(await pool.query(`
    update matches set court_id=coalesce($1,court_id),referee_user_id=coalesce($2,referee_user_id),
    scheduled_at=coalesce($3,scheduled_at),version=version+1 where id=$4 returning *
  `,[courtId||null,refereeUserId||null,scheduledAt||null,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'match',$2,'ASSIGN_MATCH',$3,$4)",[req.user.sub,after.id,before,after]);
  await emitState();res.json(after);
}));

app.post("/api/matches/:id/point",authRequired,wrap(async(req,res)=>{
  const {side,delta,expectedVersion}=req.body;if(!["A","B"].includes(side)||![1,-1].includes(Number(delta)))return res.status(400).json({error:"BAD_SCORE_ACTION"});
  const updated=await tx(async c=>{
    const m=await getMatch(c,req.params.id,true);if(!m)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(!(await authorizeMatch(c,req.user,m)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
    if(expectedVersion!==undefined&&Number(expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409,currentVersion:m.version});
    if(m.status==="completed")throw Object.assign(new Error("MATCH_COMPLETED"),{status:409});
    const before={current_score_a:m.current_score_a,current_score_b:m.current_score_b,status:m.status,version:m.version};
    const col=side==="A"?"current_score_a":"current_score_b";
    const r=(await c.query(`
      update matches set ${col}=greatest(0,${col}+$1),status='live',
      started_at=coalesce(started_at,now()),version=version+1 where id=$2 returning *
    `,[Number(delta),m.id])).rows[0];
    await c.query("insert into score_events(match_id,actor_user_id,event_type,payload,match_version) values($1,$2,'POINT',$3,$4)",[m.id,req.user.sub,{before,side,delta:Number(delta)},r.version]);
    return r;
  });
  io.emit("match:update",{id:updated.id,version:updated.version});await emitState();res.json(updated);
}));

app.post("/api/matches/:id/finish-set",authRequired,wrap(async(req,res)=>{
  const updated=await tx(async c=>{
    const m=await getMatch(c,req.params.id,true);if(!m)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(!(await authorizeMatch(c,req.user,m)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
    if(req.body.expectedVersion!==undefined&&Number(req.body.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409});
    if(!validateSet(m.current_score_a,m.current_score_b,m.points_to_win,m.win_by_two))throw Object.assign(new Error("INVALID_SET_SCORE"),{status:400});
    const nextNo=Number((await c.query("select coalesce(max(set_no),0)+1 n from match_sets where match_id=$1",[m.id])).rows[0].n);
    await c.query("insert into match_sets(match_id,set_no,score_a,score_b,completed) values($1,$2,$3,$4,true)",[m.id,nextNo,m.current_score_a,m.current_score_b]);
    const r=(await c.query("update matches set current_score_a=0,current_score_b=0,version=version+1 where id=$1 returning *",[m.id])).rows[0];
    await c.query("insert into score_events(match_id,actor_user_id,event_type,payload,match_version) values($1,$2,'SET_FINISH',$3,$4)",[m.id,req.user.sub,{addedSetNo:nextNo,before:{scoreA:m.current_score_a,scoreB:m.current_score_b,version:m.version}},r.version]);
    return r;
  });
  io.emit("match:update",{id:updated.id,version:updated.version});await emitState();res.json(updated);
}));

app.post("/api/matches/:id/special-result",authRequired,wrap(async(req,res)=>{
  const reason=String(req.body.reason||"").trim();
  const note=String(req.body.note||"").trim();
  const allowedReasons=["walkover","no_show","retired","injury","disqualified"];
  if(!allowedReasons.includes(reason))return res.status(400).json({error:"INVALID_RESULT_REASON"});
  const updated=await tx(async c=>{
    const m=await getMatch(c,req.params.id,true);if(!m)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(!(await authorizeMatch(c,req.user,m)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
    if(m.status==="completed")throw Object.assign(new Error("MATCH_COMPLETED"),{status:409});
    const winner=req.body.winnerTeamId;
    if(!winner||![m.team_a_id,m.team_b_id].includes(winner))throw Object.assign(new Error("INVALID_WINNER"),{status:400});
    const loser=winner===m.team_a_id?m.team_b_id:m.team_a_id;
    const before={status:m.status,winner:m.winner_team_id,nextMatchId:m.next_match_id,nextSide:m.next_match_side,loserNextMatchId:m.loser_next_match_id,loserNextSide:m.loser_next_match_side};
    const r=(await c.query("update matches set winner_team_id=$1,status='completed',completed_at=now(),result_reason=$2,result_note=$3,version=version+1 where id=$4 returning *",[winner,reason,note||null,m.id])).rows[0];
    if(m.next_match_id&&m.next_match_side){
      const col=m.next_match_side==="A"?"team_a_id":"team_b_id";await c.query(`update matches set ${col}=$1,version=version+1 where id=$2`,[winner,m.next_match_id]);
    }
    if(loser&&m.loser_next_match_id&&m.loser_next_match_side){
      const col=m.loser_next_match_side==="A"?"team_a_id":"team_b_id";await c.query(`update matches set ${col}=$1,version=version+1 where id=$2`,[loser,m.loser_next_match_id]);
    }
    await c.query("insert into score_events(match_id,actor_user_id,event_type,payload,match_version) values($1,$2,'MATCH_FINISH',$3,$4)",[m.id,req.user.sub,{winner,loser,special:true,reason,before},r.version]);
    await audit(c,req.user,"match",m.id,"SPECIAL_RESULT",m,r,`${reason}: ${winner}`);
    return r;
  });
  io.emit("match:update",{id:updated.id,version:updated.version});await emitState();res.json(updated);
}));

app.post("/api/matches/:id/finish",authRequired,wrap(async(req,res)=>{
  const updated=await tx(async c=>{
    const m=await getMatch(c,req.params.id,true);if(!m)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(!(await authorizeMatch(c,req.user,m)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
    if(req.body.expectedVersion!==undefined&&Number(req.body.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409});
    const sets=(await c.query("select * from match_sets where match_id=$1 and completed=true order by set_no",[m.id])).rows;
    const aw=sets.filter(s=>s.score_a>s.score_b).length,bw=sets.filter(s=>s.score_b>s.score_a).length,need=Math.floor(m.best_of/2)+1;
    if(Math.max(aw,bw)<need)throw Object.assign(new Error("NOT_ENOUGH_SET_WINS"),{status:400});
    const winner=aw>bw?m.team_a_id:m.team_b_id;
    const loser=winner===m.team_a_id?m.team_b_id:m.team_a_id;
    const r=(await c.query("update matches set winner_team_id=$1,status='completed',completed_at=now(),result_reason=null,result_note=null,version=version+1 where id=$2 returning *",[winner,m.id])).rows[0];
    if(m.next_match_id&&m.next_match_side){
      const col=m.next_match_side==="A"?"team_a_id":"team_b_id";
      await c.query(`update matches set ${col}=$1,version=version+1 where id=$2`,[winner,m.next_match_id]);
    }
    if(loser&&m.loser_next_match_id&&m.loser_next_match_side){
      const col=m.loser_next_match_side==="A"?"team_a_id":"team_b_id";
      await c.query(`update matches set ${col}=$1,version=version+1 where id=$2`,[loser,m.loser_next_match_id]);
    }
    await c.query("insert into score_events(match_id,actor_user_id,event_type,payload,match_version) values($1,$2,'MATCH_FINISH',$3,$4)",[m.id,req.user.sub,{winner,loser,before:{status:m.status,winner:m.winner_team_id,nextMatchId:m.next_match_id,nextSide:m.next_match_side,loserNextMatchId:m.loser_next_match_id,loserNextSide:m.loser_next_match_side}},r.version]);
    await audit(c,req.user,"match",m.id,"FINISH_MATCH",m,r,`Winner: ${winner}`);
    return r;
  });
  io.emit("match:update",{id:updated.id,version:updated.version});await emitState();res.json(updated);
}));

app.post("/api/matches/:id/undo",authRequired,wrap(async(req,res)=>{
  const updated=await tx(async c=>{
    const m=await getMatch(c,req.params.id,true);if(!m)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(!(await authorizeMatch(c,req.user,m)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
    const ev=(await c.query("select * from score_events where match_id=$1 and event_type<>'UNDO' and undone_at is null order by id desc limit 1",[m.id])).rows[0];
    if(!ev)throw Object.assign(new Error("NOTHING_TO_UNDO"),{status:400});
    const p=ev.payload||{};
    if(ev.event_type==="POINT"&&p.before){
      await c.query("update matches set current_score_a=$1,current_score_b=$2,status=$3,version=version+1 where id=$4",[p.before.current_score_a,p.before.current_score_b,p.before.status,m.id]);
    }else if(ev.event_type==="SET_FINISH"&&p.addedSetNo){
      await c.query("delete from match_sets where match_id=$1 and set_no=$2",[m.id,p.addedSetNo]);
      await c.query("update matches set current_score_a=$1,current_score_b=$2,version=version+1 where id=$3",[p.before.scoreA,p.before.scoreB,m.id]);
    }else if(ev.event_type==="MATCH_FINISH"){
      await c.query("update matches set winner_team_id=$1,status=$2,completed_at=null,result_reason=null,result_note=null,version=version+1 where id=$3",[p.before?.winner||null,p.before?.status||"live",m.id]);
      if(p.before?.nextMatchId&&p.before?.nextSide){
        const downstream=(await c.query("select status from matches where id=$1 for update",[p.before.nextMatchId])).rows[0];
        if(downstream&&["live","completed"].includes(downstream.status))throw Object.assign(new Error("DOWNSTREAM_MATCH_STARTED"),{status:409});
        const col=p.before.nextSide==="A"?"team_a_id":"team_b_id";await c.query(`update matches set ${col}=null,version=version+1 where id=$1`,[p.before.nextMatchId]);
      }
      if(p.before?.loserNextMatchId&&p.before?.loserNextSide){
        const downstream=(await c.query("select status from matches where id=$1 for update",[p.before.loserNextMatchId])).rows[0];
        if(downstream&&["live","completed"].includes(downstream.status))throw Object.assign(new Error("DOWNSTREAM_MATCH_STARTED"),{status:409});
        const col=p.before.loserNextSide==="A"?"team_a_id":"team_b_id";await c.query(`update matches set ${col}=null,version=version+1 where id=$1`,[p.before.loserNextMatchId]);
      }
    }else throw Object.assign(new Error("UNDO_UNSUPPORTED"),{status:400});
    const r=await getMatch(c,m.id,false);
    await c.query("update score_events set undone_at=now() where id=$1",[ev.id]);
    await c.query("insert into score_events(match_id,actor_user_id,event_type,payload,match_version) values($1,$2,'UNDO',$3,$4)",[m.id,req.user.sub,{undoneEventId:ev.id},r.version]);
    await audit(c,req.user,"match",m.id,"UNDO_SCORE",ev,null,`Undo event ${ev.id}`);
    return r;
  });
  io.emit("match:update",{id:updated.id,version:updated.version});await emitState();res.json(updated);
}));


app.patch("/api/divisions/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from divisions where id=$1",[req.params.id])).rows[0];
  if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const bestOf=req.body.bestOf??before.best_of,points=req.body.pointsToWin??before.points_to_win,winByTwo=req.body.winByTwo??before.win_by_two,advance=req.body.advanceCount??before.advance_count;
  if(![1,3,5].includes(Number(bestOf))||![11,15,21].includes(Number(points)))return res.status(400).json({error:"INVALID_RULES"});
  const after=(await pool.query("update divisions set best_of=$1,points_to_win=$2,win_by_two=$3,advance_count=$4 where id=$5 returning *",[bestOf,points,Boolean(winByTwo),advance,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'division',$2,'UPDATE_RULES',$3,$4)",[req.user.sub,after.id,before,after]);
  await emitState();res.json(after);
}));


app.post("/api/divisions/:id/generate-round-robin",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const d=(await c.query("select d.*,t.start_at,t.id tournament_id from divisions d join tournaments t on t.id=d.tournament_id where d.id=$1 for update",[req.params.id])).rows[0];
    if(!d)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const teams=(await c.query("select id,group_code from teams where division_id=$1 and status='active' order by group_code,seed nulls last,name",[d.id])).rows;
    const courts=(await c.query("select id from courts where tournament_id=$1 and active=true order by sort_order",[d.tournament_id])).rows;
    if(!courts.length)throw Object.assign(new Error("NO_ACTIVE_COURTS"),{status:400});
    const groups=[...new Set(teams.map(t=>t.group_code).filter(Boolean))];
    if(!groups.length)throw Object.assign(new Error("NO_GROUPS"),{status:400});
    let created=0,slot=0;
    for(const group of groups){
      let ids=teams.filter(t=>t.group_code===group).map(t=>t.id);
      if(ids.length<2)continue;
      if(ids.length%2===1)ids=[...ids,null];
      const n=ids.length;let arr=[...ids];
      for(let round=0;round<n-1;round++){
        const pairs=[];
        for(let i=0;i<n/2;i++){const a=arr[i],b=arr[n-1-i];if(a&&b)pairs.push([a,b])}
        for(let i=0;i<pairs.length;i++){
          const [a,b]=pairs[i];
          const exists=(await c.query(`select 1 from matches where division_id=$1 and ((team_a_id=$2 and team_b_id=$3) or (team_a_id=$3 and team_b_id=$2)) limit 1`,[d.id,a,b])).rowCount;
          if(exists)continue;
          const batch=Math.floor(i/courts.length);
          const court=courts[i%courts.length].id;
          const minuteOffset=(slot+batch)*35;
          await c.query(`
            insert into matches(division_id,court_id,team_a_id,team_b_id,stage,round_no,scheduled_at,status)
            values($1,$2,$3,$4,$5,$6,coalesce($7,now())+($8||' minutes')::interval,'scheduled')
          `,[d.id,court,a,b,`Bảng ${group}`,round+1,d.start_at,String(minuteOffset)]);
          created++;
        }
        slot+=Math.max(1,Math.ceil(pairs.length/courts.length));
        arr=[arr[0],arr[n-1],...arr.slice(1,n-1)];
      }
      slot+=1;
    }
    await audit(c,req.user,"division",d.id,"GENERATE_ROUND_ROBIN",null,{created},`${created} matches`);
    return {created};
  });
  await emitState();res.json(result);
}));

app.post("/api/divisions/:id/generate-bracket",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const d=(await c.query("select * from divisions where id=$1 for update",[req.params.id])).rows[0];
    if(!d)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const unfinished=Number((await c.query("select count(*)::int n from matches where division_id=$1 and stage like 'Bảng %' and status<>'completed'",[d.id])).rows[0].n);
    if(unfinished>0)throw Object.assign(new Error("GROUP_STAGE_NOT_COMPLETE"),{status:409});
    const existing=Number((await c.query("select count(*)::int n from matches where division_id=$1 and (stage ilike '%Bán kết%' or stage ilike '%Chung kết%')",[d.id])).rows[0].n);
    if(existing>0)throw Object.assign(new Error("BRACKET_ALREADY_EXISTS"),{status:409});
    const teams=(await c.query("select id,group_code,seed from teams where division_id=$1 and status='active'",[d.id])).rows;
    const completed=(await c.query("select * from matches where division_id=$1 and stage like 'Bảng %' and status='completed'",[d.id])).rows;
    const mids=completed.map(m=>m.id);
    const sets=mids.length?(await c.query("select * from match_sets where match_id=any($1::uuid[]) and completed=true",[mids])).rows:[];
    const setMap=new Map();for(const s of sets){if(!setMap.has(s.match_id))setMap.set(s.match_id,[]);setMap.get(s.match_id).push(s)}
    const stats=new Map(teams.map(t=>[t.id,{w:0,l:0,pf:0,pa:0}]));
    for(const m of completed){
      let ap=0,bp=0;for(const s of setMap.get(m.id)||[]){ap+=s.score_a;bp+=s.score_b}
      const a=stats.get(m.team_a_id),b=stats.get(m.team_b_id);
      if(a){a.pf+=ap;a.pa+=bp;m.winner_team_id===m.team_a_id?a.w++:a.l++}
      if(b){b.pf+=bp;b.pa+=ap;m.winner_team_id===m.team_b_id?b.w++:b.l++}
    }
    const groups=[...new Set(teams.map(t=>t.group_code).filter(Boolean))].sort();
    if(groups.length!==2||Number(d.advance_count)!==2)throw Object.assign(new Error("BRACKET_GENERATOR_SUPPORTS_TWO_GROUPS_TOP2"),{status:400});
    const rank=g=>teams.filter(t=>t.group_code===g).sort((x,y)=>{const a=stats.get(x.id),b=stats.get(y.id);return b.w-a.w||((b.pf-b.pa)-(a.pf-a.pa))||b.pf-a.pf||((x.seed||999)-(y.seed||999))});
    const ga=rank(groups[0]),gb=rank(groups[1]);if(ga.length<2||gb.length<2)throw Object.assign(new Error("NOT_ENOUGH_QUALIFIERS"),{status:400});
    const tournamentId=(await c.query("select tournament_id from divisions where id=$1",[d.id])).rows[0].tournament_id;
    const courts=(await c.query("select id from courts where tournament_id=$1 and active=true order by sort_order limit 2",[tournamentId])).rows;
    if(!courts.length)throw Object.assign(new Error("NO_ACTIVE_COURTS"),{status:400});
    const start=(await c.query("select coalesce(max(scheduled_at),now()) + interval '45 minutes' t from matches where division_id=$1",[d.id])).rows[0].t;
    const s1=(await c.query("insert into matches(division_id,court_id,team_a_id,team_b_id,stage,scheduled_at,status) values($1,$2,$3,$4,'Bán kết 1',$5,'scheduled') returning id",[d.id,courts[0].id,ga[0].id,gb[1].id,start])).rows[0];
    const s2=(await c.query("insert into matches(division_id,court_id,team_a_id,team_b_id,stage,scheduled_at,status) values($1,$2,$3,$4,'Bán kết 2',$5,'scheduled') returning id",[d.id,(courts[1]||courts[0]).id,gb[0].id,ga[1].id,start])).rows[0];
    const final=(await c.query("insert into matches(division_id,court_id,stage,scheduled_at,status) values($1,$2,'Chung kết',$3::timestamptz+interval '45 minutes','scheduled') returning id",[d.id,courts[0].id,start])).rows[0];
    await c.query("update matches set next_match_id=$1,next_match_side='A' where id=$2",[final.id,s1.id]);
    await c.query("update matches set next_match_id=$1,next_match_side='B' where id=$2",[final.id,s2.id]);
    await audit(c,req.user,"division",d.id,"GENERATE_BRACKET",null,{semi1:s1.id,semi2:s2.id,final:final.id},"Top 2 each group");
    return {semi1:s1.id,semi2:s2.id,final:final.id};
  });
  await emitState();res.json(result);
}));

app.post("/api/divisions/:id/matches",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {teamAId,teamBId,courtId,stage="Vòng bảng",scheduledAt,refereeUserId}=req.body;
  if(!teamAId||!teamBId||teamAId===teamBId)return res.status(400).json({error:"INVALID_TEAMS"});
  const validTeams=Number((await pool.query("select count(*)::int n from teams where division_id=$1 and id=any($2::uuid[])",[req.params.id,[teamAId,teamBId]])).rows[0].n);
  if(validTeams!==2)return res.status(400).json({error:"TEAMS_NOT_IN_DIVISION"});
  const row=(await pool.query(`
    insert into matches(division_id,court_id,referee_user_id,team_a_id,team_b_id,stage,scheduled_at,status)
    values($1,$2,$3,$4,$5,$6,$7,'scheduled') returning *
  `,[req.params.id,courtId||null,refereeUserId||null,teamAId,teamBId,stage,scheduledAt||null])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'match',$2,'CREATE_MATCH',$3)",[req.user.sub,row.id,row]);
  await emitState();res.status(201).json(row);
}));

app.get("/api/registrations",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query(`
    select r.id,r.status,r.payment_status,r.amount,r.created_at,r.checked_in_at,r.checkin_token,t.name team_name,d.name division_name,tr.name tournament_name,
      p.id payment_id,p.status payment_review_status,p.method,p.reference_code,p.receipt_url
    from registrations r
    join divisions d on d.id=r.division_id join tournaments tr on tr.id=d.tournament_id
    left join teams t on t.id=r.team_id
    left join lateral (select * from payment_records where registration_id=r.id order by created_at desc limit 1) p on true
    order by r.created_at desc
  `);res.json(rows);
}));
app.post("/api/divisions/:id/registrations",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {teamId,amount}=req.body;if(!teamId)return res.status(400).json({error:"TEAM_REQUIRED"});
  const row=(await pool.query("insert into registrations(division_id,team_id,status,payment_status,amount) values($1,$2,'approved','unpaid',$3) returning *",[req.params.id,teamId,amount||null])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'registration',$2,'CREATE_REGISTRATION',$3)",[req.user.sub,row.id,row]);
  res.status(201).json(row);
}));
app.post("/api/registrations/:id/payment",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {method,referenceCode,receiptUrl}=req.body;
  const row=(await pool.query("insert into payment_records(registration_id,method,reference_code,receipt_url,status) values($1,$2,$3,$4,'pending') returning *",[req.params.id,method||"bank_transfer",referenceCode||null,receiptUrl||null])).rows[0];
  await pool.query("update registrations set payment_status='pending' where id=$1",[req.params.id]);res.status(201).json(row);
}));
app.patch("/api/payment-records/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  if(!["approved","rejected","refunded"].includes(req.body.status))return res.status(400).json({error:"INVALID_STATUS"});
  const row=await tx(async c=>{
    const p=(await c.query("update payment_records set status=$1,reviewed_by=$2,reviewed_at=now() where id=$3 returning *",[req.body.status,req.user.sub,req.params.id])).rows[0];
    if(!p)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const mapped=req.body.status==="approved"?"paid":req.body.status==="refunded"?"refunded":"unpaid";
    await c.query("update registrations set payment_status=$1 where id=$2",[mapped,p.registration_id]);
    await audit(c,req.user,"payment",p.id,"REVIEW_PAYMENT",null,p,req.body.status);return p;
  });res.json(row);
}));


app.post("/api/uploads/image",authRequired,allow("super_admin","organizer"),mediaUpload.single("image"),wrap(async(req,res)=>{
  if(!req.file)return res.status(400).json({error:"INVALID_IMAGE"});
  res.status(201).json({url:`/uploads/media/${req.file.filename}`});
}));

app.post("/api/registrations/:id/checkin",authRequired,allow("super_admin","organizer","referee"),wrap(async(req,res)=>{
  const row=await tx(async c=>{
    const before=(await c.query("select * from registrations where id=$1 for update",[req.params.id])).rows[0];
    if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const after=(await c.query("update registrations set checked_in_at=coalesce(checked_in_at,now()),checked_in_by=$1 where id=$2 returning *",[req.user.sub,req.params.id])).rows[0];
    await audit(c,req.user,"registration",after.id,"CHECK_IN",before,after,"Tournament check-in");
    return after;
  });
  res.json(row);
}));
app.post("/api/registrations/:id/undo-checkin",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=await tx(async c=>{
    const before=(await c.query("select * from registrations where id=$1 for update",[req.params.id])).rows[0];
    if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const after=(await c.query("update registrations set checked_in_at=null,checked_in_by=null where id=$1 returning *",[req.params.id])).rows[0];
    await audit(c,req.user,"registration",after.id,"UNDO_CHECK_IN",before,after,"Undo check-in");
    return after;
  });res.json(row);
}));
app.get("/api/registrations/:id/checkin-qr",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query("select id,checkin_token from registrations where id=$1",[req.params.id])).rows[0];
  if(!row)return res.status(404).json({error:"NOT_FOUND"});
  const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  const url=`${base}/checkin.html?token=${row.checkin_token}`;
  const dataUrl=await QRCode.toDataURL(url,{margin:1,width:420,color:{dark:"#0d2118",light:"#ffffff"}});
  res.json({token:row.checkin_token,url,dataUrl});
}));
app.post("/api/checkin/:token/confirm",authRequired,allow("super_admin","organizer","referee"),wrap(async(req,res)=>{
  const row=(await pool.query("select id from registrations where checkin_token=$1",[req.params.token])).rows[0];
  if(!row)return res.status(404).json({error:"NOT_FOUND"});
  req.params.id=row.id;
  const updated=(await pool.query("update registrations set checked_in_at=coalesce(checked_in_at,now()),checked_in_by=$1 where id=$2 returning *",[req.user.sub,row.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data,reason) values($1,'registration',$2,'QR_CHECK_IN',$3,'QR check-in')",[req.user.sub,row.id,updated]);
  res.json(updated);
}));

app.get("/api/sponsors",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query("select * from sponsors order by sort_order,name");res.json(rows);
}));
app.post("/api/sponsors",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {tournamentId,name,logoUrl,websiteUrl,tier,sortOrder=0}=req.body;if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  const row=(await pool.query("insert into sponsors(tournament_id,name,logo_url,website_url,tier,sort_order) values($1,$2,$3,$4,$5,$6) returning *",[tournamentId||null,name,logoUrl||null,websiteUrl||null,tier||null,sortOrder])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'sponsor',$2,'CREATE_SPONSOR',$3)",[req.user.sub,row.id,row]);res.status(201).json(row);
}));
app.patch("/api/sponsors/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from sponsors where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const row=(await pool.query("update sponsors set name=coalesce($1,name),logo_url=coalesce($2,logo_url),website_url=coalesce($3,website_url),tier=coalesce($4,tier),sort_order=coalesce($5,sort_order),tournament_id=coalesce($6,tournament_id) where id=$7 returning *",[req.body.name??null,req.body.logoUrl??null,req.body.websiteUrl??null,req.body.tier??null,req.body.sortOrder??null,req.body.tournamentId??null,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'sponsor',$2,'UPDATE_SPONSOR',$3,$4)",[req.user.sub,row.id,before,row]);res.json(row);
}));
app.delete("/api/sponsors/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query("delete from sponsors where id=$1 returning *",[req.params.id])).rows[0];if(!row)return res.status(404).json({error:"NOT_FOUND"});
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data) values($1,'sponsor',$2,'DELETE_SPONSOR',$3)",[req.user.sub,row.id,row]);res.json({ok:true});
}));

app.get("/api/posts",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query("select * from content_posts order by created_at desc");res.json(rows);
}));
app.post("/api/posts",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {title,excerpt,body,coverUrl,status="draft",tournamentId}=req.body;if(!title)return res.status(400).json({error:"TITLE_REQUIRED"});
  let slug=slugify(title);if((await pool.query("select 1 from content_posts where slug=$1",[slug])).rowCount)slug+=`-${Date.now().toString().slice(-5)}`;
  const publishedAt=status==="published"?new Date():null;
  const row=(await pool.query("insert into content_posts(tournament_id,title,slug,excerpt,body,cover_url,status,published_at,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *",[tournamentId||null,title,slug,excerpt||null,body||null,coverUrl||null,status,publishedAt,req.user.sub])).rows[0];
  res.status(201).json(row);
}));
app.patch("/api/posts/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from content_posts where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const status=req.body.status??before.status;
  const publishedAt=status==="published"?(before.published_at||new Date()):before.published_at;
  const row=(await pool.query("update content_posts set title=coalesce($1,title),excerpt=coalesce($2,excerpt),body=coalesce($3,body),cover_url=coalesce($4,cover_url),status=$5,published_at=$6,tournament_id=coalesce($7,tournament_id),updated_at=now() where id=$8 returning *",[req.body.title??null,req.body.excerpt??null,req.body.body??null,req.body.coverUrl??null,status,publishedAt,req.body.tournamentId??null,req.params.id])).rows[0];
  await audit(pool,req.user,"post",row.id,"UPDATE_POST",before,row,status);res.json(row);
}));
app.delete("/api/posts/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query("delete from content_posts where id=$1 returning *",[req.params.id])).rows[0];if(!row)return res.status(404).json({error:"NOT_FOUND"});res.json({ok:true});
}));

app.get("/api/settings/branding",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query("select value from app_settings where key='branding'")).rows[0];res.json(row?.value||{});
}));
app.put("/api/settings/branding",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const value=req.body||{};
  const row=(await pool.query(`
    insert into app_settings(key,value,updated_by) values('branding',$1,$2)
    on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=now()
    returning value
  `,[value,req.user.sub])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'setting','branding','UPDATE_BRANDING',$2)",[req.user.sub,value]);
  res.json(row.value);
}));

app.get("/api/bookings",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query(`
    select b.*,c.name court_name,t.name tournament_name from court_bookings b
    join courts c on c.id=b.court_id join tournaments t on t.id=c.tournament_id
    order by b.start_at desc limit 500
  `);res.json(rows);
}));
app.post("/api/bookings",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {courtId,title,contactName,contactPhone,startAt,endAt,notes}=req.body;
  if(!courtId||!title||!startAt||!endAt)return res.status(400).json({error:"FIELDS_REQUIRED"});
  const clash=Number((await pool.query("select count(*)::int n from court_bookings where court_id=$1 and status<>'cancelled' and tstzrange(start_at,end_at,'[)') && tstzrange($2::timestamptz,$3::timestamptz,'[)')",[courtId,startAt,endAt])).rows[0].n);
  if(clash)return res.status(409).json({error:"BOOKING_CONFLICT"});
  const row=(await pool.query("insert into court_bookings(court_id,title,contact_name,contact_phone,start_at,end_at,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8) returning *",[courtId,title,contactName||null,contactPhone||null,startAt,endAt,notes||null,req.user.sub])).rows[0];res.status(201).json(row);
}));
app.patch("/api/bookings/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const row=(await pool.query("update court_bookings set title=coalesce($1,title),contact_name=coalesce($2,contact_name),contact_phone=coalesce($3,contact_phone),status=coalesce($4,status),notes=coalesce($5,notes) where id=$6 returning *",[req.body.title??null,req.body.contactName??null,req.body.contactPhone??null,req.body.status??null,req.body.notes??null,req.params.id])).rows[0];if(!row)return res.status(404).json({error:"NOT_FOUND"});res.json(row);
}));

app.get("/api/reports/overview",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const tournamentId=req.query.tournamentId||null;
  const params=tournamentId?[tournamentId]:[];
  const dWhere=tournamentId?"where d.tournament_id=$1":"";
  const mWhere=tournamentId?"where d.tournament_id=$1":"";
  const reg=(await pool.query(`
    select count(*)::int registrations,
      count(*) filter(where r.checked_in_at is not null)::int checked_in,
      count(*) filter(where r.payment_status='paid')::int paid_count,
      coalesce(sum(r.amount) filter(where r.payment_status='paid'),0)::numeric revenue
    from registrations r join divisions d on d.id=r.division_id ${dWhere}
  `,params)).rows[0];
  const mat=(await pool.query(`
    select count(*)::int matches,
      count(*) filter(where m.status='live')::int live,
      count(*) filter(where m.status='completed')::int completed
    from matches m join divisions d on d.id=m.division_id ${mWhere}
  `,params)).rows[0];
  const players=Number((await pool.query("select count(*)::int n from players where active=true")).rows[0].n);
  res.json({...reg,...mat,players});
}));
app.get("/api/reports/export.csv",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const rows=(await pool.query(`
    select tr.name tournament,d.name division,t.name team,r.status registration_status,r.payment_status,r.amount,r.checked_in_at
    from registrations r join divisions d on d.id=r.division_id join tournaments tr on tr.id=d.tournament_id
    left join teams t on t.id=r.team_id order by tr.start_at desc,t.name
  `)).rows;
  const q=v=>'"'+String(v??"").replaceAll('"','""')+'"';
  const csv=["Tournament,Division,Team,Registration,Payment,Amount,CheckedIn",...rows.map(x=>[x.tournament,x.division,x.team,x.registration_status,x.payment_status,x.amount,x.checked_in_at].map(q).join(","))].join("\n");
  res.setHeader("Content-Disposition","attachment; filename=pickle-tour-report.csv");res.type("text/csv; charset=utf-8").send("\ufeff"+csv);
}));


app.delete("/api/tournaments/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const before=(await c.query("select * from tournaments where id=$1 for update",[req.params.id])).rows[0];
    if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const deps=(await c.query(`
      select
        (select count(*)::int from registrations r join divisions d on d.id=r.division_id where d.tournament_id=$1) registrations,
        (select count(*)::int from matches m join divisions d on d.id=m.division_id where d.tournament_id=$1) matches
    `,[before.id])).rows[0];
    if(deps.registrations>0||deps.matches>0){
      const after=(await c.query("update tournaments set status='cancelled',public_visible=false,updated_at=now() where id=$1 returning *",[before.id])).rows[0];
      await audit(c,req.user,"tournament",before.id,"ARCHIVE_TOURNAMENT",before,after,"Tournament has operational history");
      return {mode:"archived",entity:after};
    }
    await c.query("delete from tournaments where id=$1",[before.id]);
    await audit(c,req.user,"tournament",before.id,"DELETE_TOURNAMENT",before,null,"Unused tournament");
    return {mode:"deleted"};
  });
  await emitState();res.json(result);
}));

app.patch("/api/divisions/:id/full",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from divisions where id=$1",[req.params.id])).rows[0];
  if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const next={
    name:req.body.name??before.name,
    eventType:req.body.eventType??before.event_type,
    format:req.body.format??before.format,
    bestOf:Number(req.body.bestOf??before.best_of),
    pointsToWin:Number(req.body.pointsToWin??before.points_to_win),
    winByTwo:req.body.winByTwo??before.win_by_two,
    advanceCount:Number(req.body.advanceCount??before.advance_count),
    active:req.body.active??before.active
  };
  if(!next.name.trim())return res.status(400).json({error:"NAME_REQUIRED"});
  if(!["singles","doubles","mixed_doubles","team"].includes(next.eventType))return res.status(400).json({error:"INVALID_EVENT_TYPE"});
  if(!["round_robin","pool_to_knockout","single_elimination","double_elimination"].includes(next.format))return res.status(400).json({error:"INVALID_FORMAT"});
  if(![1,3,5].includes(next.bestOf)||![11,15,21].includes(next.pointsToWin)||next.advanceCount<1)return res.status(400).json({error:"INVALID_RULES"});
  const after=(await pool.query(`
    update divisions set name=$1,event_type=$2,format=$3,best_of=$4,points_to_win=$5,win_by_two=$6,advance_count=$7,active=$8,updated_at=now()
    where id=$9 returning *
  `,[next.name.trim(),next.eventType,next.format,next.bestOf,next.pointsToWin,Boolean(next.winByTwo),next.advanceCount,Boolean(next.active),req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'division',$2,'UPDATE_DIVISION',$3,$4)",[req.user.sub,after.id,before,after]);
  await emitState();res.json(after);
}));

app.delete("/api/divisions/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const before=(await c.query("select * from divisions where id=$1 for update",[req.params.id])).rows[0];
    if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const deps=(await c.query("select (select count(*)::int from matches where division_id=$1) matches,(select count(*)::int from registrations where division_id=$1) registrations",[before.id])).rows[0];
    if(deps.matches>0||deps.registrations>0){
      const after=(await c.query("update divisions set active=false,updated_at=now() where id=$1 returning *",[before.id])).rows[0];
      await audit(c,req.user,"division",before.id,"ARCHIVE_DIVISION",before,after,"Division has history");
      return {mode:"archived",entity:after};
    }
    await c.query("delete from divisions where id=$1",[before.id]);
    await audit(c,req.user,"division",before.id,"DELETE_DIVISION",before,null,"Unused division");
    return {mode:"deleted"};
  });
  await emitState();res.json(result);
}));

app.delete("/api/courts/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const before=(await c.query("select * from courts where id=$1 for update",[req.params.id])).rows[0];
    if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const deps=Number((await c.query("select ((select count(*) from matches where court_id=$1)+(select count(*) from court_bookings where court_id=$1))::int n",[before.id])).rows[0].n);
    if(deps>0){
      const after=(await c.query("update courts set active=false,updated_at=now() where id=$1 returning *",[before.id])).rows[0];
      await audit(c,req.user,"court",before.id,"ARCHIVE_COURT",before,after,"Court has usage history");
      return {mode:"archived",entity:after};
    }
    await c.query("delete from courts where id=$1",[before.id]);
    await audit(c,req.user,"court",before.id,"DELETE_COURT",before,null,"Unused court");
    return {mode:"deleted"};
  });
  await emitState();res.json(result);
}));

app.patch("/api/clubs/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from clubs where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const name=String(req.body.name??before.name).trim();if(!name)return res.status(400).json({error:"NAME_REQUIRED"});
  const after=(await pool.query("update clubs set name=$1,city=$2,active=$3 where id=$4 returning *",[name,req.body.city??before.city,req.body.active??before.active,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'club',$2,'UPDATE_CLUB',$3,$4)",[req.user.sub,after.id,before,after]);res.json(after);
}));
app.delete("/api/clubs/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const before=(await c.query("select * from clubs where id=$1 for update",[req.params.id])).rows[0];if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const deps=Number((await c.query("select ((select count(*) from players where club_id=$1)+(select count(*) from teams where club_id=$1))::int n",[before.id])).rows[0].n);
    if(deps>0){
      const after=(await c.query("update clubs set active=false where id=$1 returning *",[before.id])).rows[0];
      await audit(c,req.user,"club",before.id,"ARCHIVE_CLUB",before,after,"Club has linked players/teams");return {mode:"archived",entity:after};
    }
    await c.query("delete from clubs where id=$1",[before.id]);await audit(c,req.user,"club",before.id,"DELETE_CLUB",before,null,"Unused club");return {mode:"deleted"};
  });res.json(result);
}));

app.delete("/api/players/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from players where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const after=(await pool.query("update players set active=false,updated_at=now() where id=$1 returning *",[req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'player',$2,'DEACTIVATE_PLAYER',$3,$4)",[req.user.sub,after.id,before,after]);res.json({mode:"deactivated",entity:after});
}));

app.patch("/api/teams/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from teams where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  let clubId=before.club_id;
  if(req.body.clubId!==undefined)clubId=req.body.clubId||null;
  const after=(await pool.query(`
    update teams set name=$1,club_id=$2,group_code=$3,seed=$4,status=$5,updated_at=now() where id=$6 returning *
  `,[String(req.body.name??before.name).trim(),clubId,req.body.group??before.group_code,req.body.seed??before.seed,req.body.status??before.status,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'team',$2,'UPDATE_TEAM',$3,$4)",[req.user.sub,after.id,before,after]);await emitState();res.json(after);
}));
app.delete("/api/teams/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const before=(await c.query("select * from teams where id=$1 for update",[req.params.id])).rows[0];if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    const deps=Number((await c.query("select ((select count(*) from matches where team_a_id=$1 or team_b_id=$1)+(select count(*) from registrations where team_id=$1))::int n",[before.id])).rows[0].n);
    if(deps>0){
      const after=(await c.query("update teams set status='withdrawn',updated_at=now() where id=$1 returning *",[before.id])).rows[0];
      await audit(c,req.user,"team",before.id,"WITHDRAW_TEAM",before,after,"Team has operational history");return {mode:"withdrawn",entity:after};
    }
    await c.query("delete from teams where id=$1",[before.id]);await audit(c,req.user,"team",before.id,"DELETE_TEAM",before,null,"Unused team");return {mode:"deleted"};
  });await emitState();res.json(result);
}));

app.patch("/api/matches/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from matches where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  if(before.status==="completed"&&req.body.status&&req.body.status!=="completed")return res.status(409).json({error:"COMPLETED_MATCH_LOCKED"});
  const status=req.body.status??before.status;
  if(!["scheduled","ready","live","completed","walkover","cancelled"].includes(status))return res.status(400).json({error:"INVALID_STATUS"});
  const after=(await pool.query(`
    update matches set stage=$1,scheduled_at=$2,court_id=$3,referee_user_id=$4,status=$5,version=version+1 where id=$6 returning *
  `,[req.body.stage??before.stage,req.body.scheduledAt??before.scheduled_at,req.body.courtId??before.court_id,req.body.refereeUserId??before.referee_user_id,status,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'match',$2,'UPDATE_MATCH',$3,$4)",[req.user.sub,after.id,before,after]);await emitState();res.json(after);
}));
app.delete("/api/matches/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const result=await tx(async c=>{
    const before=await getMatch(c,req.params.id,true);if(!before)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(before.status==="completed")throw Object.assign(new Error("COMPLETED_MATCH_LOCKED"),{status:409});
    const scoreEvents=Number((await c.query("select count(*)::int n from score_events where match_id=$1",[before.id])).rows[0].n);
    if(before.status!=="scheduled"||scoreEvents>0){
      const after=(await c.query("update matches set status='cancelled',version=version+1 where id=$1 returning *",[before.id])).rows[0];
      await audit(c,req.user,"match",before.id,"CANCEL_MATCH",before,after,"Match has started/history");return {mode:"cancelled",entity:after};
    }
    await c.query("delete from matches where id=$1",[before.id]);await audit(c,req.user,"match",before.id,"DELETE_MATCH",before,null,"Unused match");return {mode:"deleted"};
  });await emitState();res.json(result);
}));

app.patch("/api/registrations/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from registrations where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const status=req.body.status??before.status,paymentStatus=req.body.paymentStatus??before.payment_status;
  if(!["pending","approved","waitlist","cancelled"].includes(status))return res.status(400).json({error:"INVALID_STATUS"});
  if(!["unpaid","pending","paid","refunded"].includes(paymentStatus))return res.status(400).json({error:"INVALID_PAYMENT_STATUS"});
  const after=(await pool.query("update registrations set status=$1,payment_status=$2,amount=$3 where id=$4 returning *",[status,paymentStatus,req.body.amount??before.amount,req.params.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'registration',$2,'UPDATE_REGISTRATION',$3,$4)",[req.user.sub,after.id,before,after]);res.json(after);
}));
app.delete("/api/registrations/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from registrations where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const hasPayment=Number((await pool.query("select count(*)::int n from payment_records where registration_id=$1",[before.id])).rows[0].n);
  if(hasPayment||before.checked_in_at){
    const after=(await pool.query("update registrations set status='cancelled' where id=$1 returning *",[before.id])).rows[0];
    await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'registration',$2,'CANCEL_REGISTRATION',$3,$4)",[req.user.sub,after.id,before,after]);return res.json({mode:"cancelled",entity:after});
  }
  await pool.query("delete from registrations where id=$1",[before.id]);await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data) values($1,'registration',$2,'DELETE_REGISTRATION',$3)",[req.user.sub,before.id,before]);res.json({mode:"deleted"});
}));

app.delete("/api/bookings/:id",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const before=(await pool.query("select * from court_bookings where id=$1",[req.params.id])).rows[0];if(!before)return res.status(404).json({error:"NOT_FOUND"});
  const after=(await pool.query("update court_bookings set status='cancelled' where id=$1 returning *",[before.id])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,before_data,after_data) values($1,'booking',$2,'CANCEL_BOOKING',$3,$4)",[req.user.sub,after.id,before,after]);res.json({mode:"cancelled",entity:after});
}));

app.get("/api/users/referees",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query("select id,email,display_name,active from app_users where role='referee' order by display_name");res.json(rows);
}));
app.post("/api/users/referees",authRequired,allow("super_admin"),wrap(async(req,res)=>{
  const {email,name,password}=req.body;if(!email||!name||!password)return res.status(400).json({error:"FIELDS_REQUIRED"});
  const {hashPassword}=await import("./auth.js");const h=await hashPassword(password);
  const r=(await pool.query("insert into app_users(email,display_name,role,password_hash) values($1,$2,'referee',$3) returning id,email,display_name,role",[email.toLowerCase(),name,h])).rows[0];res.status(201).json(r);
}));
app.get("/api/audit",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query("select * from audit_logs order by created_at desc limit 500");res.json(rows);
}));

app.get("/api/health",wrap(async(req,res)=>{
  const db=(await pool.query("select now() as now")).rows[0];
  res.json({status:"ok",service:"pickle-tour",database:"ok",time:db.now});
}));

io.on("connection",socket=>{socket.emit("connected",{ok:true})});

app.use("/assets",express.static(path.join(root,"assets"),{fallthrough:false,maxAge:process.env.NODE_ENV==="production"?"1h":0}));
app.use("/uploads",express.static(uploadRoot,{fallthrough:false,maxAge:process.env.NODE_ENV==="production"?"7d":0}));
app.get("/",(req,res)=>res.sendFile(path.join(root,"index.html")));
app.get("/index.html",(req,res)=>res.sendFile(path.join(root,"index.html")));
app.get("/admin",(req,res)=>res.sendFile(path.join(root,"admin.html")));
app.get("/admin.html",(req,res)=>res.sendFile(path.join(root,"admin.html")));
app.get("/login",(req,res)=>res.sendFile(path.join(root,"login.html")));
app.get("/login.html",(req,res)=>res.sendFile(path.join(root,"login.html")));
app.get("/tournament.html",(req,res)=>res.sendFile(path.join(root,"tournament.html")));
app.get("/ranking.html",(req,res)=>res.sendFile(path.join(root,"ranking.html")));
app.get("/player.html",(req,res)=>res.sendFile(path.join(root,"player.html")));
app.get("/checkin.html",(req,res)=>res.sendFile(path.join(root,"checkin.html")));
app.get("/about.html",(req,res)=>res.sendFile(path.join(root,"about.html")));
app.get("/manifest.webmanifest",(req,res)=>res.type("application/manifest+json").sendFile(path.join(root,"manifest.webmanifest")));
app.get("/service-worker.js",(req,res)=>{res.set("Cache-Control","no-cache");res.type("application/javascript").sendFile(path.join(root,"service-worker.js"))});
app.get("/offline.html",(req,res)=>res.sendFile(path.join(root,"offline.html")));
app.get("/robots.txt",(req,res)=>{
  const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /login\nSitemap: ${base}/sitemap.xml\n`);
});
app.get("/sitemap.xml",wrap(async(req,res)=>{
  const base=(process.env.PUBLIC_BASE_URL||`${req.protocol}://${req.get("host")}`).replace(/\/$/,"");
  const tours=(await pool.query("select id from tournaments where public_visible=true order by start_at desc")).rows;
  const urls=[`${base}/`,`${base}/ranking.html`,`${base}/about.html`,...tours.map(t=>`${base}/tournament.html?id=${encodeURIComponent(t.id)}`)];
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+urls.map(u=>`<url><loc>${u.replace(/&/g,"&amp;")}</loc></url>`).join("")+"</urlset>";
  res.type("application/xml").send(xml);
}));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({error:err.message||"SERVER_ERROR",currentVersion:err.currentVersion});
});
server.listen(port,()=>console.log(`Pickle Tour listening on :${port}`));
