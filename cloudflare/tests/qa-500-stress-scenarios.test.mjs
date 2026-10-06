import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";
import {signSession} from "../src/auth.js";
import {accountFixture} from "./helpers/accounts-fixture.mjs";
import {scoringFixture} from "./helpers/scoring-fixture.mjs";

async function fresh(){
  const f=await accountFixture();
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  const puts=[];
  f.env.MEDIA={put:async(key,body,opts)=>{puts.push({key,bytes:body?.byteLength??0,opts})}};
  f.mediaPuts=puts;
  return f;
}
async function withFixture(fn){const f=await fresh();try{return await fn(f)}finally{f.db.close()}}
async function addActor(f,id,role,{clubId=null,tournamentId=null}={}){
  f.db.prepare("INSERT INTO app_users(id,email,display_name,role,password_hash,active,club_id,tournament_id_scope) VALUES(?,?,?,?,?,1,?,?)")
    .run(id,id+"@qa.test",id,role,"unused",clubId,tournamentId);
  f.tokens[id]=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
}
function addClub(f,id="club",name="CLB QA"){f.db.prepare("INSERT INTO clubs(id,name,slug,active) VALUES(?,?,?,1)").run(id,name,id);return id}
function addDivision(f,id="d",{tournamentId="own",eventType="doubles",format="pool_to_knockout",advance=2,minRest=15,slot=20}={}){
  f.db.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,advance_count,minimum_rest_minutes,match_slot_minutes) VALUES(?,?,?,?,?,?,?,?)")
    .run(id,tournamentId,id,eventType,format,advance,minRest,slot);return id;
}
function addPlayer(f,id,{name=id,createdBy="admin",clubId=null,active=1,gender="male",rating=3,skill="B",avatar=""}={}){
  f.db.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,gender,rating,skill_level,avatar_url,active,phone) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id,clubId,createdBy,name,gender,rating,skill,avatar,active,"0900000000");return id;
}
function addTeam(f,id,did,{playerIds=[],group="A",seed=null,status="active",clubId=null}={}){
  f.db.prepare("INSERT INTO teams(id,division_id,name,club_id,group_code,seed,status) VALUES(?,?,?,?,?,?,?)").run(id,did,id,clubId,group,seed,status);
  for(const pid of playerIds)f.db.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").run(id,pid);return id;
}
function addValidDoublesTeam(f,did,id,{clubId=null,status="active"}={}){
  addPlayer(f,id+"a",{clubId});addPlayer(f,id+"b",{clubId});return addTeam(f,id,did,{playerIds:[id+"a",id+"b"],clubId,status});
}
function addCourt(f,id="c1",{tournamentId="own",active=1,sort=1}={}){
  f.db.prepare("INSERT INTO courts(id,tournament_id,name,sort_order,active) VALUES(?,?,?,?,?)").run(id,tournamentId,id,sort,active);return id;
}
function addRegistration(f,id,did,teamId,{status="approved",paymentStatus="unpaid",amount=0,token=null}={}){
  f.db.prepare("INSERT INTO registrations(id,division_id,team_id,status,payment_status,amount,checkin_token,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .run(id,did,teamId,status,paymentStatus,amount,token||("tok-"+id),"2026-10-06T00:00:00Z");return id;
}
async function publicCall(f,path,method="GET",body){
  const r=await worker.fetch(new Request("https://test.invalid"+path,{method,headers:body===undefined?{}:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})}),f.env);
  let data=null;try{data=await r.json()}catch{}return {status:r.status,data,headers:r.headers};
}
async function avatarCall(f,id,{actor="admin",type="image/png",size=64,name="avatar.png",include=true}={}){
  const form=new FormData();if(include)form.append("avatar",new Blob([new Uint8Array(size)],{type}),name);
  const headers={};if(actor)headers.Authorization="Bearer "+f.tokens[actor];
  const r=await worker.fetch(new Request("https://test.invalid/api/players/"+encodeURIComponent(id)+"/avatar",{method:"POST",headers,body:form}),f.env);
  let data=null;try{data=await r.json()}catch{}return {status:r.status,data};
}
function seedBareTeams(f,did,n){for(let i=1;i<=n;i++)addTeam(f,"t"+i,did,{seed:i})}
function choose2(n){return n*(n-1)/2}
const cases=[];const scenario=(name,fn)=>cases.push({name,fn});

