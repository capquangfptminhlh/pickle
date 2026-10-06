import test from "node:test";
import assert from "node:assert/strict";
import {accountFixture} from "./helpers/accounts-fixture.mjs";

test("self-disable guard uses the same active normalization as persistence",async()=>{
  for(const active of [false,0,"0","false",null,""]){
    const f=await accountFixture();
    try{
      const result=await f.api("/api/users/admin",{active},"PATCH","admin");
      assert.equal(result.status,400,`active=${JSON.stringify(active)} must not disable the current admin`);
      assert.equal(result.data.error,"CANNOT_DISABLE_SELF");
      assert.equal(f.db.prepare("SELECT active FROM app_users WHERE id='admin'").get().active,1);
      assert.equal((await f.api("/api/auth/me",undefined,"GET","admin")).status,200);
      assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE entity_id='admin'").get().n,0);
    }finally{f.db.close()}
  }
});

test("self account metadata remains editable while active is preserved",async()=>{
  for(const active of [undefined,true,1,"1","true"]){
    const f=await accountFixture();
    try{
      const result=await f.api("/api/users/admin",{active,name:"Admin updated"},"PATCH","admin");
      assert.equal(result.status,200);assert.equal(result.data.active,true);
      assert.equal(result.data.display_name,"Admin updated");
    }finally{f.db.close()}
  }
});
