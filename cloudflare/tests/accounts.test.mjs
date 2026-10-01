import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture as fixture} from "./helpers/accounts-fixture.mjs";

test("account lists expose UI names and tournament scope without private credentials",async()=>{
  const f=await fixture();try{
    for(const path of ["/api/users","/api/users/referees"]){
      const r=await f.api(path,undefined,"GET");assert.equal(r.status,200);
      const ref=r.data.find(x=>x.id==="local");
      assert.equal(ref.display_name,"Trọng tài Nguyễn");assert.equal(ref.tournament_id_scope,"own");assert.equal(ref.tournament_name,"Giải của tôi");
      assert.equal(ref.tournamentScope,"own");assert.equal(ref.password_hash,undefined);assert.equal(ref.auth_version,undefined);
    }
  }finally{f.db.close()}
});

test("organizer referee list excludes global and foreign accounts",async()=>{
  const f=await fixture();try{
    const r=await f.api("/api/users/referees",undefined,"GET","organizer");assert.equal(r.status,200);assert.deepEqual(r.data.map(x=>x.id),["local"]);
  }finally{f.db.close()}
});

test("organizer cannot edit another tournament referee by supplying a new scope",async()=>{
  const f=await fixture();try{
    for(const body of [{name:"Changed"},{tournamentId:"own",name:"Hijacked"},{tournamentId:null,active:false}]){
      const r=await f.api("/api/users/referees/foreign",body,"PATCH","organizer");assert.equal(r.status,403);
    }
    assert.equal(f.db.prepare("SELECT display_name FROM app_users WHERE id='foreign'").get().display_name,"Other Ref");
  }finally{f.db.close()}
});

test("organizer cannot remove referee tournament scope",async()=>{
  const f=await fixture();try{
    const r=await f.api("/api/users/referees/local",{tournamentId:null},"PATCH","organizer");assert.equal(r.status,400);assert.equal(r.data.error,"TOURNAMENT_REQUIRED");
    assert.equal(f.db.prepare("SELECT tournament_id_scope FROM app_users WHERE id='local'").get().tournament_id_scope,"own");
  }finally{f.db.close()}
});

test("referee edits save email and audit changes without altering role",async()=>{
  const f=await fixture();try{
    const r=await f.api("/api/users/referees/local",{email:" NEW@test.vn ",name:"Tên mới",role:"super_admin"});
    assert.equal(r.status,200);assert.equal(r.data.email,"new@test.vn");assert.equal(r.data.role,"referee");
    const log=f.db.prepare("SELECT * FROM audit_logs WHERE entity_id='local'").get();assert.equal(log.action,"UPDATE_REFEREE");
    assert.equal(JSON.parse(log.after_data).email,"new@test.vn");assert.equal(log.after_data.includes("password_hash"),false);
  }finally{f.db.close()}
});

test("referee routes validate email, password, name and tournament consistently",async()=>{
  const f=await fixture();try{
    const cases=[[{email:"invalid"},"INVALID_EMAIL"],[{name:" "},"FIELDS_REQUIRED"],[{name:"a".repeat(121)},"NAME_TOO_LONG"],[{password:"a".repeat(65)},"PASSWORD_POLICY"],[{tournamentId:"missing"},"INVALID_TOURNAMENT"]];
    for(const [body,error] of cases){
      const update=await f.api("/api/users/referees/local",body);assert.equal(update.status,400);assert.equal(update.data.error,error);
      const create=await f.api("/api/users/referees",{email:"valid@test.vn",name:"New Ref",password:"account-test-password-123",...body},"POST");assert.equal(create.status,400);assert.equal(create.data.error,error);
    }
    const duplicate=await f.api("/api/users/referees/local",{email:"foreign@test.vn"});assert.equal(duplicate.status,409);assert.equal(duplicate.data.error,"EMAIL_EXISTS");
  }finally{f.db.close()}
});

test("account mutation rolls back if audit persistence fails",async t=>{
  t.mock.method(console,"error",()=>{});
  const f=await fixture();try{
    f.db.exec("CREATE TRIGGER reject_account_audit BEFORE INSERT ON audit_logs BEGIN SELECT RAISE(ABORT,'audit unavailable'); END;");
    const r=await f.api("/api/users/referees/local",{name:"Not saved"});assert.equal(r.status,500);
    assert.equal(f.db.prepare("SELECT display_name FROM app_users WHERE id='local'").get().display_name,"Trọng tài Nguyễn");
    const create=await f.api("/api/users/referees",{email:"atomic@test.vn",name:"Not created",password:"account-test-password-123"},"POST");assert.equal(create.status,500);
    assert.equal(f.db.prepare("SELECT id FROM app_users WHERE email='atomic@test.vn'").get(),undefined);
  }finally{f.db.close()}
});

test("concurrent duplicate referee creation returns an email conflict",async t=>{
  t.mock.method(console,"error",()=>{});
  const f=await fixture();try{
    const body={email:"duplicate@test.vn",name:"Concurrent Ref",password:"account-test-password-123"};
    const results=await Promise.all([f.api("/api/users/referees",body,"POST"),f.api("/api/users/referees",body,"POST")]);
    assert.deepEqual(results.map(r=>r.status).sort(),[201,409]);
    assert.equal(results.find(r=>r.status===409).data.error,"EMAIL_EXISTS");
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM app_users WHERE email='duplicate@test.vn'").get().n,1);
  }finally{f.db.close()}
});

test("resetting a referee password invalidates its session and preserves scope",async()=>{
  const f=await fixture();try{
    const password="reset-account-password-123";
    const r=await f.api("/api/users/referees/local",{password},"PATCH","organizer");assert.equal(r.status,200);assert.equal(r.data.tournament_id_scope,"own");
    const session=await f.api("/api/auth/me",undefined,"GET","local");assert.equal(session.status,401);
    const login=await f.api("/api/auth/login",{email:"local@test.vn",password},"POST");assert.equal(login.status,200);assert.ok(login.data.token);
    const audit=f.db.prepare("SELECT * FROM audit_logs WHERE entity_id='local'").get();assert.equal(audit.reason,"Password reset");assert.equal(audit.after_data.includes(password),false);
  }finally{f.db.close()}
});
