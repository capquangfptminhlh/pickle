import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {signSession} from "../src/auth.js";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

async function fresh(){
  const f=await accountFixture();
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  return f;
}
async function withFixture(fn){
  const f=await fresh();try{return await fn(f)}finally{f.db.close()}
}
async function publicCall(f,path,method="GET",body){
  const response=await worker.fetch(new Request("https://test.invalid"+path,{
    method,
    headers:body===undefined?{}:{"Content-Type":"application/json"},
    ...(body===undefined?{}:{body:JSON.stringify(body)})
  }),f.env);
  let data=null;try{data=await response.json()}catch{}
  return {status:response.status,data,headers:response.headers};
}
async function addActor(f,id,role,{clubId=null,tournamentId=null,active=1}={}){
  f.db.prepare("INSERT INTO app_users(id,email,display_name,role,password_hash,active,club_id,tournament_id_scope) VALUES(?,?,?,?,?,?,?,?)")
    .run(id,id+"@test.vn",id,role,"unused",active,clubId,tournamentId);
  f.tokens[id]=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
  return id;
}
function addClub(f,id="club",name="CLB QA",active=1){
  f.db.prepare("INSERT INTO clubs(id,name,slug,city,active) VALUES(?,?,?,?,?)").run(id,name,id,"HCM",active);return id;
}
function addDivision(f,id="d",{tournamentId="own",eventType="doubles",format="pool_to_knockout",advanceCount=2}={}){
  f.db.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,advance_count,minimum_rest_minutes,match_slot_minutes) VALUES(?,?,?,?,?,?,15,20)")
    .run(id,tournamentId,id,eventType,format,advanceCount);return id;
}
function addPlayer(f,id,{clubId=null,active=1,gender="male",skill="B"}={}){
  f.db.prepare("INSERT INTO players(id,club_id,full_name,gender,rating,skill_level,active,phone) VALUES(?,?,?,?,3,?,?,?)")
    .run(id,clubId,id,gender,skill,active,"0900000000");return id;
}
function addTeam(f,id,did,{playerIds=[],clubId=null,group="A",seed=null,status="active"}={}){
  f.db.prepare("INSERT INTO teams(id,division_id,name,club_id,group_code,seed,status) VALUES(?,?,?,?,?,?,?)")
    .run(id,did,id,clubId,group,seed,status);
  for(const playerId of playerIds)f.db.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").run(id,playerId);
  return id;
}
function addValidDoublesTeam(f,did,id,{clubId=null,group="A",seed=null,status="active"}={}){
  const p1=id+"-p1",p2=id+"-p2";addPlayer(f,p1,{clubId});addPlayer(f,p2,{clubId});
  addTeam(f,id,did,{playerIds:[p1,p2],clubId,group,seed,status});return id;
}
function addCourt(f,id="c1",{tournamentId="own",active=1,sortOrder=1}={}){
  f.db.prepare("INSERT INTO courts(id,tournament_id,name,sort_order,active) VALUES(?,?,?,?,?)")
    .run(id,tournamentId,id,sortOrder,active);return id;
}
function addRegistration(f,id,did,teamId,{status="approved",paymentStatus="unpaid",amount=0,token=null}={}){
  f.db.prepare("INSERT INTO registrations(id,division_id,team_id,status,payment_status,amount,checkin_token,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id,did,teamId,status,paymentStatus,amount,token||("token-"+id),"2026-10-06T00:00:00Z");
  return id;
}
function seedTeams(f,did,n){
  for(let i=1;i<=n;i++)addTeam(f,"t"+i,did,{seed:i});
}
function assignmentSetup(f){
  addDivision(f,"own-d");addDivision(f,"other-d",{tournamentId:"other"});
  addTeam(f,"a","own-d");addTeam(f,"b","own-d");addTeam(f,"foreign-team","other-d");
  addCourt(f,"court");addCourt(f,"inactive",{active:0});addCourt(f,"foreign-court",{tournamentId:"other"});
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,referee_user_id,court_id,status,version) VALUES('m','own-d','a','b','local','court','scheduled',1)");
}
const cases=[];
const scenario=(name,fn)=>cases.push({name,fn});

