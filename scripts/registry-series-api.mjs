import assert from "node:assert/strict";

const target=new URL(process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787");
if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname))throw new Error("Serie write regressions require a local server");
const login=await fetch(new URL("/api/auth/login",target),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.ADMIN_EMAIL||"admin@pickle.test",password:process.env.ADMIN_PASSWORD||"cloudflare-test-password-123"})});
assert.equal(login.status,200);const credentials=await login.json();
const auth=credentials.token?{Authorization:"Bearer "+credentials.token}:{Cookie:login.headers.get("set-cookie").split(";")[0]};
async function api(path,body,{method=body===undefined?"GET":"POST",expected=[200,201],actor=auth}={}){
  const response=await fetch(new URL(path,target),{method,headers:{...actor,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);return {data,status:response.status};
}
const state=async()=>(await api("/api/admin/state")).data;
const stamp=Date.now();
const tour=(await api("/api/tournaments",{name:`Serie regression ${stamp}`,eventType:"singles",format:"pool_to_knockout"})).data;
const tid=tour.tournament?.id||tour.id;
const configuredCourts=(await state()).courts.filter(c=>c.tournamentId===tid&&c.active!==false);
for(let i=configuredCourts.length;i<4;i++)await api(`/api/tournaments/${tid}/courts`,{name:`Serie Court ${i+1}`,sortOrder:i+1});
const division=(await api(`/api/tournaments/${tid}/divisions`,{name:"Four pools, two series",eventType:"singles",format:"pool_to_knockout",bestOf:1,pointsToWin:11,advanceCount:2,thirdPlaceMatch:true,seriesBEnabled:true,seriesBThirdPlaceMatch:true})).data;
const did=division.id;
let saved=(await state()).divisions.find(d=>d.id===did);
assert.equal(saved.seriesBEnabled,true);assert.equal(saved.seriesBThirdPlaceMatch,true);assert.equal(saved.thirdPlaceMatch,true);
await api(`/api/tournaments/${tid}/divisions`,{name:"Invalid overlapping Serie B",eventType:"singles",advanceCount:3,seriesBEnabled:true},{expected:[400]});
await api(`/api/tournaments/${tid}/divisions`,{name:"Invalid non-pool Serie B",eventType:"singles",format:"single_elimination",seriesBEnabled:true},{expected:[400]});
const groups=new Map(),allPlayers=[];
for(const group of ["A","B","C","D"]){
  const ids=[];
  for(let i=0;i<3;i++){
    const player=(await api("/api/players",{fullName:`Serie ${stamp} ${group}${i+1}`,rating:3})).data;allPlayers.push(player.id);
    ids.push((await api(`/api/divisions/${did}/teams`,{name:`${group} rank ${i+1}`,group,seed:i+1,playerIds:[player.id]})).data.id);
  }
  groups.set(group,ids);
}
const score=async(id,sets=[[11,3]])=>{
  const match=(await state()).matches.find(m=>m.id===id);
  return api(`/api/matches/${id}/quick-score`,{sets,expectedVersion:match.version});
};
const groupMatches=[];
for(const [group,ids] of groups)for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){
  const m=(await api(`/api/divisions/${did}/matches`,{teamAId:ids[i],teamBId:ids[j],stage:`Bảng ${group}`})).data;groupMatches.push(m.id);
}
await api(`/api/divisions/${did}/generate-bracket`,{},{expected:[409]});
assert.equal((await state()).matches.filter(m=>m.divisionId===did&&m.bracketSlot).length,0,"Incomplete pools cannot create either branch");
for(const id of groupMatches)await score(id);
const attempts=await Promise.all([api(`/api/divisions/${did}/generate-bracket`,{},{expected:[200,409]}),api(`/api/divisions/${did}/generate-bracket`,{},{expected:[200,409]})]);
assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
const generated=attempts.find(r=>r.status===200).data;
assert.equal(generated.seriesA.qualifiers,8);assert.equal(generated.seriesB.qualifiers,4);assert.equal(generated.created,12);
let bracket=(await state()).matches.filter(m=>m.divisionId===did&&m.bracketSlot);
assert.equal(bracket.length,12);assert.equal(new Set(bracket.map(m=>m.bracketSlot)).size,12);
const scheduled=bracket.filter(m=>m.courtId&&m.scheduledAt);
assert.equal(new Set(scheduled.map(m=>m.courtId+'@'+m.scheduledAt)).size,scheduled.length,'Both branches share one court schedule allocator');
for(const courtId of new Set(scheduled.map(m=>m.courtId))){
  const times=scheduled.filter(m=>m.courtId===courtId).map(m=>new Date(m.scheduledAt).getTime()).sort((a,b)=>a-b);
  for(let i=1;i<times.length;i++)assert.ok(times[i]-times[i-1]>=30*60000,'Court slots cannot overlap between series');
}
const rank3=new Set([...groups.values()].map(ids=>ids[2]));
for(const series of ["A","B"]){
  const rows=bracket.filter(m=>m.bracketSeries===series);
  assert.equal(rows.length,series==="A"?8:4);
  const actual=new Set(rows.flatMap(m=>[m.a,m.b]).filter(id=>id&&id!=="TBD"));
  if(series==="B")assert.deepEqual(actual,rank3,"Only third place from each pool enters Serie B");
  else for(const id of actual)assert.ok(!rank3.has(id),"Serie A and B qualifiers cannot overlap");
}
await api(`/api/divisions/${did}/full`,{seriesBEnabled:false},{method:"PATCH",expected:[409]});
// Complete both branches using actual score entry, then verify the semifinal
// losers enter their own bronze match and never the other series.
for(const series of ["B","A"]){
  const prefix=series==="B"?"B-SE-":"SE-";
  for(let round=1;round<=3;round++){
    const ready=(await state()).matches.filter(m=>m.divisionId===did&&m.bracketSeries===series&&m.bracketSlot?.startsWith(`${prefix}R${round}-`)&&m.a!=="TBD"&&m.b!=="TBD");
    for(const m of ready)await score(m.id);
  }
  const rows=(await state()).matches.filter(m=>m.divisionId===did&&m.bracketSeries===series);
  const semis=rows.filter(m=>/^Bán kết/.test(m.stage));
  const bronze=rows.find(m=>m.bracketSlot===`${prefix}3RD-M1`);
  assert.ok(bronze,"Separate bronze match exists");
  const losers=new Set(semis.map(m=>m.winner===m.a?m.b:m.a));
  assert.deepEqual(new Set([bronze.a,bronze.b]),losers);
  await score(bronze.id);
  const final=rows.find(m=>m.stage==="Chung kết");assert.ok(final?.winner,"Series has its own champion");
}
bracket=(await state()).matches.filter(m=>m.divisionId===did&&m.bracketSlot);
assert.ok(bracket.every(m=>m.status==="done"&&m.winner));
const disabled=(await api(`/api/tournaments/${tid}/divisions`,{name:"Serie B off",eventType:"singles",format:"single_elimination",bestOf:1})).data;
for(let i=0;i<4;i++)await api(`/api/divisions/${disabled.id}/teams`,{name:`Disabled ${i}`,seed:i+1,playerIds:[allPlayers[i]]});
const off=(await api(`/api/divisions/${disabled.id}/generate-bracket`,{})).data;
assert.equal(off.created,3);assert.equal(off.seriesB,null);
assert.equal((await state()).matches.filter(m=>m.divisionId===disabled.id&&m.bracketSeries==="B").length,0);
console.log("SERIES_HTTP_OK",JSON.stringify({pools:4,serieAQualifiers:8,serieBQualifiers:4,matches:12,independentChampionsAndBronze:true,concurrentGeneration:true,incompletePoolAtomicity:true,disabledParity:true}));
