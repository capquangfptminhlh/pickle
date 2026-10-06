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
async function withFixture(fn){
  const f=await fresh();try{return await fn(f)}finally{f.db.close()}
}
async function addActor(f,id,role,{clubId=null,tournamentId=null}={}){
  f.db.prepare("INSERT INTO app_users(id,email,display_name,role,password_hash,active,club_id,tournament_id_scope) VALUES(?,?,?,?,?,1,?,?)")
    .run(id,id+"@test.vn",id,role,"unused",clubId,tournamentId);
  f.tokens[id]=await signSession(f.env,f.db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
  return id;
}
function addClub(f,id="club",name="CLB QA"){
  f.db.prepare("INSERT INTO clubs(id,name,slug,active) VALUES(?,?,?,1)").run(id,name,id);return id;
}
function addPlayer(f,id,{name=id,createdBy="admin",clubId=null,active=1,gender="male",rating=3,skill="B",avatar=""}={}){
  f.db.prepare("INSERT INTO players(id,club_id,created_by_user_id,full_name,gender,rating,skill_level,avatar_url,active,phone) VALUES(?,?,?,?,?,?,?,?,?,?)")
    .run(id,clubId,createdBy,name,gender,rating,skill,avatar,active,"0900000000");return id;
}
function addDivision(f,id="d",{tournamentId="own",eventType="doubles",format="pool_to_knockout"}={}){
  f.db.prepare("INSERT INTO divisions(id,tournament_id,name,event_type,format,advance_count) VALUES(?,?,?,?,?,2)").run(id,tournamentId,id,eventType,format);return id;
}
function addTeam(f,id,did,playerIds=[]){
  f.db.prepare("INSERT INTO teams(id,division_id,name,status) VALUES(?,?,?,'active')").run(id,did,id);
  for(const pid of playerIds)f.db.prepare("INSERT INTO team_players(team_id,player_id) VALUES(?,?)").run(id,pid);
  return id;
}
async function publicCall(f,path){
  const response=await worker.fetch(new Request("https://test.invalid"+path),f.env);
  let data=null;try{data=await response.json()}catch{}
  return {status:response.status,data};
}
async function avatarCall(f,playerId,{actor="admin",type="image/png",size=64,name="avatar.png",includeFile=true}={}){
  const form=new FormData();
  if(includeFile)form.append("avatar",new Blob([new Uint8Array(size)],{type}),name);
  const headers={};if(actor)headers.Authorization="Bearer "+f.tokens[actor];
  const response=await worker.fetch(new Request("https://test.invalid/api/players/"+encodeURIComponent(playerId)+"/avatar",{method:"POST",headers,body:form}),f.env);
  let data=null;try{data=await response.json()}catch{}
  return {status:response.status,data};
}
const cases=[];
const scenario=(name,fn)=>cases.push({name,fn});

// 201-250: 50 tournament creation / update / operational setup cases.
const createVariants=[
  ["Giải Bình Lợi Open","doubles","pool_to_knockout",false,"draft"],
  ["Cúp Pickleball 20/10","doubles","round_robin",true,"registration"],
  ["Đôi Nam Nữ Mở Rộng","mixed_doubles","pool_to_knockout",true,"draft"],
  ["Singles Challenge","singles","single_elimination",false,"draft"],
  ["Team Cup","team","double_elimination",false,"draft"],
  ["Giải A+ / B+","doubles","single_elimination",true,"registration"],
  ["Cúp Mùa Thu 2026","doubles","pool_to_knockout",false,"draft"],
  ["PickleUp Tour #1","doubles","round_robin",true,"registration"],
  ["Bình Lợi – Chung Kết","mixed_doubles","single_elimination",true,"draft"],
  ["Giải CLB & Friends","doubles","pool_to_knockout",false,"draft"],
  ["Cúp 16 Cặp","doubles","pool_to_knockout",true,"registration"],
  ["Cúp 32 Cặp","doubles","pool_to_knockout",true,"draft"],
  ["Giải Nội Bộ 01","singles","round_robin",false,"draft"],
  ["Giải Nội Bộ 02","doubles","double_elimination",false,"draft"],
  ["Women's Open","doubles","single_elimination",true,"registration"],
  ["Men's Open","doubles","single_elimination",true,"registration"],
  ["Mixed Sunday","mixed_doubles","round_robin",true,"draft"],
  ["🏓 PickleUp Festival","doubles","pool_to_knockout",true,"registration"],
  ["Giải thử nghiệm Unicode Đặng–Lê","doubles","round_robin",false,"draft"],
  ["Final Test Tournament","team","pool_to_knockout",false,"draft"]
];
createVariants.forEach(([name,eventType,format,publicVisible,status],i)=>scenario(
  String(201+i)+" create tournament variant "+(i+1),
  ()=>withFixture(async f=>{
    const r=await f.api("/api/tournaments",{name,eventType,format,publicVisible,status,venue:"Sân QA "+(i+1),divisionName:"Nội dung "+(i+1)},"POST");
    assert.equal(r.status,201);assert.equal(r.data.name,name);assert.equal(Boolean(r.data.public_visible),publicVisible);
    const d=f.db.prepare("SELECT * FROM divisions WHERE tournament_id=?").get(r.data.id);
    assert.ok(d);assert.equal(d.event_type,eventType);assert.equal(d.format,format);assert.equal(d.name,"Nội dung "+(i+1));
  })
));
const updateVariants=[
  {venue:"Sân mới 1"},
  {name:"Tên giải sau chỉnh sửa"},
  {publicVisible:true},
  {publicVisible:false},
  {status:"registration"},
  {status:"completed"},
  {startAt:"2026-10-20T01:00:00.000Z"},
  {endAt:"2026-10-20T10:00:00.000Z"},
  {venue:"Nhà thi đấu Bình Lợi",status:"registration"},
  {name:"Giải cập nhật toàn bộ",venue:"Sân Trung Tâm",publicVisible:true,status:"registration",startAt:"2026-11-01T01:00:00.000Z",endAt:"2026-11-01T09:00:00.000Z"}
];
updateVariants.forEach((patch,i)=>scenario(
  String(221+i)+" update tournament variant "+(i+1),
  ()=>withFixture(async f=>{
    const c=await f.api("/api/tournaments",{name:"Update Target "+i},"POST");
    const r=await f.api("/api/tournaments/"+c.data.id,patch,"PATCH");assert.equal(r.status,200);
    if(patch.name!==undefined)assert.equal(r.data.name,patch.name);
    if(patch.venue!==undefined)assert.equal(r.data.venue_name,patch.venue);
    if(patch.status!==undefined)assert.equal(r.data.status,patch.status);
    if(patch.publicVisible!==undefined)assert.equal(Boolean(r.data.public_visible),patch.publicVisible);
    if(patch.startAt!==undefined)assert.equal(r.data.start_at,patch.startAt);
    if(patch.endAt!==undefined)assert.equal(r.data.end_at,patch.endAt);
  })
));
const guardCases=[
  ["blank name",{name:""},400,"admin"],
  ["spaces only",{name:"   "},400,"admin"],
  ["tab newline only",{name:"\t\n"},400,"admin"],
  ["referee forbidden",{name:"Ref Cup"},403,"local"],
  ["invalid status",{name:"Bad Status Cup",status:"published"},400,"admin"],
  ["organizer allowed",{name:"Organizer Cup"},201,"organizer"],
  ["super admin unicode",{name:"Giải ĐẶC BIỆT"},201,"admin"],
  ["very short name",{name:"A"},201,"admin"],
  ["numeric-looking name",{name:"2026"},201,"admin"],
  ["punctuation name",{name:"A/B - C.D #1"},201,"admin"]
];
guardCases.forEach(([label,body,status,actor],i)=>scenario(
  String(231+i)+" tournament guard "+label,
  ()=>withFixture(async f=>{const r=await f.api("/api/tournaments",body,"POST",actor);assert.equal(r.status,status)})
));
const workflowCases=[
  async f=>{const r=await f.api("/api/tournaments",{name:"Default Division"},"POST");assert.equal(f.db.prepare("SELECT COUNT(*) n FROM divisions WHERE tournament_id=?").get(r.data.id).n,1)},
  async f=>{const r=await f.api("/api/tournaments",{name:"Six Courts"},"POST");for(let i=1;i<=6;i++)assert.equal((await f.api("/api/tournaments/"+r.data.id+"/courts",{name:"Sân "+i,sortOrder:i},"POST")).status,201);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM courts WHERE tournament_id=?").get(r.data.id).n,6)},
  async f=>{const r=await f.api("/api/tournaments",{name:"Extra Division"},"POST");assert.equal((await f.api("/api/tournaments/"+r.data.id+"/divisions",{name:"Đôi nữ",eventType:"doubles"},"POST")).status,201);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM divisions WHERE tournament_id=?").get(r.data.id).n,2)},
  async f=>{const a=await f.api("/api/tournaments",{name:"Same Name"},"POST"),b=await f.api("/api/tournaments",{name:"Same Name"},"POST");assert.notEqual(a.data.slug,b.data.slug)},
  async f=>{const r=await f.api("/api/tournaments",{name:"Public Flow",publicVisible:true},"POST");assert.ok((await publicCall(f,"/api/public/state")).data.tournaments.some(x=>x.id===r.data.id))},
  async f=>{const r=await f.api("/api/tournaments",{name:"Private Flow",publicVisible:false},"POST");assert.ok(!(await publicCall(f,"/api/public/state")).data.tournaments.some(x=>x.id===r.data.id))},
  async f=>{const r=await f.api("/api/tournaments",{name:"Organizer Owned"},"POST","organizer");assert.equal(f.db.prepare("SELECT owner_user_id FROM tournaments WHERE id=?").get(r.data.id).owner_user_id,"organizer")},
  async f=>{const r=await f.api("/api/tournaments",{name:"Delete Flow"},"POST");await f.api("/api/tournaments/"+r.data.id+"/courts",{name:"Sân X"},"POST");assert.equal((await f.api("/api/tournaments/"+r.data.id,undefined,"DELETE")).status,200);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM divisions WHERE tournament_id=?").get(r.data.id).n,0)},
  async f=>{const r=await f.api("/api/tournaments",{name:"Toggle Flow",publicVisible:false},"POST");await f.api("/api/tournaments/"+r.data.id,{publicVisible:true},"PATCH");assert.ok((await publicCall(f,"/api/public/state")).data.tournaments.some(x=>x.id===r.data.id))},
  async f=>{const r=await f.api("/api/tournaments",{name:"Date Flow",startAt:"2026-12-01T01:00:00.000Z",endAt:"2026-12-01T09:00:00.000Z"},"POST");assert.equal(r.data.start_at,"2026-12-01T01:00:00.000Z");assert.equal(r.data.end_at,"2026-12-01T09:00:00.000Z")}
];
workflowCases.forEach((fn,i)=>scenario(String(241+i)+" tournament operational flow "+(i+1),()=>withFixture(fn)));

// 251-300: 50 athlete-list import / update / rating cases.
const skills=["A+","A","B+","B","C+","C"];
const genders=["male","female","other"];
for(let i=0;i<20;i++)scenario(String(251+i)+" import athlete variant "+(i+1),()=>withFixture(async f=>{
  const row={
    fullName:"Imported Athlete "+i,
    nickname:"Nick "+i,
    gender:genders[i%genders.length],
    rating:2.5+(i%10)*0.2,
    skillLevel:skills[i%skills.length],
    phone:"09"+String(i).padStart(8,"0"),
    club:"CLB Import "+(i%4),
    avatarUrl:"https://img.test/"+i+".png"
  };
  const r=await f.api("/api/import/players",{rows:[row]},"POST");assert.equal(r.status,201);assert.equal(r.data.created,1);
  const p=f.db.prepare("SELECT p.*,c.name club_name FROM players p LEFT JOIN clubs c ON c.id=p.club_id WHERE p.full_name=?").get(row.fullName);
  assert.equal(p.nickname,row.nickname);assert.equal(p.gender,row.gender);assert.equal(p.skill_level,row.skillLevel);assert.equal(Number(p.rating),row.rating);assert.equal(p.phone,row.phone);assert.equal(p.club_name,row.club);assert.equal(p.avatar_url,row.avatarUrl);
}));
const bulkSizes=[2,3,5,8,10,16,32,64,128,256];
bulkSizes.forEach((n,i)=>scenario(String(271+i)+" bulk import "+n+" athletes",()=>withFixture(async f=>{
  const rows=Array.from({length:n},(_,j)=>({fullName:"Bulk "+n+"-"+j,skillLevel:skills[j%6],gender:genders[j%3],rating:2+(j%20)/10}));
  const r=await f.api("/api/import/players",{rows},"POST");assert.equal(r.status,201);assert.equal(r.data.created,n);assert.equal(new Set(r.data.ids).size,n);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM players WHERE full_name LIKE ?").get("Bulk "+n+"-%").n,n);
})));
const updateCases=[
  {seed:{skill:"C"},row:{skillLevel:"A+"},check:p=>assert.equal(p.skill_level,"A+")},
  {seed:{active:0},row:{skillLevel:"B"},check:p=>assert.equal(p.active,1)},
  {seed:{rating:2.5},row:{rating:4.2},check:p=>assert.equal(Number(p.rating),4.2)},
  {seed:{gender:"male"},row:{gender:"female"},check:p=>assert.equal(p.gender,"female")},
  {seed:{avatar:"https://old.test/a.png"},row:{avatarUrl:"https://new.test/b.png"},check:p=>assert.equal(p.avatar_url,"https://new.test/b.png")},
  {seed:{avatar:"https://keep.test/a.png"},row:{phone:"0999999999"},check:p=>assert.equal(p.avatar_url,"https://keep.test/a.png")},
  {seed:{},row:{nickname:"Tên sân"},check:p=>assert.equal(p.nickname,"Tên sân")},
  {seed:{},row:{phone:"0888888888"},check:p=>assert.equal(p.phone,"0888888888")},
  {seed:{skill:"B+"},row:{skillLevel:"C+"},check:p=>assert.equal(p.skill_level,"C+")},
  {seed:{rating:3.1},row:{rating:3.9,skillLevel:"A"},check:p=>{assert.equal(Number(p.rating),3.9);assert.equal(p.skill_level,"A")}}
];
updateCases.forEach((cfg,i)=>scenario(String(281+i)+" re-import updates athlete "+(i+1),()=>withFixture(async f=>{
  addPlayer(f,"existing",{name:"Same Athlete",...cfg.seed});
  const r=await f.api("/api/import/players",{rows:[{fullName:i%2?"same athlete":"Same Athlete",...cfg.row}]},"POST");assert.equal(r.status,201);assert.equal(r.data.updated,1);assert.equal(r.data.created,0);
  cfg.check(f.db.prepare("SELECT * FROM players WHERE id='existing'").get());
})));
const importGuardCases=[
  async f=>{const r=await f.api("/api/import/players",{rows:[]},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_IMPORT_SIZE")},
  async f=>{const r=await f.api("/api/import/players",{rows:"not-array"},"POST");assert.equal(r.status,400);assert.equal(r.data.error,"INVALID_IMPORT_SIZE")},
  async f=>{const r=await f.api("/api/import/players",{rows:Array.from({length:5001},(_,i)=>({fullName:"Too Many "+i}))},"POST");assert.equal(r.status,400);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM players WHERE full_name LIKE 'Too Many %'").get().n,0)},
  async f=>{const r=await f.api("/api/import/players",{rows:[{fullName:"Organizer Import",skillLevel:"A"}]},"POST","organizer");assert.equal(r.status,201)},
  async f=>{const r=await f.api("/api/import/players",{rows:[{fullName:"Ref Import"}]},"POST","local");assert.equal(r.status,403)},
  async f=>{await addActor(f,"finance","finance");const r=await f.api("/api/import/players",{rows:[{fullName:"Finance Import"}]},"POST","finance");assert.equal(r.status,403)},
  async f=>{const r=await f.api("/api/import/players",{rows:[{fullName:"   "},{name:""}]},"POST");assert.equal(r.status,201);assert.equal(r.data.created,0)},
  async f=>{const r=await f.api("/api/import/players",{rows:[{fullName:"Bad Skill",skillLevel:"Z"}]},"POST");assert.equal(r.status,201);assert.equal(f.db.prepare("SELECT skill_level FROM players WHERE full_name='Bad Skill'").get().skill_level,"B")},
  async f=>{addPlayer(f,"rate-up",{rating:3});const r=await f.api("/api/players/rate-up",{rating:3.2,ratingReason:"QA tăng điểm"},"PATCH");assert.equal(r.status,200);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM rating_history WHERE player_id='rate-up'").get().n,1)},
  async f=>{addPlayer(f,"rate-down",{rating:3});const r=await f.api("/api/players/rate-down",{rating:2.8,ratingReason:"QA giảm điểm"},"PATCH");assert.equal(r.status,200);const h=f.db.prepare("SELECT * FROM rating_history WHERE player_id='rate-down'").get();assert.equal(Number(h.after_rating),2.8)}
];
importGuardCases.forEach((fn,i)=>scenario(String(291+i)+" import and athlete rating guard "+(i+1),()=>withFixture(fn)));

// 301-350: 50 avatar upload / replace / permission / persistence cases.
const validTypes=[
  ["image/png","png"],["image/jpeg","jpg"],["image/webp","webp"]
];
for(let i=0;i<20;i++)scenario(String(301+i)+" avatar valid upload "+(i+1),()=>withFixture(async f=>{
  addPlayer(f,"p"+i);
  const [type,ext]=validTypes[i%3],size=32+i*17,name="ảnh đại diện "+i+"."+ext;
  const r=await avatarCall(f,"p"+i,{type,size,name});assert.equal(r.status,200);assert.ok(r.data.avatarUrl.includes("/api/media/avatars%2F"));assert.ok(r.data.avatarUrl.endsWith("."+ext));
  const p=f.db.prepare("SELECT avatar_url FROM players WHERE id=?").get("p"+i);assert.equal(p.avatar_url,r.data.avatarUrl);
  assert.equal(f.mediaPuts.length,1);assert.equal(f.mediaPuts[0].bytes,size);assert.equal(f.mediaPuts[0].opts.httpMetadata.contentType,type);assert.equal(f.mediaPuts[0].opts.customMetadata.originalName,name);
}));
for(let i=0;i<10;i++)scenario(String(321+i)+" avatar replacement "+(i+1),()=>withFixture(async f=>{
  addPlayer(f,"replace"+i,{avatar:"https://old.test/"+i+".png"});
  const first=await avatarCall(f,"replace"+i,{type:"image/png",size:50+i,name:"first-"+i+".png"});
  const second=await avatarCall(f,"replace"+i,{type:"image/webp",size:80+i,name:"second-"+i+".webp"});
  assert.equal(first.status,200);assert.equal(second.status,200);assert.notEqual(first.data.avatarUrl,second.data.avatarUrl);
  assert.equal(f.db.prepare("SELECT avatar_url FROM players WHERE id=?").get("replace"+i).avatar_url,second.data.avatarUrl);assert.equal(f.mediaPuts.length,2);
}));
const avatarGuardCases=[
  async f=>{addPlayer(f,"p");const r=await avatarCall(f,"p",{includeFile:false});assert.equal(r.status,400);assert.equal(r.data.error,"FILE_REQUIRED")},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"image/gif",name:"a.gif"})).status,400)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"text/plain",name:"a.txt"})).status,400)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{type:"application/pdf",name:"a.pdf"})).status,400)},
  async f=>{addPlayer(f,"p");const r=await avatarCall(f,"p",{size:3*1024*1024+1});assert.equal(r.status,413);assert.equal(r.data.error,"FILE_TOO_LARGE")},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{actor:null})).status,401)},
  async f=>{await addActor(f,"finance","finance");addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{actor:"finance"})).status,403)},
  async f=>{addPlayer(f,"p",{createdBy:"organizer"});assert.equal((await avatarCall(f,"p",{actor:"organizer"})).status,200)},
  async f=>{addPlayer(f,"p",{createdBy:"admin"});assert.equal((await avatarCall(f,"p",{actor:"organizer"})).status,403)},
  async f=>{addPlayer(f,"missing-target");const before=f.mediaPuts.length;const r=await avatarCall(f,"does-not-exist");assert.equal(r.status,404);assert.equal(r.data.error,"NOT_FOUND");assert.equal(f.mediaPuts.length,before)}
];
avatarGuardCases.forEach((fn,i)=>scenario(String(331+i)+" avatar permission or validation "+(i+1),()=>withFixture(fn)));
const avatarScopeCases=[
  async f=>{addDivision(f);addPlayer(f,"p");addPlayer(f,"q");addTeam(f,"a","d",["p"]);addTeam(f,"b","d",["q"]);f.db.exec("INSERT INTO matches(id,division_id,team_a_id,team_b_id,referee_user_id,status) VALUES('m','d','a','b','local','scheduled')");assert.equal((await avatarCall(f,"p",{actor:"local"})).status,200)},
  async f=>{addPlayer(f,"p");assert.equal((await avatarCall(f,"p",{actor:"local"})).status,403)},
  async f=>{addClub(f,"clubA");await addActor(f,"manager","club_manager",{clubId:"clubA"});addPlayer(f,"p",{clubId:"clubA"});assert.equal((await avatarCall(f,"p",{actor:"manager"})).status,200)},
  async f=>{addClub(f,"clubA");addClub(f,"clubB");await addActor(f,"manager","club_manager",{clubId:"clubA"});addPlayer(f,"p",{clubId:"clubB"});assert.equal((await avatarCall(f,"p",{actor:"manager"})).status,403)},
  async f=>{addDivision(f);addPlayer(f,"p");addPlayer(f,"q");addTeam(f,"a","d",["p"]);addTeam(f,"b","d",["q"]);assert.equal((await avatarCall(f,"p",{actor:"organizer"})).status,200)},
  async f=>{addPlayer(f,"p",{active:0});assert.equal((await avatarCall(f,"p")).status,200)},
  async f=>{addPlayer(f,"p");const r=await avatarCall(f,"p",{type:"image/jpeg",name:"UPPER.JPG"});assert.ok(r.data.avatarUrl.endsWith(".jpg"))},
  async f=>{addPlayer(f,"p");const r=await avatarCall(f,"p",{type:"image/png",name:"no-extension"});assert.ok(r.data.avatarUrl.endsWith(".png"))},
  async f=>{addPlayer(f,"p");const r=await avatarCall(f,"p",{type:"image/webp",name:"ảnh có dấu.webp"});assert.equal(f.mediaPuts[0].opts.customMetadata.originalName,"ảnh có dấu.webp");assert.equal(r.status,200)},
  async f=>{addPlayer(f,"p");const r=await avatarCall(f,"p",{size:3*1024*1024,type:"image/png"});assert.equal(r.status,200);assert.equal(f.mediaPuts[0].bytes,3*1024*1024)}
];
avatarScopeCases.forEach((fn,i)=>scenario(String(341+i)+" avatar scope and persistence "+(i+1),()=>withFixture(fn)));

