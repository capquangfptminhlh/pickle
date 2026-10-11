import assert from 'node:assert/strict';
const target=new URL(process.env.REGISTRY_TEST_URL||'http://127.0.0.1:8787');
if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname))throw new Error('Court safety write tests require a local server');
const login=await fetch(new URL('/api/auth/login',target),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ADMIN_EMAIL||'admin@pickle.test',password:process.env.ADMIN_PASSWORD||'cloudflare-test-password-123'})});
assert.equal(login.status,200);const auth=await login.json();
const headers=auth.token?{Authorization:'Bearer '+auth.token}:{Cookie:login.headers.get('set-cookie').split(';')[0]};
async function api(path,body,expected=[200,201],method=body===undefined?'GET':'POST'){
  const response=await fetch(new URL(path,target),{method,headers:{...headers,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${path}: ${response.status} ${JSON.stringify(data)}`);return {status:response.status,data};
}
const stamp=Date.now(),tour=(await api('/api/tournaments',{name:'Local court safety '+stamp})).data;
const tid=tour.tournament?.id||tour.id;
const divisions=[];
for(let i=0;i<2;i++)divisions.push((await api(`/api/tournaments/${tid}/divisions`,{name:'Local court division '+i,eventType:'singles',format:'round_robin',bestOf:1,pointsToWin:11})).data.id);
const court=(await api(`/api/tournaments/${tid}/courts`,{name:'Local shared court'})).data;
const matches=[],playersByDivision=[];
for(const [index,id] of divisions.entries()){
  const teams=[],playerIds=[];
  for(let n=0;n<2;n++){
    const player=(await api('/api/players',{fullName:`Local court ${stamp} ${index} ${n}`})).data;
    playerIds.push(player.id);
    teams.push((await api(`/api/divisions/${id}/teams`,{name:`Local court ${index} ${n}`,playerIds:[player.id]})).data.id);
  }
  playersByDivision.push(playerIds);
  assert.equal((await api(`/api/divisions/${id}/auto-seed-groups`,{groupCount:2.5},[400])).data.error,'INVALID_DRAW_OPTIONS');
  matches.push((await api(`/api/divisions/${id}/matches`,{teamAId:teams[0],teamBId:teams[1],courtId:court.id,stage:'Bảng A'})).data);
  await api(`/api/divisions/${id}/auto-schedule-courts`,{});
}
const state=async()=>(await api('/api/admin/state')).data;
let current=await state();
const scheduled=matches.map(m=>current.matches.find(x=>x.id===m.id));
assert.notEqual(scheduled[0].scheduledAt,scheduled[1].scheduledAt,'different divisions must not double-book a court');
assert.equal((await api(`/api/divisions/${divisions[0]}/auto-seed-groups`,{groupCount:1},[409])).data.error,'GROUP_DRAW_RESET_REQUIRED');
const attempts=await Promise.all(scheduled.map(m=>api(`/api/matches/${m.id}/point`,{side:'A',delta:1,expectedVersion:m.version},[200,409])));
assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
assert.equal(attempts.find(r=>r.status===409).data.error,'COURT_BUSY');
const winningIndex=attempts.findIndex(r=>r.status===200),first=attempts[winningIndex].data,second=scheduled[1-winningIndex];
assert.equal((await api(`/api/matches/${first.id}/timeout`,{side:'A',kind:'standard',expectedVersion:first.version})).data.timeoutClock.side,'A');
current=await state();let active=current.matches.find(m=>m.id===first.id);
const deadline=active.timeoutClock.endsAt;
assert.equal(Date.parse(deadline)-Date.parse(active.timeoutClock.startedAt),60000);
assert.equal((await state()).matches.find(m=>m.id===first.id).timeoutClock.endsAt,deadline,'reload retains deadline');
assert.equal((await api(`/api/matches/${first.id}/undo`,{expectedVersion:active.version})).data.timeoutClock,null);
active=(await state()).matches.find(m=>m.id===first.id);
await api(`/api/matches/${first.id}/quick-score`,{sets:[[11,3]],expectedVersion:active.version});
const next=(await state()).matches.find(m=>m.id===second.id);
assert.equal((await api(`/api/matches/${next.id}/point`,{side:'B',delta:1,expectedVersion:next.version})).status,200,'completion frees actual court occupancy');
const warmDivision=(await api(`/api/tournaments/${tid}/divisions`,{name:'Warmup roster safety',eventType:'doubles'})).data.id;
const warmCourt=(await api(`/api/tournaments/${tid}/courts`,{name:'Local warmup court'})).data.id;
const warmTeams=[],warmPlayers=[];
for(let i=0;i<2;i++){
  const roster=[];
  for(let n=0;n<2;n++)roster.push((await api('/api/players',{fullName:`Warmup ${stamp} ${i} ${n}`})).data.id);
  warmPlayers.push(roster);
  warmTeams.push((await api(`/api/divisions/${warmDivision}/teams`,{name:'Warmup '+i,playerIds:roster})).data.id);
}
const warmMatch=(await api(`/api/divisions/${warmDivision}/matches`,{teamAId:warmTeams[0],teamBId:warmTeams[1],courtId:warmCourt})).data.id;
await api(`/api/matches/${warmMatch}/court-state`,{courtState:'warming_up'},[200],'PATCH');
const rosterAttempt=await api(`/api/teams/${warmTeams[0]}`,{playerIds:[warmPlayers[0][0],playersByDivision[1-winningIndex][0]]},[409],'PATCH');
assert.equal(rosterAttempt.data.error,'TEAM_ROSTER_LOCKED','warmup lineup cannot import a player already live elsewhere');
console.log('COURT_SAFETY_HTTP_OK',JSON.stringify({crossDivisionScheduling:true,atomicOccupancy:true,timeoutClock:true,undo:true,warmupRosterLock:true}));
