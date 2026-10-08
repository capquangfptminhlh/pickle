import assert from "node:assert/strict";

const base=process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787";
const target=new URL(base);
if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname)||!["http:","https:"].includes(target.protocol))throw new Error("Operations write tests require a local test server");
let auth={};
async function api(path,body,{method=body===undefined?"GET":"POST",actor=auth,expected=[200,201]}={}){
  const response=await fetch(new URL(path,target),{method,headers:{...actor,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);return {data,status:response.status};
}
async function login(email,password){
  const response=await fetch(new URL("/api/auth/login",target),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data.token?{Authorization:"Bearer "+data.token}:{Cookie:response.headers.get("set-cookie").split(";")[0]};
}
auth=await login(process.env.ADMIN_EMAIL||"admin@pickle.test",process.env.ADMIN_PASSWORD||"cloudflare-test-password-123");
const stamp=Date.now(),password="operations-local-synthetic-password-123";
const state=async()=>(await api("/api/admin/state")).data;
const current=async id=>(await state()).matches.find(m=>m.id===id);
const tour=(await api("/api/tournaments",{name:"Operations "+stamp,eventType:"singles",format:"single_elimination",venue:"Local regression"})).data;
const tid=tour.tournament?.id||tour.id,did=(await state()).divisions.find(d=>d.tournamentId===tid).id;
const otherTour=(await api("/api/tournaments",{name:"Other Operations "+stamp,eventType:"singles",venue:"Local regression"})).data;
const otherTid=otherTour.tournament?.id||otherTour.id,otherDid=(await state()).divisions.find(d=>d.tournamentId===otherTid).id;
const players=[],teams=[];
for(let i=0;i<4;i++){
  const p=(await api("/api/players",{fullName:`Operations Player ${i} ${stamp}`,rating:3})).data;players.push(p);
  teams.push((await api(`/api/divisions/${did}/teams`,{name:`Operations Team ${i}`,playerIds:[p.id],seed:i+1})).data);
}
const otherTeam=(await api(`/api/divisions/${otherDid}/teams`,{name:"Other team",playerIds:[players[0].id]})).data;
const court=(await api(`/api/tournaments/${tid}/courts`,{name:"Operations court"})).data;
const foreignCourt=(await api(`/api/tournaments/${otherTid}/courts`,{name:"Foreign court"})).data;
const localEmail=`operations-ref-${stamp}@test.invalid`;
const ref=(await api("/api/users/referees",{email:localEmail,name:"Operations referee",password,tournamentId:tid})).data;
const foreignRef=(await api("/api/users/referees",{email:`operations-foreign-${stamp}@test.invalid`,name:"Foreign referee",password,tournamentId:otherTid})).data;
const newMatch=async(extra={})=>(await api(`/api/divisions/${did}/matches`,{teamAId:teams[0].id,teamBId:teams[1].id,stage:"Regression",...extra})).data;
const action=async(id,name,body={},expected=[200])=>api(`/api/matches/${id}/${name}`,body,{expected});
const point=async(id,side,count)=>{for(let i=0;i<count;i++)await action(id,"point",{side,delta:1})};

// Failures must leave the existing match and series untouched.
const invalid=await newMatch();const invalidBefore=await current(invalid.id);
for(const sets of [[[11,3]],[[11,3],[3,11]],[[11.5,3],[11,3]],[[11,-1],[11,3]],[[11,3],[11,3],[3,11]],[[11,3],[3,11],[11,3],[11,3]],[[11,3],[null,11]]])await action(invalid.id,"quick-score",{sets},[400]);
await action(invalid.id,"finish",{winnerTeamId:teams[0].id},[400]);assert.deepEqual(await current(invalid.id),invalidBefore);
for(const [name,body] of [["point",{side:"A",delta:1}],["finish-set",{}],["finish",{winnerTeamId:teams[0].id}],["quick-score",{sets:[[11,3],[11,4]]}],["special-result",{winnerTeamId:teams[0].id,reason:"walkover"}],["undo",{}]])await action(invalid.id,name,{...body,expectedVersion:0},[409]);

// Assignment checks share a transaction with writes and preserve omitted fields.
await api(`/api/divisions/${did}/matches`,{teamAId:teams[0].id,teamBId:otherTeam.id},{expected:[400]});
await api(`/api/divisions/${did}/matches`,{teamAId:teams[0].id,teamBId:teams[1].id,courtId:foreignCourt.id},{expected:[400]});
await api(`/api/divisions/${did}/matches`,{teamAId:teams[0].id,teamBId:teams[1].id,refereeUserId:foreignRef.id},{expected:[400]});
const assigned=await newMatch({courtId:court.id,refereeUserId:ref.id,scheduledAt:"2026-10-01T10:00:00.000Z"});
await api(`/api/matches/${assigned.id}/assignment`,{courtId:foreignCourt.id},{method:"PATCH",expected:[400]});
await api(`/api/matches/${assigned.id}/assignment`,{refereeUserId:foreignRef.id},{method:"PATCH",expected:[400]});
await api(`/api/matches/${assigned.id}`,{teamBId:otherTeam.id},{method:"PATCH",expected:[400]});
await api(`/api/matches/${assigned.id}`,{stage:"Renamed"},{method:"PATCH"});let saved=await current(assigned.id);assert.equal(saved.courtId,court.id);assert.equal(saved.refereeId,ref.id);
await api(`/api/matches/${assigned.id}`,{courtId:null,scheduledAt:null},{method:"PATCH"});saved=await current(assigned.id);assert.equal(saved.courtId,null);
await api(`/api/matches/${assigned.id}/assignment`,{refereeUserId:null},{method:"PATCH"});assert.equal((await current(assigned.id)).refereeId,null);
await api(`/api/matches/${assigned.id}`,{status:"completed"},{method:"PATCH",expected:[400]});
await api(`/api/matches/${assigned.id}/assignment`,{expectedVersion:0},{method:"PATCH",expected:[409]});

const scoped=await newMatch({refereeUserId:ref.id}),refSession=await login(localEmail,password);
await api(`/api/users/referees/${ref.id}`,{tournamentId:otherTid},{method:"PATCH"});
await api(`/api/matches/${scoped.id}/point`,{side:"A",delta:1},{actor:refSession,expected:[401,403]});

const reversible=await newMatch();await point(reversible.id,"B",4);await point(reversible.id,"A",11);await action(reversible.id,"finish-set");
await point(reversible.id,"A",3);await point(reversible.id,"B",2);const beforeQuick=await current(reversible.id);
await action(reversible.id,"quick-score",{sets:[[3,11],[4,11]]});await action(reversible.id,"undo");const afterQuick=await current(reversible.id);
assert.deepEqual(afterQuick.sets,beforeQuick.sets);assert.deepEqual(afterQuick.current,beforeQuick.current);assert.equal(afterQuick.status,beforeQuick.status);assert.equal(afterQuick.winner,beforeQuick.winner);
await point(reversible.id,"A",8);await action(reversible.id,"finish",{winnerTeamId:teams[0].id});assert.equal((await current(reversible.id)).sets.length,2);
await action(reversible.id,"undo");assert.equal((await current(reversible.id)).sets.length,1);assert.deepEqual((await current(reversible.id)).current,[11,2]);

const onePoint=await newMatch();await point(onePoint.id,"A",1);await action(onePoint.id,"undo");await action(onePoint.id,"undo",{},[400]);
await api(`/api/matches/${onePoint.id}`,{teamBId:teams[2].id},{method:"PATCH",expected:[409]});
const cancel=await api(`/api/matches/${onePoint.id}`,undefined,{method:"DELETE"});assert.equal(cancel.data.mode,"cancelled");await action(onePoint.id,"point",{side:"A",delta:1},[409]);
await action(onePoint.id,"undo",{},[409]);
const tbd=await newMatch();await api(`/api/matches/${tbd.id}`,{teamBId:null},{method:"PATCH"});await action(tbd.id,"point",{side:"A",delta:1},[409]);

const concurrent=await newMatch();const version=(await current(concurrent.id)).version;
const attempts=await Promise.all(["A","B"].map(side=>action(concurrent.id,"point",{side,delta:1,expectedVersion:version},[200,409])));assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
const done=await newMatch();await action(done.id,"quick-score",{sets:[[11,3],[11,4]]});
for(const [name,body] of [["point",{side:"A",delta:1}],["finish-set",{}],["finish",{winnerTeamId:teams[0].id}],["quick-score",{sets:[[3,11],[4,11]]}],["special-result",{winnerTeamId:teams[1].id,reason:"walkover"}]])await action(done.id,name,body,[409]);
await api(`/api/matches/${done.id}`,undefined,{method:"DELETE",expected:[409]});

// Use a fresh elimination division so generated downstream matches have no scores.
const bracketDivision=(await api(`/api/tournaments/${tid}/divisions`,{name:"Bracket regression",eventType:"singles",format:"single_elimination",bestOf:3})).data;
for(let i=0;i<4;i++)await api(`/api/divisions/${bracketDivision.id}/teams`,{name:`Bracket Team ${i}`,playerIds:[players[i].id],seed:i+1});
await api(`/api/divisions/${bracketDivision.id}/generate-bracket`,{});
let bracket=(await state()).matches.filter(m=>m.divisionId===bracketDivision.id);
const first=bracket.filter(m=>m.a!=="TBD"&&m.b!=="TBD");assert.equal(first.length,2);
for(const m of first)await action(m.id,"quick-score",{sets:[[11,3],[11,4]]});
bracket=(await state()).matches.filter(m=>m.divisionId===bracketDivision.id);const final=bracket.find(m=>!first.some(s=>s.id===m.id));
await point(final.id,"A",1);await action(final.id,"undo");await action(first[0].id,"undo",{},[409]);assert.equal((await current(first[0].id)).status,"done");

const ruleDivision=(await api(`/api/tournaments/${tid}/divisions`,{name:"Configured rules",eventType:"singles",format:"single_elimination",bestOf:1,pointsToWin:15,winByTwo:false})).data;
const ruleTeams=[];for(let i=0;i<2;i++)ruleTeams.push((await api(`/api/divisions/${ruleDivision.id}/teams`,{name:`Rule Team ${i}`,playerIds:[players[i].id]})).data);
const ruleMatch=(await api(`/api/divisions/${ruleDivision.id}/matches`,{teamAId:ruleTeams[0].id,teamBId:ruleTeams[1].id})).data;
await action(ruleMatch.id,"quick-score",{sets:[[11,3]]},[400]);await action(ruleMatch.id,"quick-score",{sets:[[15,14]]});
// A cancelled registration must not be restored to attendance through an old QR.
const registration=(await api(`/api/divisions/${did}/registrations`,{teamId:teams[0].id})).data;
const savedRegistration=async()=>(await api('/api/registrations')).data.find(r=>r.id===registration.id);
await api(`/api/registrations/${registration.id}/checkin`,{});
const checkedAt=(await savedRegistration()).checked_in_at;
await api(`/api/registrations/${registration.id}/checkin`,{});
assert.equal((await savedRegistration()).checked_in_at,checkedAt);
await api(`/api/registrations/${registration.id}/undo-checkin`,{});
await api(`/api/registrations/${registration.id}`,{status:'cancelled'},{method:'PATCH'});
for(const path of [`/api/registrations/${registration.id}/checkin`,`/api/checkin/${registration.checkin_token}/confirm`]){
  const r=await api(path,{},{expected:[409]});assert.equal(r.data.error,'REGISTRATION_CANCELLED');
}
assert.equal((await savedRegistration()).checked_in_at,null);
console.log("OPERATIONS_API_OK",JSON.stringify({scoreValidation:true,staleVersions:true,assignments:true,currentRefereeScope:true,undoSnapshots:true,historyDurable:true,concurrency:true,downstreamLocked:true,configuredRules:true,cancelledCheckin:true,idempotentCheckin:true}));
