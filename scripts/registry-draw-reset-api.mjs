import assert from 'node:assert/strict';

const target=new URL(process.env.REGISTRY_TEST_URL||'http://127.0.0.1:8787');
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('Draw reset write tests require a local server');
const login=await fetch(new URL('/api/auth/login',target),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL||'admin@pickle.test',password:process.env.ADMIN_PASSWORD||'cloudflare-test-password-123'})});
assert.equal(login.status,200);const auth=await login.json();
const headers=auth.token?{Authorization:'Bearer '+auth.token}:{Cookie:login.headers.get('set-cookie').split(';')[0]};
async function api(path,body,expected=[200,201]){
  const response=await fetch(new URL(path,target),{method:body===undefined?'GET':'POST',headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${path}: ${response.status} ${JSON.stringify(data)}`);return {status:response.status,data};
}
const stamp=Date.now(),tournament=(await api('/api/tournaments',{name:'Local draw reset '+stamp})).data;
const tid=tournament.tournament?.id||tournament.id;
const division=(await api(`/api/tournaments/${tid}/divisions`,{name:'Local singles reset',eventType:'singles',format:'pool_to_knockout',bestOf:1,pointsToWin:11,advanceCount:1})).data;
const court=(await api(`/api/tournaments/${tid}/courts`,{name:'Local reset court'})).data;
const teams=[];
for(let i=0;i<4;i++){
  const player=(await api('/api/players',{fullName:`Local reset ${stamp} player ${i}`,rating:3})).data;
  teams.push((await api(`/api/divisions/${division.id}/teams`,{name:`Local reset team ${i}`,playerIds:[player.id]})).data.id);
}
const draw={groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:[court.id]};
assert.equal((await api(`/api/divisions/${division.id}/run-draw`,draw)).data.created,2);
let state=(await api('/api/admin/state')).data;
for(const match of state.matches.filter(m=>m.divisionId===division.id)){
  // Finishing one match can automatically call the next match on this court.
  const current=(await api('/api/admin/state')).data.matches.find(m=>m.id===match.id);
  await api(`/api/matches/${match.id}/quick-score`,{sets:[[11,4]],expectedVersion:current.version});
}
assert.equal((await api(`/api/divisions/${division.id}/generate-bracket`,{})).data.created,1);
const preview=(await api(`/api/divisions/${division.id}/reset-draw`)).data;
assert.equal(preview.summary.matchCount,3);assert.equal(preview.summary.completedMatchCount,2);assert.equal(preview.summary.setCount,2);
await api(`/api/divisions/${division.id}/reset-draw`,{confirmation:'wrong',expectedToken:preview.token},[400]);
const body={confirmation:'QUAY LAI',expectedToken:preview.token};
const results=await Promise.all([api(`/api/divisions/${division.id}/reset-draw`,body,[200,409]),api(`/api/divisions/${division.id}/reset-draw`,body,[200,409])]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
state=(await api('/api/admin/state')).data;
assert.equal(state.matches.filter(m=>m.divisionId===division.id).length,0);
assert.deepEqual(state.teams.filter(t=>t.divisionId===division.id).map(t=>t.id).sort(),teams.sort());
assert.ok(state.teams.filter(t=>t.divisionId===division.id).every(t=>!t.group));
assert.equal((await api(`/api/divisions/${division.id}/run-draw`,draw)).data.created,2);
console.log('DRAW_RESET_HTTP_OK',JSON.stringify({archivedPlayedPoolsAndBracket:true,concurrentReset:true,keptTeams:4,redrawnMatches:2}));