// 351-400: 50 match-score / rating integrity cases.
for(let i=0;i<10;i++)scenario(String(351+i)+" best-of-3 quick score A wins "+(i+1),async()=>{
  const f=await scoringFixture();try{
    const r=await f.api("quick-score",{sets:[[11,i],[11,(i+3)%10]]});assert.equal(r.status,200);assert.equal(f.match().status,"completed");assert.equal(f.match().winner_team_id,"a");assert.equal(f.sets().length,2);
  }finally{f.db.close()}
});
for(let i=0;i<10;i++)scenario(String(361+i)+" best-of-3 quick score B wins "+(i+1),async()=>{
  const f=await scoringFixture();try{
    const r=await f.api("quick-score",{sets:[[i,11],[(i+4)%10,11]]});assert.equal(r.status,200);assert.equal(f.match().status,"completed");assert.equal(f.match().winner_team_id,"b");assert.equal(f.sets().length,2);
  }finally{f.db.close()}
});
for(let i=0;i<5;i++)scenario(String(371+i)+" best-of-5 quick score A wins "+(i+1),async()=>{
  const f=await scoringFixture();try{
    f.db.exec("UPDATE divisions SET best_of=5,points_to_win=15 WHERE id='division'");
    const r=await f.api("quick-score",{sets:[[15,4+i],[15,5+i],[15,6+i]]});assert.equal(r.status,200);assert.equal(f.match().winner_team_id,"a");assert.equal(f.sets().length,3);
  }finally{f.db.close()}
});
for(let i=0;i<5;i++)scenario(String(376+i)+" best-of-5 quick score B wins "+(i+1),async()=>{
  const f=await scoringFixture();try{
    f.db.exec("UPDATE divisions SET best_of=5,points_to_win=15 WHERE id='division'");
    const r=await f.api("quick-score",{sets:[[15,4+i],[4+i,15],[5+i,15],[6+i,15]]});assert.equal(r.status,200);assert.equal(f.match().winner_team_id,"b");assert.equal(f.sets().length,4);
  }finally{f.db.close()}
});
const invalidScores=[
  [[11,11],[11,3]],
  [[11,-1],[11,3]],
  [[11.5,3],[11,3]],
  [[11,3]],
  [[11,3],[3,11]],
  [[11,3],[11,4],[3,11]],
  [[10,8],[11,3]],
  [[12,11],[11,3]],
  [[11,3],[11,null]],
  [[32768,0],[11,0]]
];
invalidScores.forEach((sets,i)=>scenario(String(381+i)+" invalid quick-score shape "+(i+1),async()=>{
  const f=await scoringFixture();try{
    const before=f.match();const r=await f.api("quick-score",{sets});assert.equal(r.status,400);assert.deepEqual(f.match(),before);assert.equal(f.sets().length,0);
  }finally{f.db.close()}
}));
const scoreActionCases=[
  async()=>{const f=await scoringFixture();try{const r=await f.api("point",{side:"A",delta:1});assert.equal(r.status,200);assert.equal(f.match().current_score_a,1);assert.equal(f.match().status,"live")}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{const r=await f.api("point",{side:"B",delta:1});assert.equal(r.status,200);assert.equal(f.match().current_score_b,1)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{await f.api("point",{side:"A",delta:-1});assert.equal(f.match().current_score_a,0)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{await f.api("point",{side:"A",delta:1});await f.api("point",{side:"A",delta:1});assert.equal(f.match().current_score_a,2);assert.equal((await f.api("undo")).status,200);assert.equal(f.match().current_score_a,1)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{assert.equal((await f.api("point",{side:"A",delta:1,expectedVersion:0})).status,409);assert.equal(f.match().current_score_a,0)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{assert.equal((await f.api("point",{side:"A",delta:1},"ref")).status,200);assert.equal(f.match().current_score_a,1)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{f.db.exec("UPDATE app_users SET tournament_id_scope='other' WHERE id='ref'");assert.equal((await f.api("point",{side:"A",delta:1},"ref")).status,403)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{f.db.exec("UPDATE matches SET status='cancelled' WHERE id='match'");assert.equal((await f.api("point",{side:"A",delta:1})).status,409)}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{const r=await f.api("special-result",{winnerTeamId:"a",reason:"walkover"});assert.equal(r.status,200);assert.equal(f.match().status,"completed");assert.equal(f.match().winner_team_id,"a")}finally{f.db.close()}},
  async()=>{const f=await scoringFixture();try{f.db.exec("INSERT INTO match_sets VALUES('first','match',1,11,4,1);UPDATE matches SET status='live',current_score_a=11,current_score_b=7 WHERE id='match'");const r=await f.api("finish-set",{});assert.equal(r.status,200);assert.equal(f.match().status,"completed");assert.equal(f.match().winner_team_id,"a");assert.equal(f.sets().length,2)}finally{f.db.close()}}
];
scoreActionCases.forEach((fn,i)=>scenario(String(391+i)+" live scoring action "+(i+1),fn));

test("QA scenarios 201-400: tournament setup, roster import, avatars and scoring",async t=>{
  assert.equal(cases.length,200,"specialized tournament operations matrix must contain exactly 200 scenarios");
  for(const item of cases)await t.test(item.name,item.fn);
});