// 401-500 — tournament, division and court lifecycle stress.
const eventTypes=["singles","doubles","mixed_doubles","team"];
const formats=["round_robin","pool_to_knockout","single_elimination","double_elimination"];
const tournamentStatuses=["draft","registration","live","completed","cancelled"];
for(let i=0;i<40;i++)scenario(String(401+i)+" tournament create permutation "+(i+1),()=>withFixture(async f=>{
  const eventType=eventTypes[i%4],format=formats[(i*3)%4],status=tournamentStatuses[i%5],pub=i%2===0;
  const body={name:"QA Tournament "+i+" Đặng",eventType,format,status,publicVisible:pub,venue:"Sân "+(i%7+1),divisionName:"Nội dung "+i,startAt:"2026-11-"+String(i%20+1).padStart(2,"0")+"T01:00:00.000Z"};
  const r=await f.api("/api/tournaments",body,"POST");assert.equal(r.status,201);assert.equal(r.data.status,status);assert.equal(Boolean(r.data.public_visible),pub);
  const d=f.db.prepare("SELECT * FROM divisions WHERE tournament_id=?").get(r.data.id);assert.equal(d.event_type,eventType);assert.equal(d.format,format);assert.equal(d.name,body.divisionName);
}));
for(let i=0;i<20;i++)scenario(String(441+i)+" tournament update permutation "+(i+1),()=>withFixture(async f=>{
  const c=await f.api("/api/tournaments",{name:"Patch "+i},"POST"),status=tournamentStatuses[(i+1)%5],pub=i%2===1;
  const patch={name:"Patched "+i,venue:"Venue "+i,status,publicVisible:pub,startAt:"2026-12-"+String(i%20+1).padStart(2,"0")+"T02:00:00.000Z",endAt:"2026-12-"+String(i%20+1).padStart(2,"0")+"T10:00:00.000Z"};
  const r=await f.api("/api/tournaments/"+c.data.id,patch,"PATCH");assert.equal(r.status,200);assert.equal(r.data.name,patch.name);assert.equal(r.data.venue_name,patch.venue);assert.equal(r.data.status,status);assert.equal(Boolean(r.data.public_visible),pub);
}));
const badStatuses=["published","open","closed","pending","archived"];
for(let i=0;i<5;i++)scenario(String(461+i)+" reject invalid tournament status on create "+badStatuses[i],()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments",{name:"Bad "+i,status:badStatuses[i]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_STATUS");
}));
for(let i=0;i<5;i++)scenario(String(466+i)+" reject invalid tournament status on patch "+badStatuses[i],()=>withFixture(async f=>{
  const c=await f.api("/api/tournaments",{name:"Good "+i},"POST");const before=f.db.prepare("SELECT status FROM tournaments WHERE id=?").get(c.data.id).status;
  const r=await f.api("/api/tournaments/"+c.data.id,{status:badStatuses[i]},"PATCH");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_STATUS");assert.equal(f.db.prepare("SELECT status FROM tournaments WHERE id=?").get(c.data.id).status,before);
}));
for(let i=0;i<10;i++)scenario(String(471+i)+" create extra division permutation "+(i+1),()=>withFixture(async f=>{
  const eventType=eventTypes[i%4],format=formats[i%4];const r=await f.api("/api/tournaments/own/divisions",{name:"Division "+i,eventType,format,bestOf:i%2?5:3,pointsToWin:i%2?15:11,scoringMode:i%3?"side_out":"rally",minimumRestMinutes:i,matchSlotMinutes:10+i},"POST");
  assert.equal(r.status,201);assert.equal(r.data.event_type,eventType);assert.equal(r.data.format,format);assert.equal(r.data.minimum_rest_minutes,i);assert.equal(r.data.match_slot_minutes,10+i);
}));
for(let i=0;i<5;i++)scenario(String(481+i)+" reject invalid division event type "+(i+1),()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own/divisions",{name:"Bad Event "+i,eventType:["pair","triple","robot","unknown",""][i],format:"round_robin"},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_EVENT_TYPE");
}));
for(let i=0;i<5;i++)scenario(String(486+i)+" reject invalid division format "+(i+1),()=>withFixture(async f=>{
  const r=await f.api("/api/tournaments/own/divisions",{name:"Bad Format "+i,eventType:"doubles",format:["league","knockout","swiss","groups",""][i]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_FORMAT");
}));
for(let i=0;i<10;i++)scenario(String(491+i)+" court lifecycle "+(i+1),()=>withFixture(async f=>{
  const c=await f.api("/api/tournaments/own/courts",{name:"Sân QA "+i,sortOrder:i+1},"POST");assert.equal(c.status,201);
  const p=await f.api("/api/courts/"+c.data.id,{name:"Sân đổi "+i,sortOrder:100-i,active:i%2===0},"PATCH");assert.equal(p.status,200);assert.equal(p.data.name,"Sân đổi "+i);assert.equal(p.data.sort_order,100-i);assert.equal(Boolean(p.data.active),i%2===0);
}));

// 501-600 — athlete create/import/rating/avatar stress.
const skills=["A+","A","B+","B","C+","C"],genders=["male","female","other"];
for(let i=0;i<30;i++)scenario(String(501+i)+" create athlete permutation "+(i+1),()=>withFixture(async f=>{
  const body={fullName:"VĐV QA "+i,nickname:"QA"+i,gender:genders[i%3],rating:1.5+(i%16)*0.2,skillLevel:skills[i%6],phone:"09"+String(i).padStart(8,"0")};
  const r=await f.api("/api/players",body,"POST");assert.equal(r.status,201);assert.equal(r.data.full_name,body.fullName);assert.equal(r.data.gender,body.gender);assert.equal(Number(r.data.rating),body.rating);assert.equal(r.data.skill_level,body.skillLevel);
}));
const invalidGenders=["x","man","woman","robot","MALE"];
for(let i=0;i<5;i++)scenario(String(531+i)+" reject invalid player gender create "+invalidGenders[i],()=>withFixture(async f=>{
  const r=await f.api("/api/players",{fullName:"Bad Gender "+i,gender:invalidGenders[i]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_GENDER");
}));
const invalidRatings=[-1,-0.1,Number.NaN,Number.POSITIVE_INFINITY,Number.NEGATIVE_INFINITY];
for(let i=0;i<5;i++)scenario(String(536+i)+" reject invalid player rating create "+(i+1),()=>withFixture(async f=>{
  const value=Number.isFinite(invalidRatings[i])?invalidRatings[i]:"not-a-number";const r=await f.api("/api/players",{fullName:"Bad Rating "+i,rating:value},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_RATING");
}));
for(let i=0;i<20;i++)scenario(String(541+i)+" athlete rating correction "+(i+1),()=>withFixture(async f=>{
  const start=2.5+(i%5)*0.2,target=start+(i%2===0?0.1:-0.1);addPlayer(f,"p",{rating:start,skill:skills[i%6]});
  const r=await f.api("/api/players/p",{rating:target,ratingReason:"QA rating "+i,skillLevel:skills[(i+1)%6]},"PATCH");assert.equal(r.status,200);assert.equal(Number(r.data.rating),target);assert.equal(r.data.skill_level,skills[(i+1)%6]);
  const h=f.db.prepare("SELECT * FROM rating_history WHERE player_id='p'").get();assert.equal(Number(h.before_rating),start);assert.equal(Number(h.after_rating),target);
}));
for(let i=0;i<20;i++)scenario(String(561+i)+" import athlete row "+(i+1),()=>withFixture(async f=>{
  const row={fullName:"Import Stress "+i,nickname:"N"+i,gender:genders[i%3],rating:2+(i%15)/10,skillLevel:skills[i%6],club:"CLB Stress "+(i%4),avatarUrl:"https://img.qa/"+i+".webp",phone:"08"+String(i).padStart(8,"0")};
  const r=await f.api("/api/import/players",{rows:[row]},"POST");assert.equal(r.status,201);assert.equal(r.data.created,1);
  const p=f.db.prepare("SELECT p.*,c.name club_name FROM players p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.full_name=?").get(row.fullName);assert.equal(p.skill_level,row.skillLevel);assert.equal(p.gender,row.gender);assert.equal(Number(p.rating),row.rating);assert.equal(p.club_name,row.club);assert.equal(p.avatar_url,row.avatarUrl);
}));
for(let i=0;i<10;i++)scenario(String(581+i)+" reimport athlete update "+(i+1),()=>withFixture(async f=>{
  addPlayer(f,"p",{name:"Reimport Person",active:i%2,skill:"C",rating:2.5,avatar:"https://old.qa/a.png"});
  const row={fullName:i%2?"reimport person":"Reimport Person",skillLevel:skills[i%6],rating:3+(i%5)/10,gender:genders[i%3],avatarUrl:"https://new.qa/"+i+".png"};
  const r=await f.api("/api/import/players",{rows:[row]},"POST");assert.equal(r.status,201);assert.equal(r.data.updated,1);
  const p=f.db.prepare("SELECT * FROM players WHERE id='p'").get();assert.equal(p.active,1);assert.equal(p.skill_level,row.skillLevel);assert.equal(Number(p.rating),row.rating);assert.equal(p.avatar_url,row.avatarUrl);
}));
const avatarTests=[
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"image/png",size:128,name:"a.png"})).status,200)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"image/jpeg",size:256,name:"a.jpg"})).status,200)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"image/webp",size:512,name:"a.webp"})).status,200)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"image/gif",name:"a.gif"})).status,400)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{size:3*1024*1024+1})).status,413)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{include:false})).status,400)},
  async f=>{const r=await avatarCall(f,"missing");assert.equal(r.status,404);assert.equal(f.mediaPuts.length,0)},
  async f=>{addPlayer(f,"p",{createdBy:"organizer"});assert.equal((await avatarCall(f,"p",{actor:"organizer"})).status,200)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{actor:"local"})).status,403)},
  async f=>{addPlayer(f,"p",{active:0});assert.equal((await avatarCall(f,"p")).status,200)}
];
avatarTests.forEach((fn,i)=>scenario(String(591+i)+" avatar stress "+(i+1),()=>withFixture(fn)));

