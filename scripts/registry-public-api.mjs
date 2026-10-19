import assert from "node:assert/strict";
const base=process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787",target=new URL(base);
if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname))throw new Error("Public/privacy write tests require a local test server");
let auth={};
async function api(path,body,method=body===undefined?"GET":"POST",actor=auth){
  const r=await fetch(new URL(path,target),{method,headers:{...actor,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json();assert.ok(r.ok,`${method} ${path}: ${r.status} ${JSON.stringify(data)}`);return {r,data};
}
async function login(email,password){const {r,data}=await api("/api/auth/login",{email,password},"POST",{});return data.token?{Authorization:"Bearer "+data.token}:{Cookie:r.headers.get("set-cookie").split(";")[0]}}
auth=await login(process.env.ADMIN_EMAIL||"admin@pickle.test",process.env.ADMIN_PASSWORD||"cloudflare-test-password-123");
const stamp=Date.now(),password="privacy-synthetic-local-password-123";
const p=(await api("/api/players",{fullName:"Public profile regression "+stamp,rating:3})).data;
const opponent=(await api("/api/players",{fullName:"Public opponent "+stamp,rating:3})).data;
const tours=[];
for(const name of ["Visible","Private"]){
  const t=(await api("/api/tournaments",{name:name+" privacy "+stamp,eventType:"singles",stageRulesEnabled:false,publicVisible:name==="Visible"})).data;
  const id=t.tournament?.id||t.id;
  await api(`/api/tournaments/${id}`,{publicVisible:name==="Visible"},"PATCH");
  const state=(await api("/api/admin/state")).data,did=state.divisions.find(d=>d.tournamentId===id).id,teams=[];
  for(const player of [p,opponent])teams.push((await api(`/api/divisions/${did}/teams`,{name:name+" "+player.full_name,playerIds:[player.id]})).data);
  const m=(await api(`/api/divisions/${did}/matches`,{teamAId:teams[0].id,teamBId:teams[1].id})).data;
  await api(`/api/matches/${m.id}/quick-score`,{sets:[[11,5],[11,6]]});
  tours.push({id,did,teams,m});
}
const profile=(await api(`/api/public/players/${p.id}`,undefined,"GET",{})).data;
assert.equal(profile.stats.matches,1);assert.equal(profile.stats.pointsFor,22);assert.equal(profile.stats.pointsAgainst,11);
assert.equal(profile.matches[0].tournamentId,tours[0].id);assert.equal(profile.matches[0].won,true);assert.ok(profile.matches[0].teamAName);
assert.ok(profile.teams.every(t=>t.tournament_id===tours[0].id));
await api(`/api/divisions/${tours[0].did}/full`,{active:false},"PATCH");
const hidden=(await api(`/api/public/players/${p.id}`,undefined,"GET",{})).data;assert.equal(hidden.matches.length,0);assert.equal(hidden.teams.length,0);
await api(`/api/divisions/${tours[0].did}/full`,{active:true},"PATCH");
const privateSponsor=(await api("/api/sponsors",{name:"Private sponsor "+stamp,tournamentId:tours[1].id})).data;
assert.ok(!(await api("/api/public/sponsors",undefined,"GET",{})).data.some(s=>s.id===privateSponsor.id));
const email=`privacy-org-${stamp}@test.invalid`,organizer=(await api("/api/users",{name:"Privacy organizer",email,password,role:"organizer",tournamentId:tours[0].id})).data;
const ownAuth=await login(email,password);
async function uploadReceipt(){
  const form=new FormData();form.append("receipt",new Blob(["%PDF-1.4\nSynthetic local receipt\n%%EOF"],{type:"application/pdf"}),"receipt.pdf");
  const upload=await fetch(new URL("/api/uploads/receipt",target),{method:"POST",headers:ownAuth,body:form});assert.equal(upload.status,201);const receipt=await upload.json();
  // Wrangler's configured host may appear in generated URLs; keep every request local.
  return new URL(new URL(receipt.url,target).pathname,target);
}
const receiptUrl=await uploadReceipt();
assert.equal((await fetch(receiptUrl)).status,401);assert.equal((await fetch(receiptUrl,{headers:ownAuth})).status,200);
const reg=(await api(`/api/divisions/${tours[1].did}/registrations`,{teamId:tours[1].teams[0].id,amount:1000})).data;
await api(`/api/registrations/${reg.id}/payment`,{receiptUrl:receiptUrl.href});
assert.equal((await fetch(receiptUrl,{headers:ownAuth})).status,403,"uploader must lose access when receipt is attached outside current scope");
for(const variant of ["query","encoded"]){
  const isolated=await uploadReceipt(),alias=variant==="query"?isolated.href+"?preview=1":isolated.href.replace(/\.pdf$/, "%2Epdf");
  await api(`/api/registrations/${reg.id}/payment`,{receiptUrl:alias});
  assert.equal((await fetch(isolated,{headers:ownAuth})).status,403);
}
const adminRead=await fetch(receiptUrl,{headers:auth});assert.equal(adminRead.status,200);assert.match(adminRead.headers.get("Cache-Control"),/no-store/);
assert.ok(!(await fetch(new URL("/api/public/state",target))).headers.get("Cache-Control")?.includes("max-age"));
console.log("PUBLIC_PRIVACY_API_OK",JSON.stringify({profileScores:true,visibility:true,privateSponsors:true,receiptAuthentication:true,receiptScope:true,noStore:true,organizer:organizer.id}));