// 101-110 Tournament, club, court, settings edge cases
scenario("101 duplicate tournament names receive unique slugs",()=>withFixture(async f=>{
  const a=await f.api("/api/tournaments",{name:"Cúp Mùa Thu"},"POST"),b=await f.api("/api/tournaments",{name:"Cúp Mùa Thu"},"POST");
  assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.data.slug,b.data.slug);
}));
scenario("102 tournament names are trimmed before persistence",()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"   QA Trim Cup   "},"POST");assert.equal(r.status,201);assert.equal(r.data.name,"QA Trim Cup");
}));
scenario("103 toggling a public tournament private removes it from public state",()=>withFixture(async f=>{
  f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='own'");
  assert.ok((await publicCall(f,"/api/public/state")).data.tournaments.some(x=>x.id==="own"));
  await f.api("/api/tournaments/own",{publicVisible:false},"PATCH");
  assert.ok(!(await publicCall(f,"/api/public/state")).data.tournaments.some(x=>x.id==="own"));
}));
scenario("104 duplicate club names receive unique slugs",()=>withFixture(async f=>{
  const a=await f.api("/api/clubs",{name:"Bình Lợi"},"POST"),b=await f.api("/api/clubs",{name:"Bình Lợi"},"POST");
  assert.equal(a.status,201);assert.equal(b.status,201);assert.notEqual(a.data.slug,b.data.slug);
}));
scenario("105 deactivated club disappears from public clubs",()=>withFixture(async f=>{
  const c=await f.api("/api/clubs",{name:"Public Club"},"POST");assert.equal(c.status,201);
  assert.ok((await publicCall(f,"/api/public/clubs")).data.some(x=>x.id===c.data.id));
  await f.api("/api/clubs/"+c.data.id,undefined,"DELETE");
  assert.ok(!(await publicCall(f,"/api/public/clubs")).data.some(x=>x.id===c.data.id));
}));
scenario("106 court patch persists rename sort order and active flag",()=>withFixture(async f=>{
  addCourt(f,"c");const r=await f.api("/api/courts/c",{name:"Sân Trung Tâm",sortOrder:9,active:false},"PATCH");
  assert.equal(r.status,200);assert.equal(r.data.name,"Sân Trung Tâm");assert.equal(r.data.sort_order,9);assert.equal(Boolean(r.data.active),false);
}));
scenario("107 a court can be deactivated without deletion",()=>withFixture(async f=>{
  addCourt(f,"c");assert.equal((await f.api("/api/courts/c",{active:false},"PATCH")).status,200);
  assert.equal(f.db.prepare("SELECT active FROM courts WHERE id='c'").get().active,0);
}));
scenario("108 deleting an unused court removes it",()=>withFixture(async f=>{
  addCourt(f,"c");assert.equal((await f.api("/api/courts/c",undefined,"DELETE")).status,200);
  assert.equal(f.db.prepare("SELECT id FROM courts WHERE id='c'").get(),undefined);
}));
scenario("109 branding settings round-trip through server storage",()=>withFixture(async f=>{
  const payload={brandName:"PickleUp QA",tagline:"Giải đấu realtime",accent:"#123456"};
  assert.equal((await f.api("/api/settings/branding",payload,"PUT")).status,200);
  const r=await f.api("/api/settings/branding",undefined,"GET");assert.equal(r.status,200);assert.deepEqual(r.data,payload);
}));
scenario("110 invalid division scoring mode safely normalizes to side_out",()=>withFixture(async f=>{
  addDivision(f);const r=await f.api("/api/divisions/d",{scoringMode:"invalid-mode"},"PATCH");
  assert.equal(r.status,200);assert.equal(r.data.scoring_mode,"side_out");
}));