// 601-700 — teams, draws and court scheduling.
for(let i=0;i<25;i++)scenario(String(601+i)+" create doubles team "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addPlayer(f,"a",{skill:skills[i%6]});addPlayer(f,"b",{skill:skills[(i+3)%6]});
  const r=await f.api("/api/divisions/d/teams",{name:"Team "+i,playerIds:["a","b"],seed:i+1,group:String.fromCharCode(65+i%4)},"POST");assert.equal(r.status,201);assert.deepEqual(new Set(r.data.playerIds),new Set(["a","b"]));assert.equal(r.data.seed,i+1);
}));
const badRosterFns=[
  async f=>{addDivision(f);addPlayer(f,"a");assert.equal((await f.api("/api/divisions/d/teams",{playerIds:["a"]},"POST")).status,400)},
  async f=>{addDivision(f);["a","b","c"].forEach(x=>addPlayer(f,x));assert.equal((await f.api("/api/divisions/d/teams",{playerIds:["a","b","c"]},"POST")).status,400)},
  async f=>{addDivision(f);addPlayer(f,"a");assert.equal((await f.api("/api/divisions/d/teams",{playerIds:["a","a"]},"POST")).status,400)},
  async f=>{addDivision(f);addPlayer(f,"a",{active:0});addPlayer(f,"b");assert.equal((await f.api("/api/divisions/d/teams",{playerIds:["a","b"]},"POST")).status,400)},
  async f=>{addDivision(f);addPlayer(f,"a");assert.equal((await f.api("/api/divisions/d/teams",{playerIds:["a","missing"]},"POST")).status,404)}
];
for(let i=0;i<15;i++)scenario(String(626+i)+" invalid team roster "+(i+1),()=>withFixture(badRosterFns[i%badRosterFns.length]));
for(let i=0;i<30;i++)scenario(String(641+i)+" seeded group draw "+(i+1),()=>withFixture(async f=>{
  addDivision(f);const groups=2+(i%4),per=2+((i*2)%4),n=groups*per;seedBareTeams(f,"d",n);addCourt(f);
  const r=await f.api("/api/divisions/d/run-draw",{mode:"seeded",groupCount:groups,teamsPerGroup:per,advanceCount:Math.min(2,per),courtIds:["c1"]},"POST");assert.equal(r.status,200);
  assert.equal(r.data.created,groups*choose2(per));assert.equal(r.data.groups.length,groups);assert.ok(r.data.groups.every(g=>g.count===per));
}));
for(let i=0;i<15;i++)scenario(String(671+i)+" round robin idempotence "+(i+1),()=>withFixture(async f=>{
  addDivision(f);const n=4+(i%5);seedBareTeams(f,"d",n);const groups=2;await f.api("/api/divisions/d/auto-seed-groups",{groupCount:groups},"POST");
  const first=await f.api("/api/divisions/d/generate-round-robin",{},"POST"),second=await f.api("/api/divisions/d/generate-round-robin",{},"POST");assert.equal(first.status,200);assert.ok(first.data.created>0);assert.equal(second.status,200);assert.equal(second.data.created,0);
}));
for(let i=0;i<15;i++)scenario(String(686+i)+" auto schedule rest and courts "+(i+1),()=>withFixture(async f=>{
  const rest=(i%4)*5,slot=10+(i%3)*5;addDivision(f,"d",{minRest:rest,slot});f.db.exec("UPDATE tournaments SET start_at='2026-10-20T01:00:00.000Z' WHERE id='own'");
  ["A","B","C","D"].forEach(id=>addTeam(f,id,"d"));const courtCount=1+(i%3);for(let c=1;c<=courtCount;c++)addCourt(f,"c"+c,{sort:c});
  let m=0;for(const [a,b] of [["A","B"],["A","C"],["A","D"],["B","C"],["B","D"],["C","D"]])f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,created_at) VALUES(?,?,?,?, 'scheduled',?)").run("m"+(++m),"d",a,b,"2026-10-06T00:0"+m+":00Z");
  const r=await f.api("/api/divisions/d/auto-schedule-courts",{},"POST");assert.equal(r.status,200);assert.equal(r.data.updated,6);assert.equal(r.data.courts,courtCount);
  const rows=f.db.prepare("SELECT team_a_id,team_b_id,scheduled_at,court_id FROM matches WHERE division_id='d'").all();assert.ok(rows.every(x=>x.scheduled_at&&x.court_id));
  for(const team of ["A","B","C","D"]){const times=rows.filter(x=>x.team_a_id===team||x.team_b_id===team).map(x=>Date.parse(x.scheduled_at)).sort((a,b)=>a-b);for(let k=1;k<times.length;k++)assert.ok(times[k]-times[k-1]>=(slot+rest)*60000)}
}));

