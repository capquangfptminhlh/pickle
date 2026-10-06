import assert from "node:assert/strict";

const base=process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8787";
if(!["127.0.0.1","localhost","[::1]"].includes(new URL(base).hostname))throw new Error("Account write tests require a local test server");
async function api(path,body,{actor={},method=body===undefined?"GET":"POST",expected=[200,201]}={}){
  const response=await fetch(base+path,{method,headers:{...actor,...(body===undefined?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await response.json();assert.ok(expected.includes(response.status),`${method} ${path}: ${response.status} ${JSON.stringify(data)}`);return {data,response};
}
async function login(email,password){
  const {data,response}=await api("/api/auth/login",{email,password});
  return data.token?{Authorization:"Bearer "+data.token}:{Cookie:response.headers.get("set-cookie").split(";")[0]};
}
const admin=await login(process.env.ADMIN_EMAIL||"admin@pickle.test",process.env.ADMIN_PASSWORD||"cloudflare-test-password-123");
const currentAdmin=(await api("/api/auth/me",undefined,{actor:admin})).data.user;
for(const active of [false,0,null,""]){
  const denied=await api(`/api/users/${currentAdmin.id||currentAdmin.sub}`,{active},{actor:admin,method:"PATCH",expected:[400]});
  assert.equal(denied.data.error,"CANNOT_DISABLE_SELF");
  await api("/api/auth/me",undefined,{actor:admin});
}
const stamp=Date.now(),password="account-regression-password-123";
async function tournament(name){const {data}=await api("/api/tournaments",{name:name+stamp,venue:"Local account regression"},{actor:admin});return data.tournament?.id||data.id}
const own=await tournament("Account Own "),other=await tournament("Account Other ");
const email=`account-org-${stamp}@test.vn`;
await api("/api/users",{email,name:"Account Organizer",password,role:"organizer",tournamentId:own},{actor:admin});
const organizer=await login(email,password);
const foreign=(await api("/api/users/referees",{email:`account-foreign-${stamp}@test.vn`,name:"Foreign Referee",password,tournamentId:other},{actor:admin})).data;
const global=(await api("/api/users/referees",{email:`account-global-${stamp}@test.vn`,name:"Global Referee",password},{actor:admin})).data;
const localEmail=`account-local-${stamp}@test.vn`;
const local=(await api("/api/users/referees",{email:localEmail,name:"Trọng tài Nguyễn",password,tournamentId:own},{actor:organizer})).data;
const oldSession=await login(localEmail,password);
const list=(await api("/api/users/referees",undefined,{actor:organizer})).data;
assert.ok(list.some(x=>x.id===local.id&&x.display_name==="Trọng tài Nguyễn"&&x.tournament_id_scope===own&&x.tournament_name));
assert.ok(!list.some(x=>[foreign.id,global.id].includes(x.id)));
for(const path of [`/api/users/referees/${foreign.id}`,`/api/users/${foreign.id}`])await api(path,{name:"Forbidden edit",tournamentId:own},{actor:organizer,method:"PATCH",expected:[403]});
await api(`/api/users/referees/${local.id}`,{tournamentId:null},{actor:organizer,method:"PATCH",expected:[400,403]});
await api(`/api/users/referees/${local.id}`,{email:"bad email"},{actor:organizer,method:"PATCH",expected:[400]});
await api("/api/users/referees",{email:localEmail,name:"Duplicate",password,tournamentId:own},{actor:organizer,expected:[409]});
const newEmail=`account-reset-${stamp}@test.vn`,newPassword="account-reset-password-456";
const updated=(await api(`/api/users/referees/${local.id}`,{email:newEmail,name:"Tên mới",password:newPassword},{actor:organizer,method:"PATCH"})).data;
assert.equal(updated.email,newEmail);assert.equal(updated.tournament_id_scope,own);
await api("/api/auth/me",undefined,{actor:oldSession,expected:[401]});
const newSession=await login(newEmail,newPassword);
await api("/api/auth/me",undefined,{actor:newSession});
await api("/api/users/referees",undefined,{actor:newSession,expected:[403]});
await api(`/api/users/referees/${local.id}`,{active:false},{actor:organizer,method:"PATCH"});
await api("/api/auth/me",undefined,{actor:newSession,expected:[401]});
const saved=(await api("/api/users",undefined,{actor:admin})).data.find(x=>x.id===local.id);
assert.equal(saved.display_name,"Tên mới");assert.equal(saved.tournament_id_scope,own);assert.equal(saved.active,false);
assert.equal(saved.password_hash,undefined);
const cleared=(await api(`/api/users/referees/${foreign.id}`,{tournamentId:null},{actor:admin,method:"PATCH"})).data;
assert.equal(cleared.tournament_id_scope,null);
const preserved=(await api(`/api/users/referees/${foreign.id}`,{name:"Global after update"},{actor:admin,method:"PATCH"})).data;
assert.equal(preserved.tournament_id_scope,null);
await api(`/api/users/${foreign.id}`,{tournamentId:other},{actor:admin,method:"PATCH"});
const genericClear=(await api(`/api/users/${foreign.id}`,{tournamentId:null},{actor:admin,method:"PATCH"})).data;
assert.equal(genericClear.tournament_id_scope,null);
console.log("ACCOUNT_API_OK",JSON.stringify({names:true,scopePreserved:true,foreignTargetsDenied:true,emailSaved:true,passwordReset:true,disabledSessionRejected:true}));