// 111-125 Registration and check-in
scenario("111 valid doubles team registration succeeds",()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");const r=await f.api("/api/divisions/d/registrations",{teamId:"team",amount:300000},"POST");
  assert.equal(r.status,201);assert.equal(r.data.amount,300000);
}));
scenario("112 registration rejects a team from another division",()=>withFixture(async f=>{
  addDivision(f);addDivision(f,"d2");addValidDoublesTeam(f,"d2","team");
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"TEAM_DIVISION_MISMATCH");
}));
scenario("113 registration rejects withdrawn team",()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team",{status:"withdrawn"});
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST");assert.equal(r.status,400);
}));
scenario("114 duplicate active registration is rejected",()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");assert.equal((await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST")).status,201);
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST");assert.equal(r.status,409);assert.equal(r.data.error,"REGISTRATION_EXISTS");
}));
scenario("115 cancelled registration permits a fresh registration",()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");addRegistration(f,"old","d","team",{status:"cancelled"});
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST");assert.equal(r.status,201);
}));
scenario("116 registration persists custom status payment status and amount",()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team",status:"pending",paymentStatus:"pending",amount:450000},"POST");
  assert.equal(r.status,201);assert.equal(r.data.status,"pending");assert.equal(r.data.payment_status,"pending");assert.equal(r.data.amount,450000);
}));
scenario("117 organizer cannot register a team in another owner's division",()=>withFixture(async f=>{
  addDivision(f,"d",{tournamentId:"other"});addValidDoublesTeam(f,"d","team");
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST","organizer");assert.equal(r.status,403);
}));
scenario("118 organizer can register a valid team in owned division",()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");const r=await f.api("/api/divisions/d/registrations",{teamId:"team"},"POST","organizer");assert.equal(r.status,201);
}));
scenario("119 organizer check-in records actor and timestamp",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  const x=await f.api("/api/registrations/r/checkin",{},"POST","organizer");assert.equal(x.status,200);
  const saved=f.db.prepare("SELECT checked_in_at,checked_in_by FROM registrations WHERE id='r'").get();assert.ok(saved.checked_in_at);assert.equal(saved.checked_in_by,"organizer");
}));
scenario("120 undo check-in clears timestamp and actor",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  await f.api("/api/registrations/r/checkin",{},"POST");const x=await f.api("/api/registrations/r/undo-checkin",{},"POST");
  assert.equal(x.status,200);const saved=f.db.prepare("SELECT checked_in_at,checked_in_by FROM registrations WHERE id='r'").get();assert.equal(saved.checked_in_at,null);assert.equal(saved.checked_in_by,null);
}));
scenario("121 referee cannot perform admin check-in",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/checkin",{},"POST","local")).status,403);
}));
scenario("122 organizer cannot check in a foreign tournament registration",()=>withFixture(async f=>{
  addDivision(f,"d",{tournamentId:"other"});addTeam(f,"team","d");addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/checkin",{},"POST","organizer")).status,403);
}));
scenario("123 check-in of missing registration returns 404",()=>withFixture(async f=>{
  assert.equal((await f.api("/api/registrations/missing/checkin",{},"POST")).status,404);
}));
scenario("124 public check-in token returns event and team context",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team",{token:"public-token"});
  const x=await publicCall(f,"/api/checkin/public-token");assert.equal(x.status,200);assert.equal(x.data.team_name,"team");assert.equal(x.data.tournament_name,"Giải của tôi");
}));
scenario("125 invalid public check-in token returns 404",()=>withFixture(async f=>{
  assert.equal((await publicCall(f,"/api/checkin/not-found")).status,404);
}));

// 126-140 Payment and finance
scenario("126 public token confirmation checks in registration",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team",{token:"confirm-token"});
  const x=await publicCall(f,"/api/checkin/confirm-token/confirm","POST",{});assert.equal(x.status,200);
  assert.ok(f.db.prepare("SELECT checked_in_at FROM registrations WHERE id='r'").get().checked_in_at);
}));
scenario("127 repeated public token confirmation preserves first check-in timestamp",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team",{token:"same-token"});
  await publicCall(f,"/api/checkin/same-token/confirm","POST",{});const first=f.db.prepare("SELECT checked_in_at FROM registrations WHERE id='r'").get().checked_in_at;
  await publicCall(f,"/api/checkin/same-token/confirm","POST",{});assert.equal(f.db.prepare("SELECT checked_in_at FROM registrations WHERE id='r'").get().checked_in_at,first);
}));
scenario("128 invalid confirmation token returns 404",()=>withFixture(async f=>{
  assert.equal((await publicCall(f,"/api/checkin/nope/confirm","POST",{})).status,404);
}));
scenario("129 payment defaults to bank transfer and pending",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  const x=await f.api("/api/registrations/r/payment",{},"POST");assert.equal(x.status,201);assert.equal(x.data.method,"bank_transfer");assert.equal(x.data.status,"pending");
}));
scenario("130 adding payment moves registration to pending payment state",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  await f.api("/api/registrations/r/payment",{},"POST");assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='r'").get().payment_status,"pending");
}));
scenario("131 explicit payment fields persist",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  const x=await f.api("/api/registrations/r/payment",{method:"cash",referenceCode:"REF-01",receiptUrl:"https://example.test/r.png"},"POST");
  assert.equal(x.status,201);assert.equal(x.data.method,"cash");assert.equal(x.data.reference_code,"REF-01");assert.equal(x.data.receipt_url,"https://example.test/r.png");
}));
scenario("132 referee cannot add payment",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/payment",{},"POST","local")).status,403);
}));
scenario("133 organizer can add payment to owned tournament registration",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/payment",{method:"cash"},"POST","organizer")).status,201);
}));
scenario("134 organizer cannot add payment to foreign tournament",()=>withFixture(async f=>{
  addDivision(f,"d",{tournamentId:"other"});addTeam(f,"team","d");addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/payment",{},"POST","organizer")).status,403);
}));
scenario("135 unrestricted finance account can add payment",()=>withFixture(async f=>{
  await addActor(f,"finance","finance");addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/payment",{},"POST","finance")).status,201);
}));
scenario("136 club-scoped finance can add payment for its own club team",()=>withFixture(async f=>{
  addClub(f,"clubA");await addActor(f,"finance","finance",{clubId:"clubA"});addDivision(f);addTeam(f,"team","d",{clubId:"clubA"});addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/payment",{},"POST","finance")).status,201);
}));
scenario("137 club-scoped finance cannot add payment for another club",()=>withFixture(async f=>{
  addClub(f,"clubA");addClub(f,"clubB");await addActor(f,"finance","finance",{clubId:"clubA"});addDivision(f);addTeam(f,"team","d",{clubId:"clubB"});addRegistration(f,"r","d","team");
  assert.equal((await f.api("/api/registrations/r/payment",{},"POST","finance")).status,403);
}));
scenario("138 approving payment marks registration paid",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");const p=await f.api("/api/registrations/r/payment",{},"POST");
  const x=await f.api("/api/payment-records/"+p.data.id,{status:"approved"},"PATCH");assert.equal(x.status,200);assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='r'").get().payment_status,"paid");
}));
scenario("139 rejecting payment marks registration unpaid",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");const p=await f.api("/api/registrations/r/payment",{},"POST");
  await f.api("/api/payment-records/"+p.data.id,{status:"rejected"},"PATCH");assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='r'").get().payment_status,"unpaid");
}));
scenario("140 refunding payment marks registration refunded",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");const p=await f.api("/api/registrations/r/payment",{},"POST");
  await f.api("/api/payment-records/"+p.data.id,{status:"refunded"},"PATCH");assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='r'").get().payment_status,"refunded");
}));