// 701-800 — scoring and result-integrity stress.
for(let i=0;i<30;i++)scenario(String(701+i)+" valid best-of-3 quick score "+(i+1),async()=>{
  const f=await scoringFixture();try{
    const aWins=i%2===0,x=i%9,y=(i*3)%9,sets=aWins?[[11,x],[11,y]]:[[x,11],[y,11]];
    const r=await f.api("quick-score",{sets});assert.equal(r.status,200);assert.equal(f.match().status,"completed");assert.equal(f.match().winner_team_id,aWins?"a":"b");assert.equal(f.sets().length,2);
  }finally{f.db.close()}
});
for(let i=0;i<20;i++)scenario(String(731+i)+" valid best-of-5 quick score "+(i+1),async()=>{
  const f=await scoringFixture();try{
    f.db.exec("UPDATE divisions SET best_of=5,points_to_win=15 WHERE id='division'");const aWins=i%2===0,x=3+i%8;
    const sets=aWins?[[15,x],[x,15],[15,x+1],[15,x+2]]:[[x,15],[15,x],[x+1,15],[x+2,15]];
    const r=await f.api("quick-score",{sets});assert.equal(r.status,200);assert.equal(f.match().winner_team_id,aWins?"a":"b");assert.equal(f.sets().length,4);
  }finally{f.db.close()}
});
const badSeries=[
  [[11,11],[11,3]],[[11,-1],[11,3]],[[11.5,3],[11,3]],[[11,3]],[[11,3],[3,11]],
  [[11,3],[11,3],[3,11]],[[10,8],[11,3]],[[12,11],[11,3]],[[11,3],[11,null]],[[32768,0],[11,0]]
];
for(let i=0;i<20;i++)scenario(String(751+i)+" reject invalid score series "+(i+1),async()=>{
  const f=await scoringFixture();try{const before=f.match();const r=await f.api("quick-score",{sets:badSeries[i%10]});assert.equal(r.status,400);assert.deepEqual(f.match(),before);assert.equal(f.sets().length,0)}finally{f.db.close()}
});
for(let i=0;i<15;i++)scenario(String(771+i)+" point and undo sequence "+(i+1),async()=>{
  const f=await scoringFixture();try{
    const count=1+(i%6);for(let k=0;k<count;k++){const side=k%2?"B":"A";assert.equal((await f.api("point",{side,delta:1})).status,200)}
    const beforeVersion=f.match().version;assert.equal((await f.api("undo")).status,200);assert.equal(f.match().version,beforeVersion+1);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM score_events WHERE event_type='UNDO'").get().n,1);
  }finally{f.db.close()}
});
const reasons=["walkover","no_show","retired","injury","disqualified"];
for(let i=0;i<5;i++)scenario(String(786+i)+" special result "+reasons[i],async()=>{
  const f=await scoringFixture();try{const winner=i%2?"b":"a",r=await f.api("special-result",{winnerTeamId:winner,reason:reasons[i],note:"QA"});assert.equal(r.status,200);assert.equal(f.match().winner_team_id,winner);assert.equal(f.match().result_reason,reasons[i])}finally{f.db.close()}
});
for(let i=0;i<5;i++)scenario(String(791+i)+" stale score version rejection "+(i+1),async()=>{
  const f=await scoringFixture();try{const r=await f.api("point",{side:i%2?"B":"A",delta:1,expectedVersion:0});assert.equal(r.status,409);assert.equal(f.match().current_score_a+f.match().current_score_b,0)}finally{f.db.close()}
});
for(let i=0;i<5;i++)scenario(String(796+i)+" completed match score lock "+(i+1),async()=>{
  const f=await scoringFixture();try{f.db.exec("UPDATE matches SET status='completed',winner_team_id='a' WHERE id='match'");const actions=[["point",{side:"A",delta:1}],["quick-score",{sets:[[11,3],[11,4]]}],["finish",{}],["finish-set",{}],["special-result",{winnerTeamId:"b",reason:"retired"}]];assert.equal((await f.api(actions[i][0],actions[i][1])).status,409)}finally{f.db.close()}
});

