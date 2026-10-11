import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";

function fixture(eventType="doubles"){
  const state={clubs:[{id:"club",name:"CLB Đặng",active:true}],tournaments:[],divisions:[{id:"division",eventType}],courts:[],teams:[],teamPlayers:{},players:[{id:"p1",full_name:"Đặng Văn A",active:true},{id:"p2",full_name:"Nguyễn Văn B",active:true},{id:"p3",full_name:"Trần Văn C",active:true}],matches:[],referees:[],registrations:[],posts:[],sponsors:[],audit:[]};
  let persisted=JSON.stringify(state);
  const context={window:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{},crypto:webcrypto,localStorage:{getItem:()=>persisted,setItem:(_key,value)=>persisted=value},console,Date,Set,Map};
  vm.runInNewContext(readFileSync(new URL("../preview/preview-api.js",import.meta.url),"utf8"),context);
  return {api:context.window.PickleAPI,read:()=>JSON.parse(persisted)};
}
test("Preview replaces members while preserving team and registration",async()=>{
  const f=fixture(),a=await f.api.createTeam("division",{name:"Team",playerIds:["p1","p2"]});
  await f.api.createRegistration("division",{teamId:a.id});
  const before=f.read().registrations;
  await f.api.updateTeam(a.id,{playerIds:["p2","p3"]});
  assert.deepEqual(f.read().teamPlayers[a.id].sort(),["p2","p3"]);assert.deepEqual(f.read().registrations,before);
});
test("Preview rejects reactivation after athletes are reused",async()=>{
  const f=fixture(),a=await f.api.createTeam("division",{name:"A",playerIds:["p1","p2"]});
  await f.api.updateTeam(a.id,{status:"withdrawn"});await f.api.createTeam("division",{name:"B",playerIds:["p1","p3"]});
  await assert.rejects(()=>f.api.updateTeam(a.id,{status:"active"}),{message:"PLAYER_ALREADY_IN_DIVISION"});
});
test("Preview resolves Unicode club text to a club ID",async()=>{
  const f=fixture(),a=await f.api.createTeam("division",{name:"A",club:"clb đặng",playerIds:["p1","p2"]});assert.equal(a.clubId,"club");
});
test("Preview matches Vietnamese canonical Unicode in CSV",async()=>{
  const f=fixture();const r=await f.api.importTeams("division",[{name:"A",player1:"đặng văn a".normalize("NFD"),player2:"NGUYỄN VĂN B"}]);assert.equal(r.created,1);
});
test("Preview locks roster after scoring while allowing metadata edits",async()=>{
  const f=fixture(),a=await f.api.createTeam("division",{name:"A",playerIds:["p1","p2"]});
  const m=await f.api.createMatch("division",{teamAId:a.id,teamBId:null});await f.api.point(m.id,{side:"A",delta:1});
  await assert.rejects(()=>f.api.updateTeam(a.id,{playerIds:["p2","p3"]}),{message:"TEAM_ROSTER_LOCKED"});
  await f.api.updateTeam(a.id,{name:"Metadata"});assert.equal(f.read().teams[0].name,"Metadata");
});
test("Preview legacy member additions also preserve scored match history",async()=>{
  const f=fixture("team"),a=await f.api.createTeam("division",{name:"A",playerIds:["p1"]});
  const m=await f.api.createMatch("division",{teamAId:a.id,teamBId:null});await f.api.point(m.id,{side:"A",delta:1});
  await assert.rejects(()=>f.api.addTeamPlayer(a.id,"p2"),{message:"TEAM_ROSTER_LOCKED"});assert.deepEqual(f.read().teamPlayers[a.id],["p1"]);
});
test("Preview reactivation revalidates legacy member counts",async()=>{
  const f=fixture("team"),a=await f.api.createTeam("division",{name:"A",playerIds:["p1"]});
  await f.api.updateTeam(a.id,{status:"withdrawn"});await f.api.updateDivisionFull("division",{eventType:"doubles"});
  await assert.rejects(()=>f.api.updateTeam(a.id,{status:"active"}),{message:"INVALID_PLAYER_COUNT"});assert.equal(f.read().teams[0].status,"withdrawn");
});
test("Preview metadata preserves an unchanged archived club",async()=>{
  const f=fixture(),a=await f.api.createTeam("division",{name:"A",clubId:"club",playerIds:["p1","p2"]});
  await f.api.updateClub("club",{name:"CLB Đặng",active:false});await f.api.updateTeam(a.id,{name:"Metadata",clubId:"club"});
  assert.equal(f.read().teams[0].clubId,"club");assert.equal(f.read().teams[0].club,"CLB Đặng");
});

test('Preview creates, renames and logs in a referee without email',async()=>{
 const f=fixture(),password='PreviewRefereeUsername123!';
 const created=await f.api.createReferee({username:'TT_LOCAL',name:'Trọng tài',password});assert.equal(created.username,'tt_local');
 await assert.rejects(()=>f.api.createReferee({username:'tt_local',name:'Trùng tên',password}),{message:'EMAIL_EXISTS'});
 await f.api.updateReferee(created.id,{username:'TT_NEW'});
 const login=await f.api.login('TT_NEW',password);assert.equal(login.user.role,'referee');
});

test("Preview ranks a three-way tie using only mutual points and exposes ranks",async()=>{
 const matches=[['A','B',27,26],['B','C',27,7],['C','A',27,20],['A','D',27,0],['B','D',27,26],['C','D',27,26]].map(([a,b,x,y],i)=>({id:'m'+i,divisionId:'division',stage:'Bảng A',a,b,winner:x>y?a:b,sets:[[x,y]],status:'completed'}));
 const state={tournaments:[],divisions:[{id:'division',eventType:'doubles'}],teams:['A','B','C','D'].map(id=>({id,name:id,divisionId:'division',group:'A',status:'active'})),matches,players:[],teamPlayers:{},audit:[]};
 let saved=JSON.stringify(state);const context={window:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{},crypto:webcrypto,localStorage:{getItem:()=>saved,setItem:(_,v)=>saved=v},console,Date,Set,Map};
 vm.runInNewContext(readFileSync(new URL('../preview/preview-api.js',import.meta.url),'utf8'),context);
 const result=await context.window.PickleAPI.publicState();
 assert.deepEqual(Array.from(result.teams).sort((a,b)=>a.standingRank-b.standingRank).map(t=>t.id),['B','A','C','D']);
});
