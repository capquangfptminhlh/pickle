import "dotenv/config";
import http from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {Server as SocketServer} from "socket.io";
import {pool,tx} from "./db.js";
import {authRequired,allow,signUser,verifyPassword} from "./auth.js";

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(__dirname,"..");
const app=express();
const server=http.createServer(app);
const io=new SocketServer(server,{cors:{origin:true,credentials:true}});
const port=Number(process.env.PORT||8080);

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
    venue:t.venue_name||"Chưa chốt",format:"Tournament",status:t.status==="registration"?"open":t.status,teams:0
  }));
  const tournamentIds=tournaments.map(t=>t.id);
  if(!tournamentIds.length)return {tournaments:[],teams:[],matches:[],audit:[]};

  const divisions=(await pool.query("select * from divisions where tournament_id=any($1::uuid[])",[tournamentIds])).rows;
  const divisionIds=divisions.map(d=>d.id);
  const teamRows=divisionIds.length?(await pool.query(`
    select t.*,c.name club_name from teams t left join clubs c on c.id=t.club_id
    where t.division_id=any($1::uuid[]) order by t.group_code,t.seed,t.name
  `,[divisionIds])).rows:[];
  const matchRows=divisionIds.length?(await pool.query(`
    select m.*, c.name court_name
    from matches m left join courts c on c.id=m.court_id
    where m.division_id=any($1::uuid[])
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
  const teams=teamRows.map(t=>({id:t.id,divisionId:t.division_id,name:t.name,club:t.club_name||"Tự do",group:t.group_code||"",seed:t.seed,...stats.get(t.id)}));
  const courtIndex={};
  const courts=(await pool.query("select * from courts where tournament_id=any($1::uuid[]) order by sort_order",[tournamentIds])).rows;
  courts.forEach((c,i)=>courtIndex[c.id]=c.sort_order||i+1);

  const matches=matchRows.map(m=>({
    id:m.id,divisionId:m.division_id,stage:m.stage,court:courtIndex[m.court_id]||m.court_name||"—",time:nowTime(m.scheduled_at),
    a:m.team_a_id||"TBD",b:m.team_b_id||"TBD",status:publicStatus(m.status),sets:setMap.get(m.id)||[],
    current:[m.current_score_a,m.current_score_b],winner:m.winner_team_id||null,version:m.version,refereeId:m.referee_user_id||null,courtId:m.court_id||null
  }));
  const audit=publicOnly?[]:(await pool.query(`
    select a.*,u.display_name from audit_logs a left join app_users u on u.id=a.actor_user_id
    order by a.created_at desc limit 100
  `)).rows.map(a=>({
    time:nowTime(a.created_at),user:a.display_name||"System",action:a.action,detail:a.reason||a.entity_type
  }));
  for(const t of tournaments)t.teams=teamRows.filter(x=>divisions.some(d=>d.id===x.division_id&&d.tournament_id===t.id)).length;
  return {tournaments,divisions:divisions.map(d=>({id:d.id,tournamentId:d.tournament_id,name:d.name,eventType:d.event_type,format:d.format,bestOf:d.best_of,pointsToWin:d.points_to_win,winByTwo:d.win_by_two,advanceCount:d.advance_count})),courts:courts.map(c=>({id:c.id,tournamentId:c.tournament_id,name:c.name,sortOrder:c.sort_order,active:c.active})),teams,matches,audit};
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
app.get("/api/auth/me",authRequired,(req,res)=>res.json({user:req.user}));

app.get("/api/public/state",wrap(async(req,res)=>res.json(await loadState({publicOnly:true}))));
app.get("/api/admin/state",authRequired,wrap(async(req,res)=>res.json(await loadState())));

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

app.post("/api/matches/:id/finish",authRequired,wrap(async(req,res)=>{
  const updated=await tx(async c=>{
    const m=await getMatch(c,req.params.id,true);if(!m)throw Object.assign(new Error("NOT_FOUND"),{status:404});
    if(!(await authorizeMatch(c,req.user,m)))throw Object.assign(new Error("FORBIDDEN"),{status:403});
    if(req.body.expectedVersion!==undefined&&Number(req.body.expectedVersion)!==m.version)throw Object.assign(new Error("VERSION_CONFLICT"),{status:409});
    const sets=(await c.query("select * from match_sets where match_id=$1 and completed=true order by set_no",[m.id])).rows;
    const aw=sets.filter(s=>s.score_a>s.score_b).length,bw=sets.filter(s=>s.score_b>s.score_a).length,need=Math.floor(m.best_of/2)+1;
    if(Math.max(aw,bw)<need)throw Object.assign(new Error("NOT_ENOUGH_SET_WINS"),{status:400});
    const winner=aw>bw?m.team_a_id:m.team_b_id;
    const r=(await c.query("update matches set winner_team_id=$1,status='completed',completed_at=now(),version=version+1 where id=$2 returning *",[winner,m.id])).rows[0];
    if(m.next_match_id&&m.next_match_side){
      const col=m.next_match_side==="A"?"team_a_id":"team_b_id";
      await c.query(`update matches set ${col}=$1,version=version+1 where id=$2`,[winner,m.next_match_id]);
    }
    await c.query("insert into score_events(match_id,actor_user_id,event_type,payload,match_version) values($1,$2,'MATCH_FINISH',$3,$4)",[m.id,req.user.sub,{winner,before:{status:m.status,winner:m.winner_team_id,nextMatchId:m.next_match_id,nextSide:m.next_match_side}},r.version]);
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
      await c.query("update matches set winner_team_id=$1,status=$2,completed_at=null,version=version+1 where id=$3",[p.before?.winner||null,p.before?.status||"live",m.id]);
      if(p.before?.nextMatchId&&p.before?.nextSide){
        const downstream=(await c.query("select status from matches where id=$1 for update",[p.before.nextMatchId])).rows[0];
        if(downstream&&["live","completed"].includes(downstream.status))throw Object.assign(new Error("DOWNSTREAM_MATCH_STARTED"),{status:409});
        const col=p.before.nextSide==="A"?"team_a_id":"team_b_id";await c.query(`update matches set ${col}=null,version=version+1 where id=$1`,[p.before.nextMatchId]);
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

app.post("/api/divisions/:id/matches",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {teamAId,teamBId,courtId,stage="Vòng bảng",scheduledAt,refereeUserId}=req.body;
  if(!teamAId||!teamBId||teamAId===teamBId)return res.status(400).json({error:"INVALID_TEAMS"});
  const row=(await pool.query(`
    insert into matches(division_id,court_id,referee_user_id,team_a_id,team_b_id,stage,scheduled_at,status)
    values($1,$2,$3,$4,$5,$6,$7,'scheduled') returning *
  `,[req.params.id,courtId||null,refereeUserId||null,teamAId,teamBId,stage,scheduledAt||null])).rows[0];
  await pool.query("insert into audit_logs(actor_user_id,entity_type,entity_id,action,after_data) values($1,'match',$2,'CREATE_MATCH',$3)",[req.user.sub,row.id,row]);
  await emitState();res.status(201).json(row);
}));

app.get("/api/registrations",authRequired,allow("super_admin","organizer"),wrap(async(req,res)=>{
  const {rows}=await pool.query(`
    select r.id,r.status,r.payment_status,r.amount,r.created_at,t.name team_name,d.name division_name,tr.name tournament_name,
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

io.on("connection",socket=>{socket.emit("connected",{ok:true})});

app.get("/admin",(req,res)=>res.sendFile(path.join(root,"admin.html")));
app.get("/login",(req,res)=>res.sendFile(path.join(root,"login.html")));
app.use(express.static(root,{extensions:["html"]}));

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(err.status||500).json({error:err.message||"SERVER_ERROR",currentVersion:err.currentVersion});
});
server.listen(port,()=>console.log(`Pickle Tour listening on :${port}`));