// 141-155 Account and permission edge cases
scenario("141 invalid payment review status is rejected without mutation",()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team");const p=await f.api("/api/registrations/r/payment",{},"POST");
  const x=await f.api("/api/payment-records/"+p.data.id,{status:"magic"},"PATCH");assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_STATUS");
  assert.equal(f.db.prepare("SELECT status FROM payment_records WHERE id=?").get(p.data.id).status,"pending");
}));
scenario("142 created referee response never exposes password hash",()=>withFixture(async f=>{
  const x=await f.api("/api/users/referees",{email:"qa-ref@test.vn",name:"QA Ref",password:"strong-password-123"},"POST");
  assert.equal(x.status,201);assert.equal(x.data.password_hash,undefined);assert.equal(x.data.auth_version,undefined);
}));
scenario("143 super admin may create a global referee without tournament scope",()=>withFixture(async f=>{
  const x=await f.api("/api/users/referees",{email:"global2@test.vn",name:"Global 2",password:"strong-password-123"},"POST");
  assert.equal(x.status,201);assert.equal(x.data.tournament_id_scope,null);
}));
scenario("144 organizer must choose a tournament when creating referee",()=>withFixture(async f=>{
  const x=await f.api("/api/users/referees",{email:"r2@test.vn",name:"R2",password:"strong-password-123"},"POST","organizer");
  assert.equal(x.status,400);assert.equal(x.data.error,"TOURNAMENT_REQUIRED");
}));
scenario("145 organizer can create referee scoped to owned tournament",()=>withFixture(async f=>{
  const x=await f.api("/api/users/referees",{email:"r3@test.vn",name:"R3",password:"strong-password-123",tournamentId:"own"},"POST","organizer");
  assert.equal(x.status,201);assert.equal(x.data.tournament_id_scope,"own");assert.equal(x.data.role,"referee");
}));
scenario("146 organizer cannot create finance account",()=>withFixture(async f=>{
  const x=await f.api("/api/users",{email:"f2@test.vn",name:"F2",password:"strong-password-123",role:"finance"},"POST","organizer");
  assert.equal(x.status,403);assert.equal(x.data.error,"ORGANIZER_CAN_ONLY_CREATE_REFEREE");
}));
scenario("147 club manager creation requires a club",()=>withFixture(async f=>{
  const x=await f.api("/api/users",{email:"cm@test.vn",name:"CM",password:"strong-password-123",role:"club_manager"},"POST");
  assert.equal(x.status,400);assert.equal(x.data.error,"CLUB_REQUIRED");
}));
scenario("148 super admin can create valid club manager",()=>withFixture(async f=>{
  addClub(f,"clubA");const x=await f.api("/api/users",{email:"cm2@test.vn",name:"CM2",password:"strong-password-123",role:"club_manager",clubId:"clubA"},"POST");
  assert.equal(x.status,201);assert.equal(x.data.club_id,"clubA");assert.equal(x.data.role,"club_manager");
}));
scenario("149 super admin can create club-scoped finance account",()=>withFixture(async f=>{
  addClub(f,"clubA");const x=await f.api("/api/users",{email:"fin@test.vn",name:"Fin",password:"strong-password-123",role:"finance",clubId:"clubA"},"POST");
  assert.equal(x.status,201);assert.equal(x.data.club_id,"clubA");
}));
scenario("150 invalid child account role is rejected",()=>withFixture(async f=>{
  const x=await f.api("/api/users",{email:"x@test.vn",name:"X",password:"strong-password-123",role:"super_admin"},"POST");
  assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_CHILD_ROLE");
}));
scenario("151 duplicate email comparison is normalized to lowercase",()=>withFixture(async f=>{
  const x=await f.api("/api/users/referees",{email:"ADMIN@TEST.VN",name:"Duplicate",password:"strong-password-123"},"POST");
  assert.equal(x.status,409);assert.equal(x.data.error,"EMAIL_EXISTS");
}));
scenario("152 current admin cannot disable its own account",()=>withFixture(async f=>{
  const x=await f.api("/api/users/admin",{active:false},"PATCH");assert.equal(x.status,400);assert.equal(x.data.error,"CANNOT_DISABLE_SELF");
}));
scenario("153 super admin cannot demote itself through child-account patch",()=>withFixture(async f=>{
  const x=await f.api("/api/users/admin",{role:"referee"},"PATCH");assert.equal(x.status,200);assert.equal(x.data.role,"super_admin");
}));
scenario("154 organizer cannot edit a finance account",()=>withFixture(async f=>{
  await addActor(f,"fin","finance");const x=await f.api("/api/users/fin",{name:"Nope"},"PATCH","organizer");assert.equal(x.status,403);
}));
scenario("155 referee cannot create any child account",()=>withFixture(async f=>{
  const x=await f.api("/api/users",{email:"child@test.vn",name:"Child",password:"strong-password-123",role:"referee"},"POST","local");assert.equal(x.status,403);
}));

