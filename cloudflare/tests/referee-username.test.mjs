import test from 'node:test';
import assert from 'node:assert/strict';
import {accountFixture} from './helpers/accounts-fixture.mjs';
const password='RefereeUsernameTest123!';
const body={name:'Trọng tài Bình',username:'tt_binh',password,tournamentId:'own'};

test('BTC creates and logs in a referee without any email',async()=>{
 const f=await accountFixture();try{
  const created=await f.api('/api/users/referees',{...body,username:' TT_Binh-01 '},'POST','organizer');
  assert.equal(created.status,201);assert.equal(created.data.username,'tt_binh-01');assert.equal(created.data.tournament_id_scope,'own');
  const login=await f.api('/api/auth/login',{username:'TT_BINH-01',password},'POST');
  assert.equal(login.status,200);assert.equal(login.data.user.role,'referee');
  assert.equal(login.data.user.tournamentScope,'own');
 }finally{f.db.close()}
});
test('general account routes create, edit and lock a username referee',async()=>{
 const f=await accountFixture();try{
  const created=await f.api('/api/users',{...body,role:'referee'},'POST','organizer');assert.equal(created.status,201);
  const update=await f.api('/api/users/'+created.data.id,{name:'Tên đã sửa'},'PATCH','organizer');assert.equal(update.status,200);assert.equal(update.data.username,'tt_binh');
  assert.equal((await f.api('/api/users/'+created.data.id,{active:false},'PATCH','organizer')).status,200);
  assert.equal((await f.api('/api/auth/login',{username:'tt_binh',password},'POST')).status,401);
 }finally{f.db.close()}
});
test('invalid usernames are rejected rather than accepted as arbitrary identities',async()=>{
 const f=await accountFixture();try{
  for(const username of ['a','ab','with space','tên_việt','bad@name','x'.repeat(33)]){
   const response=await f.api('/api/users/referees',{...body,username},'POST','organizer');assert.equal(response.status,400,username);assert.equal(response.data.error,'INVALID_USERNAME');
  }
 }finally{f.db.close()}
});
test('case-insensitive usernames cannot be duplicated, including concurrent creates',async t=>{
 t.mock.method(console,'error',()=>{});const f=await accountFixture();try{
  const results=await Promise.all([f.api('/api/users/referees',body,'POST'),f.api('/api/users/referees',{...body,username:'TT_BINH'},'POST')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);assert.equal(f.db.prepare("SELECT count(*) n FROM app_users WHERE email='tt_binh'").get().n,1);
 }finally{f.db.close()}
});
test('rename and password reset retain scope and invalidate old credentials',async()=>{
 const f=await accountFixture();try{
  const created=await f.api('/api/users/referees',body,'POST','organizer');assert.equal(created.status,201);
  const nextPassword='UpdatedRefereePassword123!';
  const updated=await f.api('/api/users/referees/'+created.data.id,{username:'TT_Moi',password:nextPassword},'PATCH','organizer');
  assert.equal(updated.status,200);assert.equal(updated.data.username,'tt_moi');assert.equal(updated.data.tournament_id_scope,'own');
  assert.equal((await f.api('/api/auth/login',{username:'tt_binh',password},'POST')).status,401);
  assert.equal((await f.api('/api/auth/login',{username:'tt_moi',password},'POST')).status,401);
  assert.equal((await f.api('/api/auth/login',{username:'TT_MOI',password:nextPassword},'POST')).status,200);
  const audit=f.db.prepare("SELECT after_data FROM audit_logs WHERE entity_id=? AND action='UPDATE_REFEREE'").get(created.data.id);
  assert.ok(!audit.after_data.includes(nextPassword));assert.ok(!audit.after_data.includes('password_hash'));
 }finally{f.db.close()}
});
test('username support preserves owner scope and cannot create elevated roles',async()=>{
 const f=await accountFixture();try{
  assert.equal((await f.api('/api/users/referees',{...body,tournamentId:'other'},'POST','organizer')).status,403);
  assert.equal((await f.api('/api/users',{...body,role:'super_admin'},'POST','organizer')).status,400);
  const created=await f.api('/api/users/referees',{...body,role:'super_admin'},'POST','organizer');assert.equal(created.status,201);assert.equal(created.data.role,'referee');
 }finally{f.db.close()}
});
