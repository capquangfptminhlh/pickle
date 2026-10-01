import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import worker from "../../src/index.js";
import {signSession} from "../../src/auth.js";

export async function accountFixture(){
  const db=new DatabaseSync(":memory:");
  for(const file of readdirSync(new URL("../../migrations/",import.meta.url)).filter(x=>x.endsWith(".sql")).sort())db.exec(readFileSync(new URL("../../migrations/"+file,import.meta.url),"utf8"));
  const DB={prepare(sql){
    const make=args=>({sql,args,bind:(...next)=>make(next),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>db.prepare(sql).run(...args)});
    return make([]);
  },async batch(statements){
    db.exec("BEGIN");try{const result=statements.map(s=>db.prepare(s.sql).run(...s.args));db.exec("COMMIT");return result}catch(e){db.exec("ROLLBACK");throw e}
  }};
  db.exec(`INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES
    ('admin','admin@test.vn','Admin','super_admin','unused'),('organizer','org@test.vn','Organizer','organizer','unused'),
    ('local','local@test.vn','Trọng tài Nguyễn','referee','unused'),('foreign','foreign@test.vn','Other Ref','referee','unused'),('global','global@test.vn','Global Ref','referee','unused');
    INSERT INTO tournaments(id,name,slug,owner_user_id) VALUES('own','Giải của tôi','own','organizer'),('other','Giải khác','other','admin');
    UPDATE app_users SET tournament_id_scope='own' WHERE id='local';
    UPDATE app_users SET tournament_id_scope='other' WHERE id='foreign';`);
  const env={DB,SESSION_SECRET:"account-regression-local-only-secret-123456789"},tokens={};
  for(const id of ["admin","organizer","local"])tokens[id]=await signSession(env,db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
  const api=async(path,body,method="PATCH",actor="admin")=>{
    const response=await worker.fetch(new Request("https://test.invalid"+path,{method,headers:{Authorization:"Bearer "+tokens[actor],"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
    return {status:response.status,data:await response.json()};
  };
  return {db,api,env,tokens};
}