// 156-170 Sponsors, posts and public content
scenario("156 super admin can create global sponsor",()=>withFixture(async f=>{
  const x=await f.api("/api/sponsors",{name:"Sponsor Global",tier:"gold"},"POST");assert.equal(x.status,201);assert.equal(x.data.tournament_id,null);
}));
scenario("157 sponsor requires non-empty name",()=>withFixture(async f=>{
  const x=await f.api("/api/sponsors",{name:"   "},"POST");assert.equal(x.status,400);assert.equal(x.data.error,"NAME_REQUIRED");
}));
scenario("158 organizer can create sponsor for owned tournament",()=>withFixture(async f=>{
  const x=await f.api("/api/sponsors",{name:"Sponsor Own",tournamentId:"own"},"POST","organizer");assert.equal(x.status,201);assert.equal(x.data.tournament_id,"own");
}));
scenario("159 organizer cannot create sponsor for foreign tournament",()=>withFixture(async f=>{
  assert.equal((await f.api("/api/sponsors",{name:"Sponsor Other",tournamentId:"other"},"POST","organizer")).status,403);
}));
scenario("160 sponsor patch updates presentation fields",()=>withFixture(async f=>{
  const s=await f.api("/api/sponsors",{name:"Old"},"POST");const x=await f.api("/api/sponsors/"+s.data.id,{name:"New",tier:"platinum",sortOrder:7,websiteUrl:"https://sponsor.test"},"PATCH");
  assert.equal(x.status,200);assert.equal(x.data.name,"New");assert.equal(x.data.tier,"platinum");assert.equal(x.data.sort_order,7);assert.equal(x.data.website_url,"https://sponsor.test");
}));
scenario("161 sponsor deletion removes record",()=>withFixture(async f=>{
  const s=await f.api("/api/sponsors",{name:"Delete Sponsor"},"POST");assert.equal((await f.api("/api/sponsors/"+s.data.id,undefined,"DELETE")).status,200);
  assert.equal(f.db.prepare("SELECT id FROM sponsors WHERE id=?").get(s.data.id),undefined);
}));
scenario("162 draft content post can be created",()=>withFixture(async f=>{
  const x=await f.api("/api/posts",{title:"Bài nháp QA",status:"draft",body:"Nội dung"},"POST");assert.equal(x.status,201);assert.equal(x.data.status,"draft");assert.equal(x.data.published_at,null);
}));
scenario("163 published post receives published timestamp",()=>withFixture(async f=>{
  const x=await f.api("/api/posts",{title:"Bài công khai QA",status:"published"},"POST");assert.equal(x.status,201);assert.ok(x.data.published_at);
}));
scenario("164 post requires title",()=>withFixture(async f=>{
  const x=await f.api("/api/posts",{title:" "},"POST");assert.equal(x.status,400);assert.equal(x.data.error,"TITLE_REQUIRED");
}));
scenario("165 duplicate post titles receive unique slugs",()=>withFixture(async f=>{
  const a=await f.api("/api/posts",{title:"Tin giải đấu"},"POST"),b=await f.api("/api/posts",{title:"Tin giải đấu"},"POST");assert.notEqual(a.data.slug,b.data.slug);
}));
scenario("166 organizer can create post for owned tournament",()=>withFixture(async f=>{
  const x=await f.api("/api/posts",{title:"Tin giải tôi",tournamentId:"own"},"POST","organizer");assert.equal(x.status,201);assert.equal(x.data.tournament_id,"own");
}));
scenario("167 organizer cannot create post for foreign tournament",()=>withFixture(async f=>{
  assert.equal((await f.api("/api/posts",{title:"Tin sai giải",tournamentId:"other"},"POST","organizer")).status,403);
}));
scenario("168 public posts hide drafts",()=>withFixture(async f=>{
  const p=await f.api("/api/posts",{title:"Draft Hidden",status:"draft"},"POST");const x=await publicCall(f,"/api/public/posts");assert.ok(!x.data.some(row=>row.id===p.data.id));
}));
scenario("169 public posts include published content",()=>withFixture(async f=>{
  const p=await f.api("/api/posts",{title:"Published Visible",status:"published"},"POST");const x=await publicCall(f,"/api/public/posts");assert.ok(x.data.some(row=>row.id===p.data.id));
}));
scenario("170 archiving a published post removes it from public feed",()=>withFixture(async f=>{
  const p=await f.api("/api/posts",{title:"Archive Me",status:"published"},"POST");await f.api("/api/posts/"+p.data.id,{status:"archived"},"PATCH");
  assert.ok(!(await publicCall(f,"/api/public/posts")).data.some(row=>row.id===p.data.id));
}));

