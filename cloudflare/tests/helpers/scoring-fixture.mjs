import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import worker from "../../src/index.js";
import {signSession} from "../../src/auth.js";

export async function scoringFixture(){
  const db=new DatabaseSync(":memory:");
  for(const file of readdirSync(new URL("../../migrations/",import.meta.url)).filter(x=>x.endsWith(".sql")).sort())db.exec(readFileSync(new URL("../../migrations/"+file,import.meta.url),"utf8"));
  const controls={beforeBatch:null,broadcasts:[]};
  const run=(sql,args)=>{const r=db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}}};
  const DB={prepare(sql){
    const make=args=>({sql,args,bind:(...next)=>make(next),first:async()=>db.prepare(sql).get(...args)||null,all:async()=>({results:db.prepare(sql).all(...args)}),run:async()=>run(sql,args)});
    return make([]);
  },async batch(statements){
    if(controls.beforeBatch){const hook=controls.beforeBatch;controls.beforeBatch=null;await hook()}
    db.exec("BEGIN");try{const result=statements.map(s=>run(s.sql,s.args));db.exec("COMMIT");return result}catch(e){db.exec("ROLLBACK");throw e}
  }};
  db.exec(`INSERT INTO app_users(id,email,display_name,role,password_hash) VALUES
    ('admin','score-admin@test.invalid','Admin','super_admin','unused'),('organizer','score-org@test.invalid','Organizer','organizer','unused'),
    ('ref','score-ref@test.invalid','Referee','referee','unused');
    INSERT INTO tournaments(id,name,slug,owner_user_id) VALUES('tour','Scoring test','scoring-test','organizer'),('other','Other','other','admin');
    UPDATE app_users SET tournament_id_scope='tour' WHERE id='ref';
    INSERT INTO divisions(id,tournament_id,name) VALUES('division','tour','Doubles');
    INSERT INTO teams(id,division_id,name) VALUES('a','division','A'),('b','division','B'),('c','division','C');
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,referee_user_id,status) VALUES('match','division','a','b','ref','scheduled');`);
  const env={DB,SESSION_SECRET:"scoring-regression-synthetic-only-secret-123456789",ROOMS:{idFromName:x=>x,get:()=>({fetch:async(url,opts)=>{controls.broadcasts.push(JSON.parse(opts.body));return new Response(null,{status:204})}})}};
  const tokens={};for(const id of ["admin","organizer","ref"])tokens[id]=await signSession(env,db.prepare("SELECT * FROM app_users WHERE id=?").get(id));
  const useHandler=process.env.SCORING_TEST_HANDLER==="1";
  const handler=useHandler?(await import("../../src/scoring.js")).handleScoring:null;
  const api=async(action,body={},actor="admin",id="match")=>{
    const request=new Request("https://test.invalid/api/matches/"+id+"/"+action,{method:"POST",headers:{Authorization:"Bearer "+tokens[actor],"Content-Type":"application/json"},body:JSON.stringify(body)});
    try{const response=handler?await handler(request,env):await worker.fetch(request,env);return {status:response.status,data:await response.json()}}
    catch(e){return {status:e.status||(e.message.includes("VERSION_CONFLICT")||e.message.includes("DOWNSTREAM_MATCH")?409:500),data:{error:e.message}}}
  };
  const match=()=>({...db.prepare("SELECT * FROM matches WHERE id='match'").get()});
  const sets=()=>db.prepare("SELECT * FROM match_sets WHERE match_id='match' ORDER BY set_no").all().map(s=>({...s}));
  const downstream=()=>db.exec(`INSERT INTO matches(id,division_id,team_b_id,status) VALUES('winner','division','c','scheduled'),('loser','division','c','scheduled');UPDATE matches SET next_match_id='winner',next_match_side='A',loser_next_match_id='loser',loser_next_match_side='A' WHERE id='match';`);
  return {db,env,api,match,sets,downstream,controls,tokens};
}
