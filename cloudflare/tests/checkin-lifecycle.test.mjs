import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function fixture(){
 const f=await scoringFixture();
 f.db.exec("INSERT INTO registrations(id,division_id,team_id,status,checkin_token) VALUES('reg','division','a','approved','qr-token')");
 const call=async(path,actor=null)=>{
  const response=await worker.fetch(new Request('https://test.invalid'+path,{method:'POST',headers:{'Content-Type':'application/json',...(actor?{Authorization:'Bearer '+f.tokens[actor]}:{})},body:'{}'}),f.env);
  return {status:response.status,data:await response.json()};
 };
 return {...f,call,registration:()=>({...f.db.prepare("SELECT * FROM registrations WHERE id='reg'").get()})};
}

for(const [name,path,actor] of [['public QR','/api/checkin/qr-token/confirm',null],['operator','/api/registrations/reg/checkin','admin']]){
 test(`${name} refuses cancelled registration without changing attendance`,async()=>{
  const f=await fixture();try{
   f.db.exec("UPDATE registrations SET status='cancelled' WHERE id='reg'");const before=f.registration();
   const r=await f.call(path,actor);assert.equal(r.status,409);assert.equal(r.data.error,'REGISTRATION_CANCELLED');assert.deepEqual(f.registration(),before);
  }finally{f.db.close()}
 });
 test(`${name} blocks cancellation occurring before attendance write`,async()=>{
  const f=await fixture();try{
   const prepare=f.env.DB.prepare.bind(f.env.DB);
   f.env.DB.prepare=sql=>{
    if(/^UPDATE registrations SET checked_in_(at|by)=/.test(sql))f.db.exec("UPDATE registrations SET status='cancelled' WHERE id='reg'");
    return prepare(sql);
   };
   const r=await f.call(path,actor);assert.equal(r.status,409);assert.equal(f.registration().checked_in_at,null);
  }finally{f.db.close()}
 });
}

test('repeated operator check-in preserves the original attendance timestamp and actor',async()=>{
 const f=await fixture();try{
  f.db.exec("UPDATE registrations SET checked_in_at='2026-10-01T12:00:00Z',checked_in_by='organizer' WHERE id='reg'");
  const r=await f.call('/api/registrations/reg/checkin','admin');assert.equal(r.status,200);
  assert.equal(f.registration().checked_in_at,'2026-10-01T12:00:00Z');assert.equal(f.registration().checked_in_by,'organizer');
 }finally{f.db.close()}
});

for(const [first,second] of [['qr','qr'],['qr','operator'],['operator','qr']]){
 test(`${first} then ${second} preserves the first check-in timestamp and actor`,async()=>{
  const f=await fixture();try{
   const confirm=kind=>f.call(kind==='qr'?'/api/checkin/qr-token/confirm':'/api/registrations/reg/checkin',kind==='qr'?null:'admin');
   assert.equal((await confirm(first)).status,200);const before=f.registration();
   assert.ok(before.checked_in_at);assert.equal(before.checked_in_by,first==='qr'?null:'admin');
   assert.equal((await confirm(second)).status,200);assert.deepEqual(f.registration(),before);
  }finally{f.db.close()}
 });
}