// 171-185 Draw configuration, redraw and scheduling
scenario("171 draw configuration round-trips",()=>withFixture(async f=>{
  addDivision(f);const payload={mode:"seeded",groupCount:4,teamsPerGroup:4,advanceCount:2,courtIds:["x"],groupCourts:{A:["x"]},manualAssignments:{}};
  assert.equal((await f.api("/api/divisions/d/draw-config",payload,"PUT")).status,200);assert.deepEqual((await f.api("/api/divisions/d/draw-config",undefined,"GET")).data,{...payload,seriesBEnabled:false,seriesBThirdPlaceMatch:false});
}));
scenario("172 invalid draw mode normalizes to random",()=>withFixture(async f=>{
  addDivision(f);const x=await f.api("/api/divisions/d/draw-config",{mode:"roulette"},"PUT");assert.equal(x.status,200);assert.equal(x.data.mode,"random");
}));
scenario("173 draw config clamps group count to 26",()=>withFixture(async f=>{
  addDivision(f);const x=await f.api("/api/divisions/d/draw-config",{groupCount:99},"PUT");assert.equal(x.data.groupCount,26);
}));
scenario("174 draw config clamps teams per group to 32",()=>withFixture(async f=>{
  addDivision(f);const x=await f.api("/api/divisions/d/draw-config",{teamsPerGroup:999},"PUT");assert.equal(x.data.teamsPerGroup,32);
}));
scenario("175 draw config clamps advance count to 16",()=>withFixture(async f=>{
  addDivision(f);const x=await f.api("/api/divisions/d/draw-config",{advanceCount:99},"PUT");assert.equal(x.data.advanceCount,16);
}));
scenario("176 manual draw accepts lowercase group labels by normalizing them",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);
  const x=await f.api("/api/divisions/d/run-draw",{mode:"manual",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"],manualAssignments:{t1:"a",t2:"a",t3:"b",t4:"b"}},"POST");
  assert.equal(x.status,200);assert.deepEqual(x.data.groups.map(g=>g.count),[2,2]);
}));
scenario("177 manual draw rejects assignment outside configured groups",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);
  const x=await f.api("/api/divisions/d/run-draw",{mode:"manual",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"],manualAssignments:{t1:"A",t2:"A",t3:"C",t4:"B"}},"POST");
  assert.equal(x.status,400);assert.equal(x.data.error,"MANUAL_GROUP_ASSIGNMENT_REQUIRED");
}));
scenario("178 inactive requested court is ignored when active court exists",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f,"inactive",{active:0});addCourt(f,"active",{sortOrder:2});
  const x=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["inactive","active"]},"POST");
  assert.equal(x.status,200);assert.deepEqual(x.data.config.courtIds,["active"]);assert.ok(f.db.prepare("SELECT court_id FROM matches WHERE division_id='d' LIMIT 1").get().court_id==="active");
}));
scenario("179 group-specific court mapping is respected",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f,"c1");addCourt(f,"c2",{sortOrder:2});
  const x=await f.api("/api/divisions/d/run-draw",{mode:"manual",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1","c2"],groupCourts:{A:["c1"],B:["c2"]},manualAssignments:{t1:"A",t2:"A",t3:"B",t4:"B"}},"POST");
  assert.equal(x.status,200);assert.deepEqual(f.db.prepare("SELECT DISTINCT court_id FROM matches WHERE division_id='d' AND stage='Bảng A'").all().map(r=>r.court_id),["c1"]);assert.deepEqual(f.db.prepare("SELECT DISTINCT court_id FROM matches WHERE division_id='d' AND stage='Bảng B'").all().map(r=>r.court_id),["c2"]);
}));
scenario("180 redraw before group stage starts replaces scheduled pool matches cleanly",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",8);addCourt(f);let x=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:4,advanceCount:2,courtIds:["c1"]},"POST");assert.equal(x.status,200);
  const before=new Set(f.db.prepare("SELECT id FROM matches WHERE division_id='d'").all().map(r=>r.id));
  x=await f.api("/api/divisions/d/run-draw",{mode:"random",groupCount:2,teamsPerGroup:4,advanceCount:2,courtIds:["c1"]},"POST");assert.equal(x.status,200);
  const after=f.db.prepare("SELECT id FROM matches WHERE division_id='d'").all().map(r=>r.id);assert.equal(after.length,12);assert.ok(after.every(id=>!before.has(id)));
}));
scenario("181 redraw is blocked once a pool match is live",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST");
  f.db.exec("UPDATE matches SET status='live' WHERE id=(SELECT id FROM matches WHERE division_id='d' LIMIT 1)");
  const x=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST");assert.equal(x.status,409);assert.equal(x.data.error,"GROUP_STAGE_ALREADY_STARTED");
}));
scenario("182 redraw is blocked once a pool match is completed",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST");
  f.db.exec("UPDATE matches SET status='completed' WHERE id=(SELECT id FROM matches WHERE division_id='d' LIMIT 1)");
  assert.equal((await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST")).status,409);
}));
scenario("183 score-event history blocks redraw even if match status was reset",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST");
  const id=f.db.prepare("SELECT id FROM matches WHERE division_id='d' LIMIT 1").get().id;f.db.prepare("INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES(?,'POINT','{}',1)").run(id);
  const x=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:["c1"]},"POST");assert.equal(x.status,409);assert.equal(x.data.error,"GROUP_STAGE_ALREADY_STARTED");
}));
scenario("184 auto-seed distributes six teams evenly across three groups",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",6);const x=await f.api("/api/divisions/d/auto-seed-groups",{groupCount:3},"POST");assert.equal(x.status,200);
  const counts=f.db.prepare("SELECT group_code,COUNT(*) n FROM teams WHERE division_id='d' GROUP BY group_code ORDER BY group_code").all();assert.deepEqual(counts.map(r=>[r.group_code,r.n]),[["A",2],["B",2],["C",2]]);
}));
scenario("185 auto-schedule updates only pending matches",()=>withFixture(async f=>{
  addDivision(f);seedTeams(f,"d",4);addCourt(f);
  f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,status,created_at) VALUES('done','d','t1','t2','Bảng A','completed','2026-10-06T00:00:00Z'),('pending','d','t3','t4','Bảng A','scheduled','2026-10-06T00:01:00Z')");
  const x=await f.api("/api/divisions/d/auto-schedule-courts",{},"POST");assert.equal(x.status,200);assert.equal(x.data.updated,1);assert.equal(f.db.prepare("SELECT court_id FROM matches WHERE id='done'").get().court_id,null);assert.equal(f.db.prepare("SELECT court_id FROM matches WHERE id='pending'").get().court_id,"c1");
}));

