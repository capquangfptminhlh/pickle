import assert from "node:assert/strict";

const target=new URL(process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787");
if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname))throw new Error("Bracket write regressions require a local server");
const login=await fetch(new URL("/api/auth/login",target),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.ADMIN_EMAIL||"admin@pickle.test",password:process.env.ADMIN_PASSWORD||"cloudflare-test-password-123"})});
assert.equal(login.status,200);const auth=await login.json();
const headers=auth.token?{Authorization:"Bearer "+auth.token}:{Cookie:login.headers.get("set-cookie").split(";")[0]};
async function api(path,body,expected=[200,201]){
  const response=await fetch(new URL(path,target),{method:body===undefined?"GET":"POST",headers:{...headers,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${path}: ${response.status} ${JSON.stringify(data)}`);return {status:response.status,data};
}
const stamp=Date.now();
const tournament=(await api("/api/tournaments",{name:"Local bracket safety "+stamp,eventType:"singles",format:"pool_to_knockout",stageRulesEnabled:false})).data;
const tid=tournament.tournament?.id||tournament.id;
const pool=(await api("/api/admin/state")).data.divisions.find(d=>d.tournamentId===tid);
const playerIds=[];
for(let i=0;i<4;i++)playerIds.push((await api("/api/players",{fullName:`Local bracket ${stamp} player ${i}`,rating:3})).data.id);
const poolTeams=[];
for(let i=0;i<3;i++)poolTeams.push((await api(`/api/divisions/${pool.id}/teams`,{name:`Local pool ${i}`,group:"A",playerIds:[playerIds[i]]})).data.id);
const addMatch=async(a,b)=>(await api(`/api/divisions/${pool.id}/matches`,{teamAId:a,teamBId:b,stage:"Bảng A"})).data;
const finish=async(match)=>api(`/api/matches/${match.id}/quick-score`,{sets:[[11,3],[11,4]],expectedVersion:1});
for(let i=0;i<3;i++)await finish(await addMatch(poolTeams[0],poolTeams[1]));
let blocked=await api(`/api/divisions/${pool.id}/generate-bracket`,{},[409]);
assert.equal(blocked.data.error,"GROUP_STAGE_NOT_COMPLETE","duplicate results cannot replace missing pairings");
await finish(await addMatch(poolTeams[0],poolTeams[2]));
await finish(await addMatch(poolTeams[1],poolTeams[2]));
const pending=await addMatch(poolTeams[1],poolTeams[0]);
blocked=await api(`/api/divisions/${pool.id}/generate-bracket`,{},[409]);assert.equal(blocked.data.error,"GROUP_STAGE_NOT_COMPLETE");
await finish(pending);
assert.equal((await api(`/api/divisions/${pool.id}/generate-bracket`,{})).data.qualifiers,2);

const division=(await api(`/api/tournaments/${tid}/divisions`,{name:"Local concurrent bracket",eventType:"singles",format:"single_elimination"})).data;
for(let i=0;i<4;i++)await api(`/api/divisions/${division.id}/teams`,{name:`Local seed ${i}`,seed:i+1,playerIds:[playerIds[i]]});
const attempts=await Promise.all([api(`/api/divisions/${division.id}/generate-bracket`,{},[200,409]),api(`/api/divisions/${division.id}/generate-bracket`,{},[200,409])]);
assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
const state=(await api("/api/admin/state")).data;
const matches=state.matches.filter(m=>m.divisionId===division.id&&m.bracketSlot);
assert.equal(matches.length,3);assert.equal(new Set(matches.map(m=>m.bracketSlot)).size,3);
console.log("BRACKET_HTTP_OK",JSON.stringify({pairCoverage:true,pendingDuplicatesBlocked:true,concurrentGeneration:true}));
