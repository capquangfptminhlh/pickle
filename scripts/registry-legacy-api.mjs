import assert from "node:assert/strict";
const base=new URL(process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787");
if(!["127.0.0.1","localhost","[::1]"].includes(base.hostname))throw new Error("Legacy write regressions require a local server");
const login=await fetch(new URL("/api/auth/login",base),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:process.env.ADMIN_EMAIL||"admin@pickle.test",password:process.env.ADMIN_PASSWORD||"cloudflare-test-password-123"})});
assert.equal(login.status,200);const auth=await login.json();
const headers=auth.token?{Authorization:"Bearer "+auth.token}:{Cookie:login.headers.get("set-cookie").split(";")[0]};
async function api(path,body){
  const r=await fetch(new URL(path,base),{method:body===undefined?"GET":"POST",headers:{...headers,"Content-Type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();assert.equal(r.status,200,JSON.stringify(data));return data;
}
const stamp=Date.now(),id=type=>`legacy-http-${type}-${stamp}`;
const backup={
  players:[{id:id("a"),full_name:"Local legacy A",rating:3},{id:id("b"),full_name:"Local legacy B",rating:3}],
  tournaments:[{id:id("tour"),name:"Local legacy regression",startAt:"2026-10-10T08:00:00+07:00"}],
  divisions:[{id:id("division"),tournamentId:id("tour"),eventType:"singles"}],
  teams:[{id:id("team-a"),divisionId:id("division"),name:"Local A"},{id:id("team-b"),divisionId:id("division"),name:"Local B"}],
  teamPlayers:{[id("team-a")]:[id("a")],[id("team-b")]:[id("b")]},
  matches:[{id:id("match"),divisionId:id("division"),a:id("team-a"),b:id("team-b"),time:"08:30",status:"wait",version:1}]
};
const path="/api/admin/import-legacy-state",first=await api(path,{state:backup});
assert.equal(first.counts.players,2);assert.equal(first.counts.teamPlayers,2);assert.equal(first.counts.matches,1);
await api(`/api/matches/${id("match")}/quick-score`,{sets:[[11,5],[11,6]],expectedVersion:1});
const matchState=async()=>(await api("/api/admin/state")).matches.find(m=>m.id===id("match"));
const before=await matchState();assert.equal(before.status,"done");
const repeat=await api(path,{state:backup});
assert.equal(Object.values(repeat.counts).reduce((sum,n)=>sum+n,0),0);assert.equal(repeat.skipped.teamPlayers,2);
assert.deepEqual(await matchState(),before);
console.log("LEGACY_HTTP_OK",JSON.stringify({actualD1Counts:true,retry:true,newerScoresPreserved:true}));