// 186-195 Match assignment and team mutation
scenario("186 assignment rejects court from another tournament",()=>withFixture(async f=>{
  assignmentSetup(f);assert.equal((await f.api("/api/matches/m/assignment",{courtId:"foreign-court"},"PATCH")).status,400);
}));
scenario("187 assignment rejects inactive court",()=>withFixture(async f=>{
  assignmentSetup(f);assert.equal((await f.api("/api/matches/m/assignment",{courtId:"inactive"},"PATCH")).status,400);
}));
scenario("188 assignment rejects referee scoped to another tournament",()=>withFixture(async f=>{
  assignmentSetup(f);assert.equal((await f.api("/api/matches/m/assignment",{refereeUserId:"foreign"},"PATCH")).status,400);
}));
scenario("189 assignment rejects a non-referee account",()=>withFixture(async f=>{
  assignmentSetup(f);assert.equal((await f.api("/api/matches/m/assignment",{refereeUserId:"organizer"},"PATCH")).status,400);
}));
scenario("190 assignment can explicitly clear court and referee",()=>withFixture(async f=>{
  assignmentSetup(f);const x=await f.api("/api/matches/m/assignment",{courtId:null,refereeUserId:null},"PATCH");assert.equal(x.status,200);
  const m=f.db.prepare("SELECT court_id,referee_user_id FROM matches WHERE id='m'").get();assert.equal(m.court_id,null);assert.equal(m.referee_user_id,null);
}));
scenario("191 started match still permits stage metadata correction",()=>withFixture(async f=>{
  assignmentSetup(f);f.db.exec("UPDATE matches SET status='live',started_at='2026-10-06T00:00:00Z' WHERE id='m'");
  const x=await f.api("/api/matches/m",{stage:"Bán kết"},"PATCH");assert.equal(x.status,200);assert.equal(x.data.stage,"Bán kết");
}));
scenario("192 started match locks participant replacement",()=>withFixture(async f=>{
  assignmentSetup(f);addTeam(f,"c","own-d");f.db.exec("UPDATE matches SET status='live',started_at='2026-10-06T00:00:00Z' WHERE id='m'");
  assert.equal((await f.api("/api/matches/m",{teamAId:"c"},"PATCH")).status,409);
}));
scenario("193 completed match cannot be deleted",()=>withFixture(async f=>{
  assignmentSetup(f);f.db.exec("UPDATE matches SET status='completed',winner_team_id='a' WHERE id='m'");
  assert.equal((await f.api("/api/matches/m",undefined,"DELETE")).status,409);
}));
scenario("194 adding a third athlete to full doubles team is rejected",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"p1");addPlayer(f,"p2");addPlayer(f,"p3");addTeam(f,"team","d",{playerIds:["p1","p2"]});
  const x=await f.api("/api/teams/team/players",{playerId:"p3"},"POST");assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_PLAYER_COUNT");
}));
scenario("195 adding an already-linked athlete is idempotent",()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"p1");addPlayer(f,"p2");addTeam(f,"team","d",{playerIds:["p1","p2"]});
  const x=await f.api("/api/teams/team/players",{playerId:"p1"},"POST");assert.equal(x.status,200);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM team_players WHERE team_id='team' AND player_id='p1'").get().n,1);
}));