// 801-900 — registration, payments, public privacy, accounts and idempotence.
for(let i=0;i<20;i++)scenario(String(801+i)+" registration lifecycle "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");const amount=200000+i*10000;
  const r=await f.api("/api/divisions/d/registrations",{teamId:"team",amount,status:i%2?"approved":"pending",paymentStatus:"unpaid"},"POST");assert.equal(r.status,201);assert.equal(r.data.amount,amount);
  if(i%3===0){const c=await f.api("/api/registrations/"+r.data.id+"/checkin",{},"POST");assert.equal(c.status,200);assert.ok(f.db.prepare("SELECT checked_in_at FROM registrations WHERE id=?").get(r.data.id).checked_in_at)}
  else {const p=await f.api("/api/registrations/"+r.data.id,{amount:amount+5000,status:"approved"},"PATCH");assert.equal(p.status,200);assert.equal(p.data.amount,amount+5000)}
}));
const badRegStatus=["live","done","archived","open","closed"],badPayStatus=["approved","done","failed","processing","cash"];
for(let i=0;i<5;i++)scenario(String(821+i)+" reject invalid registration status create "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");const r=await f.api("/api/divisions/d/registrations",{teamId:"team",status:badRegStatus[i]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_REGISTRATION_STATUS");
}));
for(let i=0;i<5;i++)scenario(String(826+i)+" reject invalid registration payment status create "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");const r=await f.api("/api/divisions/d/registrations",{teamId:"team",paymentStatus:badPayStatus[i]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_PAYMENT_STATUS");
}));
for(let i=0;i<5;i++)scenario(String(831+i)+" reject invalid registration status patch "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");addRegistration(f,"r","d","team");const before=f.db.prepare("SELECT status FROM registrations WHERE id='r'").get().status;
  const x=await f.api("/api/registrations/r",{status:badRegStatus[i]},"PATCH");assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_REGISTRATION_STATUS");assert.equal(f.db.prepare("SELECT status FROM registrations WHERE id='r'").get().status,before);
}));
for(let i=0;i<5;i++)scenario(String(836+i)+" reject invalid registration payment status patch "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addValidDoublesTeam(f,"d","team");addRegistration(f,"r","d","team");const x=await f.api("/api/registrations/r",{paymentStatus:badPayStatus[i]},"PATCH");assert.equal(x.status,400);assert.equal(x.data.error,"INVALID_PAYMENT_STATUS");
}));
for(let i=0;i<20;i++)scenario(String(841+i)+" payment review lifecycle "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team",{amount:300000});const p=await f.api("/api/registrations/r/payment",{method:i%2?"cash":"bank_transfer",referenceCode:"REF"+i},"POST");assert.equal(p.status,201);
  const status=["approved","rejected","refunded"][i%3],rev=await f.api("/api/payment-records/"+p.data.id,{status},"PATCH");assert.equal(rev.status,200);
  const expected=status==="approved"?"paid":status==="refunded"?"refunded":"unpaid";assert.equal(f.db.prepare("SELECT payment_status FROM registrations WHERE id='r'").get().payment_status,expected);
}));
for(let i=0;i<20;i++)scenario(String(861+i)+" public privacy visibility "+(i+1),()=>withFixture(async f=>{
  const pub=i%2===0;f.db.prepare("UPDATE tournaments SET public_visible=? WHERE id='own'").run(pub?1:0);addDivision(f);addPlayer(f,"p",{name:"Public Player "+i});addPlayer(f,"q");addTeam(f,"a","d",{playerIds:["p"]});addTeam(f,"b","d",{playerIds:["q"]});
  const state=await publicCall(f,"/api/public/state");assert.equal(state.status,200);assert.equal(state.data.tournaments.some(t=>t.id==="own"),pub);
  const players=await publicCall(f,"/api/public/players");assert.equal(players.status,200);assert.ok(!JSON.stringify(players.data).includes("0900000000"));
}));
for(let i=0;i<15;i++)scenario(String(881+i)+" child account permission "+(i+1),()=>withFixture(async f=>{
  if(i%3===0){const r=await f.api("/api/users/referees",{email:"ref"+i+"@qa.test",name:"Ref "+i,password:"strong-password-"+i+"-xyz"},"POST");assert.equal(r.status,201);assert.equal(r.data.role,"referee")}
  else if(i%3===1){addClub(f,"club");const r=await f.api("/api/users",{email:"fin"+i+"@qa.test",name:"Finance "+i,password:"strong-password-"+i+"-xyz",role:"finance",clubId:"club"},"POST");assert.equal(r.status,201);assert.equal(r.data.role,"finance")}
  else {const r=await f.api("/api/users",{email:"bad"+i+"@qa.test",name:"Bad "+i,password:"strong-password-"+i+"-xyz",role:"super_admin"},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_CHILD_ROLE")}
}));
for(let i=0;i<5;i++)scenario(String(896+i)+" repeated public checkin remains idempotent "+(i+1),()=>withFixture(async f=>{
  addDivision(f);addTeam(f,"team","d");addRegistration(f,"r","d","team",{token:"repeat-"+i});const a=await publicCall(f,"/api/checkin/repeat-"+i+"/confirm","POST",{});assert.equal(a.status,200);
  const first=f.db.prepare("SELECT checked_in_at FROM registrations WHERE id='r'").get().checked_in_at;const b=await publicCall(f,"/api/checkin/repeat-"+i+"/confirm","POST",{});assert.equal(b.status,200);assert.equal(f.db.prepare("SELECT checked_in_at FROM registrations WHERE id='r'").get().checked_in_at,first);
}));

test("QA scenarios 401-900: 500-scenario stress matrix",async t=>{
  assert.equal(cases.length,500,"stress matrix must contain exactly 500 new scenarios");
  for(const item of cases)await t.test(item.name,item.fn);
});
