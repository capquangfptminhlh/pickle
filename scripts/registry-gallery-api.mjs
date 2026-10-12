import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

const target=new URL(process.env.REGISTRY_TEST_URL||"http://127.0.0.1:8080");
if(!["127.0.0.1","localhost","[::1]"].includes(target.hostname))throw new Error("Gallery write regressions require a local server");
async function login(email,password){
  const response=await fetch(new URL("/api/auth/login",target),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
  const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));
  return data.token?{Authorization:`Bearer ${data.token}`}:{Cookie:response.headers.get("set-cookie").split(";")[0]};
}
const admin=await login(process.env.ADMIN_EMAIL||"admin@pickle.test",process.env.ADMIN_PASSWORD||"cloudflare-test-password-123");
async function api(path,body,{method=body===undefined?"GET":"POST",actor=admin,status=200}={}){
  const multipart=body instanceof FormData;
  const response=await fetch(new URL(path,target),{method,headers:{...actor,...(multipart?{}:{"Content-Type":"application/json"})},body:body===undefined?undefined:multipart?body:JSON.stringify(body)});
  const data=await response.json();assert.equal(response.status,status,`${method} ${path}: ${JSON.stringify(data)}`);return data;
}
const stamp=Date.now();
const created=await api("/api/tournaments",{name:`Gallery public ${stamp}`,publicVisible:true},{status:201});
const hidden=await api("/api/tournaments",{name:`Gallery private ${stamp}`,publicVisible:false},{status:201});
const tid=created.tournament?.id||created.id,privateId=hidden.tournament?.id||hidden.id;
const base=`/api/tournaments/${tid}/photos`,privateBase=`/api/tournaments/${privateId}/photos`;
const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=","base64");
const form=(bytes=png,mime="image/png",caption=" Memories ")=>{const body=new FormData();body.set("image",new Blob([bytes],{type:mime}),"memory.png");body.set("caption",caption);return body};
assert.deepEqual(await api(base,undefined,{actor:{}}),[]);
await api(privateBase,undefined,{actor:{},status:404});
await api(`/api/tournaments/${randomUUID()}/photos`,undefined,{actor:{},status:404});
await api(base,form(),{actor:{},status:401});
const actors={};
for(const [label,role,scope] of [["owner","organizer",tid],["foreign","organizer",privateId],["referee","referee",tid]]){
  const email=`gallery-${label}-${stamp}@test.vn`,password="gallery-test-password-123";
  await api("/api/users",{email,name:`Gallery ${label}`,role,password,tournamentId:scope},{status:201});
  actors[label]=await login(email,password);
}
for(const actor of [actors.foreign,actors.referee])await api(base,form(),{actor,status:403});
await api(privateBase,undefined,{actor:actors.owner,status:404});
const photo=await api(base,form(),{actor:actors.owner,status:201});
assert.equal(photo.caption,"Memories");assert.equal(photo.version,1);assert.equal(photo.tournamentId,tid);
assert.deepEqual((await api(base,undefined,{actor:{}})).map(p=>p.id),[photo.id]);
const image=await fetch(new URL(photo.url,target));assert.equal(image.status,200);assert.match(image.headers.get("cache-control"),/no-store/);assert.equal(image.headers.get("x-content-type-options"),"nosniff");assert.deepEqual(Buffer.from(await image.arrayBuffer()),png);
const secret=await api(privateBase,form(),{status:201});
assert.equal((await fetch(new URL(secret.url,target))).status,404);
assert.equal((await fetch(new URL(secret.url,target),{headers:admin})).status,200);
for(const payload of [form(png,"image/svg+xml"),form(Buffer.from("not an image")),form(png,"image/png","x".repeat(301))])await api(base,payload,{status:400});
await api(base,form(Buffer.alloc(6*1024*1024+1)),{status:413});
for(const expectedVersion of [null,"1",0])await api(`${base}/${photo.id}`,{caption:"bad",expectedVersion},{method:"PATCH",status:409});
const edited=await api(`${base}/${photo.id}`,{caption:"<b>escaped</b>",expectedVersion:1},{method:"PATCH",actor:actors.owner});assert.equal(edited.version,2);assert.equal(edited.caption,"<b>escaped</b>");
await api(`${base}/${photo.id}`,{expectedVersion:1},{method:"DELETE",status:409});
await api(`${base}/${photo.id}`,{expectedVersion:2},{method:"DELETE",actor:actors.foreign,status:403});
const concurrent=await Promise.all(["first","second"].map(caption=>fetch(new URL(`${base}/${photo.id}`,target),{method:"PATCH",headers:{...actors.owner,"Content-Type":"application/json"},body:JSON.stringify({caption,expectedVersion:2})})));
assert.deepEqual(concurrent.map(response=>response.status).sort(),[200,409]);
await api(`${base}/${photo.id}`,{expectedVersion:3},{method:"DELETE",actor:actors.owner});
assert.deepEqual(await api(base,undefined,{actor:{}}),[]);
assert.equal((await fetch(new URL(photo.url,target))).status,404);
console.log("Gallery API regression passed: upload, visibility, roles, validation, versions and removal");