// 196-200 Import limits and bulk data
scenario("196 empty player import is rejected",()=>withFixture(async f=>{
  const x=await f.api("/api/import/players",{rows:[]},"POST");assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_IMPORT_SIZE");
}));
scenario("197 player import over 5000 rows is rejected before mutation",()=>withFixture(async f=>{
  const rows=Array.from({length:5001},(_,i)=>({fullName:"Overflow "+i}));const x=await f.api("/api/import/players",{rows},"POST");assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_IMPORT_SIZE");
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM players WHERE full_name LIKE 'Overflow %'").get().n,0);
}));
scenario("198 re-importing same player updates skill and reactivates profile",()=>withFixture(async f=>{
  addPlayer(f,"existing",{active:0,skill:"C"});f.db.exec("UPDATE players SET full_name='Same Person' WHERE id='existing'");
  const x=await f.api("/api/import/players",{rows:[{fullName:"same person",skillLevel:"A+",phone:"0999"}]},"POST");assert.equal(x.status,201);assert.equal(x.data.updated,1);
  const p=f.db.prepare("SELECT skill_level,active,phone FROM players WHERE id='existing'").get();assert.equal(p.skill_level,"A+");assert.equal(p.active,1);assert.equal(p.phone,"0999");
}));
scenario("199 invalid imported skill safely falls back to B",()=>withFixture(async f=>{
  const x=await f.api("/api/import/players",{rows:[{fullName:"Invalid Skill Import",skillLevel:"Z"}]},"POST");assert.equal(x.status,201);
  assert.equal(f.db.prepare("SELECT skill_level FROM players WHERE full_name='Invalid Skill Import'").get().skill_level,"B");
}));
scenario("200 bulk import of 100 distinct players creates all records once",()=>withFixture(async f=>{
  const rows=Array.from({length:100},(_,i)=>({fullName:"Bulk QA "+String(i).padStart(3,"0"),skillLevel:["A+","A","B+","B","C+","C"][i%6]}));
  const x=await f.api("/api/import/players",{rows},"POST");assert.equal(x.status,201);assert.equal(x.data.created,100);assert.equal(new Set(x.data.ids).size,100);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM players WHERE full_name LIKE 'Bulk QA %'").get().n,100);
}));

test("QA scenarios 101-200: extended PickleUp regression matrix",async t=>{
  assert.equal(cases.length,100,"second QA matrix must contain exactly 100 new scenarios");
  for(const item of cases)await t.test(item.name,item.fn);
});
