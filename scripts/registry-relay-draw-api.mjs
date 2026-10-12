import assert from "node:assert/strict";

const target=new URL(process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787");
if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname))throw new Error("Relay draw write regressions require a local server");
async function api(path,body,{method=body===undefined?"GET":"POST",actor=admin,expected=[200,201]}={}){
  const response=await fetch(new URL(path,target),{method,headers:{...actor,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);return {data,status:response.status};
}
async function login(email,password){
  const response=await fetch(new URL("/api/auth/login",target),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
  if(data.token)return {Authorization:"Bearer "+data.token};
  return {Cookie:response.headers.get("set-cookie").split(";")[0]};
}
const admin=await login(process.env.ADMIN_EMAIL||"admin@pickle.test",process.env.ADMIN_PASSWORD||"cloudflare-test-password-123");
const state=async(actor=admin)=>(await api("/api/admin/state",undefined,{actor})).data;
const match=async id=>(await state()).matches.find(m=>m.id===id);
const stamp=Date.now(),password="relay-account-password-123";
const tournament=(await api("/api/tournaments",{name:`Local relay draw ${stamp}`,eventType:"team",publicVisible:true})).data;
const tid=tournament.tournament?.id||tournament.id;
const other=(await api("/api/tournaments",{name:`Other relay scope ${stamp}`})).data;
const otherTid=other.tournament?.id||other.id;
const division=(await api(`/api/tournaments/${tid}/divisions`,{name:"Independent three player relay",eventType:"team",bestOf:1,pointsToWin:27,winByTwo:false,relaySegmentPoints:9,relayTeamSize:3,scoringMode:"side_out"})).data;
const did=division.id;
assert.equal((await state()).divisions.find(d=>d.id===did).relayTeamSize,3,"Relay format must persist on PostgreSQL");
const teams=[],rosters=[];
for(let side=0;side<3;side++){
  const ids=[];
  for(let slot=0;slot<3;slot++)ids.push((await api("/api/players",{fullName:`Relay ${stamp} ${side}${slot}`,rating:3+slot/10})).data.id);
  rosters.push(ids);teams.push((await api(`/api/divisions/${did}/teams`,{name:`Relay ${side}`,group:"A",playerIds:ids})).data.id);
}
const makeMatch=async(body={})=>(await api(`/api/divisions/${did}/matches`,{stage:"Relay test",teamAId:teams[0],teamBId:teams[1],...body})).data.id;
const id=await makeMatch(),independentId=await makeMatch();
const draw=async(mid,options={})=>api(`/api/matches/${mid}/relay-draw`,{expectedVersion:(await match(mid)).version},options);
const permutation=order=>assert.deepEqual([...order].sort(),["AB","BC","CA"]);
let current=await match(id);assert.equal(current.relayOrderA,null);assert.equal(current.relayOrderB,null);
for(const action of ["point","quick-score","finish-set","finish"]){
  const result=await api(`/api/matches/${id}/${action}`,{side:"A",delta:1,sets:[[27,4]],expectedVersion:current.version},{expected:[409]});
  assert.equal(result.data.error,"RELAY_DRAW_REQUIRED");
}
await api(`/api/matches/${id}/relay-draw`,{},{expected:[409]});
for(const expectedVersion of [String(current.version),null,current.version+1])await api(`/api/matches/${id}/relay-draw`,{expectedVersion},{expected:[409]});
await api(`/api/matches/${id}/relay-draw`,{expectedVersion:current.version},{actor:{},expected:[401]});
const actors={};
for(const [role,scope] of [["organizer",tid],["referee",tid],["finance",null],["organizer",otherTid]]){
  const email=`relay-${role}-${scope||"global"}-${stamp}@test.vn`;
  const user=(await api("/api/users",{email,name:`Relay ${role}`,role,password,tournamentId:scope})).data;
  actors[role+(scope===otherTid?"Other":"")]=await login(email,password);if(role==="referee")actors.refereeId=user.id;
}
for(const actor of [actors.organizerOther,actors.finance,actors.referee])await draw(id,{actor,expected:[403]});
await api(`/api/matches/${id}/assignment`,{refereeUserId:actors.refereeId,expectedVersion:current.version},{method:"PATCH"});
const drawn=await draw(id,{actor:actors.referee});permutation(drawn.data.relayOrderA);permutation(drawn.data.relayOrderB);assert.ok(drawn.data.relayDrawnAt);assert.deepEqual(drawn.data.relayOrderA,drawn.data.relayOrderB);
current=await match(id);permutation(current.relayOrderA);permutation(current.relayOrderB);assert.ok(current.relayDrawnAt);
assert.equal((await match(independentId)).relayOrderA,null,"Draw belongs only to this match");
const publicState=(await api("/api/public/state",undefined,{actor:{}})).data;
assert.deepEqual(publicState.matches.find(m=>m.id===id).relayOrderA,current.relayOrderA);
const drawnVersion=current.version;
await api(`/api/matches/${id}/relay-draw`,{expectedVersion:drawnVersion-1},{expected:[409]});
const concurrent=await Promise.all([api(`/api/matches/${id}/relay-draw`,{expectedVersion:drawnVersion},{expected:[200,409]}),api(`/api/matches/${id}/relay-draw`,{expectedVersion:drawnVersion},{expected:[200,409]})]);
assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
await draw(independentId,{actor:actors.organizer});
const identity=await match(independentId);
await api(`/api/matches/${independentId}`,{teamBId:teams[2],expectedVersion:identity.version},{method:"PATCH"});
const replaced=await match(independentId);assert.equal(replaced.relayOrderA,null);assert.equal(replaced.relayOrderB,null);assert.equal(replaced.relayDrawnAt,null);
await draw(independentId);
const beforeRoster=await match(independentId);
await api(`/api/teams/${teams[2]}`,{playerIds:[...rosters[2]].reverse()},{method:"PATCH"});
const changedRoster=await match(independentId);assert.equal(changedRoster.relayOrderA,null);assert.equal(changedRoster.relayOrderB,null);assert.ok(changedRoster.version>beforeRoster.version);
current=await match(id);const retained={a:current.relayOrderA,b:current.relayOrderB,at:current.relayDrawnAt};
await api(`/api/matches/${id}/point`,{side:"A",delta:1,expectedVersion:current.version});
await draw(id,{expected:[409]});
current=await match(id);await api(`/api/matches/${id}/undo`,{expectedVersion:current.version});
current=await match(id);assert.deepEqual(current.current,[0,0]);assert.deepEqual(current.relayOrderA,retained.a);assert.deepEqual(current.relayOrderB,retained.b);assert.equal(current.relayDrawnAt,retained.at);
assert.equal((await draw(id,{expected:[409]})).data.error,"RELAY_DRAW_LOCKED");
await api(`/api/matches/${id}/quick-score`,{sets:[[27,4]],expectedVersion:current.version});
current=await match(id);assert.equal(current.status,"done");assert.deepEqual(current.sets,[[27,4]]);assert.deepEqual(current.relayOrderB,retained.b);await draw(id,{expected:[409]});
const missing=await makeMatch();
await api(`/api/matches/${missing}`,{teamBId:null,expectedVersion:(await match(missing)).version},{method:"PATCH"});
assert.equal((await draw(missing,{expected:[409]})).data.error,"MATCH_TEAMS_REQUIRED");
const four=(await api(`/api/tournaments/${tid}/divisions`,{name:"Four player relay",eventType:"team",bestOf:1,pointsToWin:36,winByTwo:false,relaySegmentPoints:9,relayTeamSize:4})).data;
const fourTeams=[];
for(let side=0;side<2;side++)fourTeams.push((await api(`/api/divisions/${four.id}/teams`,{name:`Four side ${side}`,playerIds:rosters[side]})).data.id);
const unsupported=(await api(`/api/divisions/${four.id}/matches`,{stage:"Unsupported relay",teamAId:fourTeams[0],teamBId:fourTeams[1]})).data;
assert.equal((await draw(unsupported.id,{expected:[400]})).data.error,"RELAY_DRAW_UNSUPPORTED");
const incompleteTeams=[];
for(let side=0;side<2;side++)incompleteTeams.push((await api(`/api/divisions/${did}/teams`,{name:`Incomplete relay side ${side}`,playerIds:[(await api("/api/players",{fullName:`Incomplete ${stamp} ${side}`,rating:3})).data.id]})).data.id);
const incomplete=await makeMatch({teamAId:incompleteTeams[0],teamBId:incompleteTeams[1]});
assert.equal((await draw(incomplete,{expected:[409]})).data.error,"RELAY_PARTICIPANTS_REQUIRED");
const race=await makeMatch();await draw(race);const raceVersion=(await match(race)).version;
const raceResponses=await Promise.all([api(`/api/matches/${race}/relay-draw`,{expectedVersion:raceVersion},{expected:[200,409]}),api(`/api/matches/${race}/point`,{side:"A",delta:1,expectedVersion:raceVersion},{expected:[200,409]})]);
assert.deepEqual(raceResponses.map(r=>r.status).sort(),[200,409],"Scoring and redraw serialize on the same match version");
// Optional direct DB checks are restricted to the caller's local PostgreSQL and
// only synthetic IDs created above: corrupted orders, legacy play, history lock.
if(process.env.DATABASE_URL){
  const url=new URL(process.env.DATABASE_URL);if(!["127.0.0.1","localhost","[::1]"].includes(url.hostname))throw new Error("Direct relay DB checks require local PostgreSQL");
  const {default:pg}=await import("pg"),db=new pg.Pool({connectionString:url.href});
  try{
    const unresolvedIds=[];for(let slot=0;slot<3;slot++)unresolvedIds.push((await api('/api/players',{fullName:`Unresolved ${stamp} ${slot}`})).data.id);
    const unresolvedTeam=(await api(`/api/divisions/${did}/teams`,{name:'Unconfirmed positions',playerIds:unresolvedIds})).data;
    await db.query('update team_players set slot_no=null where team_id=$1',[unresolvedTeam.id]);
    const unresolvedMatch=await makeMatch({teamAId:unresolvedTeam.id,teamBId:teams[2]});
    assert.equal((await draw(unresolvedMatch,{expected:[409]})).data.error,'RELAY_LINEUP_REQUIRED');
    for(const [index,grade] of ['C','A','B'].entries())await db.query('update players set skill_level=$1 where id=$2',[grade,unresolvedIds[index]]);
    await draw(unresolvedMatch);
    for(const [index,grade] of ['C','A','B'].entries())await db.query('update players set skill_level=$1 where id=$2',[grade,rosters[0][index]]);
    const gradeState=await state();
    for(const [index,grade] of ['C','A','B'].entries())assert.equal(gradeState.players.find(p=>p.id===rosters[0][index]).skillLevel,grade,'PostgreSQL preserves actual entered grades independently of roster slots');
    const malformed=await makeMatch();await db.query("update matches set relay_order_a='[\"AB\",\"AB\",\"CA\"]',relay_order_b='[\"AB\",\"BC\",\"CA\"]' where id=$1",[malformed]);
    assert.equal((await api(`/api/matches/${malformed}/point`,{side:"A",delta:1,expectedVersion:(await match(malformed)).version},{expected:[409]})).data.error,"RELAY_DRAW_REQUIRED");
    await draw(malformed);
    const legacy=await makeMatch();await db.query("update matches set started_at=now(),status='live',current_score_a=8 where id=$1",[legacy]);
    await api(`/api/matches/${legacy}/point`,{side:"A",delta:1,expectedVersion:(await match(legacy)).version});assert.deepEqual((await match(legacy)).current,[9,0]);assert.equal((await match(legacy)).relayOrderA,null);await draw(legacy,{expected:[409]});
    const historical=await makeMatch();await db.query("insert into score_events(match_id,event_type,payload,match_version) values($1,'POINT','{}',1)",[historical]);
    assert.equal((await draw(historical,{expected:[409]})).data.error,"RELAY_DRAW_LOCKED");
    assert.equal((await match(historical)).hasHistory,true,"Public state preserves legacy history at zero points");
    await api(`/api/matches/${historical}/point`,{side:"A",delta:1,expectedVersion:(await match(historical)).version});
    const foreignReferee=(await api("/api/users",{email:`relay-foreign-ref-${stamp}@test.vn`,name:"Foreign tournament referee",role:"referee",password,tournamentId:otherTid})).data;
    const foreignSession=await login(foreignReferee.email,password),foreignMatch=await makeMatch();
    await db.query("update matches set referee_user_id=$1 where id=$2",[foreignReferee.id,foreignMatch]);
    await draw(foreignMatch,{actor:foreignSession,expected:[403]});
    const audit=(await db.query("select count(*)::int n from audit_logs where entity_id=$1 and action='RELAY_DRAW'",[id])).rows[0];assert.equal(audit.n,2,"One audited write per successful draw");
    const source=await makeMatch(),destination=await makeMatch({teamBId:teams[2]});
    await api(`/api/matches/${destination}`,{teamAId:null,expectedVersion:(await match(destination)).version},{method:"PATCH"});
    await db.query("update matches set next_match_id=$1,next_match_side='A' where id=$2",[destination,source]);
    await draw(source);await api(`/api/matches/${source}/quick-score`,{sets:[[27,4]],expectedVersion:(await match(source)).version});
    assert.equal((await match(destination)).a,teams[0]);await draw(destination);
    await api(`/api/matches/${source}/undo`,{expectedVersion:(await match(source)).version});
    const rewound=await match(destination);assert.equal(rewound.a,"TBD");assert.equal(rewound.relayOrderA,null);assert.equal(rewound.relayOrderB,null);assert.equal(rewound.relayDrawnAt,null,"Undo of advancement invalidates the destination's participant-owned draw");
    const knockout=await makeMatch();await db.query("update matches set bracket_slot='SE-R1-M1',round_no=1 where id=$1",[knockout]);
    const poolBefore=(await db.query('select * from matches where division_id=$1 and bracket_slot is null order by id',[did])).rows;
    const preview=(await api(`/api/divisions/${did}/reset-knockout`)).data;assert.equal(preview.summary.matchCount,1);
    await api(`/api/divisions/${did}/reset-knockout`,{confirmation:'DAT LAI',expectedToken:preview.token});
    assert.equal((await db.query('select id from matches where id=$1',[knockout])).rowCount,0);
    assert.deepEqual((await db.query('select * from matches where division_id=$1 and bracket_slot is null order by id',[did])).rows,poolBefore);
    console.log('POSTGRES_KNOCKOUT_RESET_OK');
  }finally{await db.end()}
}
console.log("RELAY_DRAW_HTTP_OK",JSON.stringify({rolesAndScope:true,requiredDraw:true,independentPersistence:true,staleAndConcurrent:true,participantInvalidation:true,undoAndLegacyPreserved:true,publicOrders:true,finishedScores:true}));
