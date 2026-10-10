import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

function readArchive(log,audits){
  const manifest=JSON.parse(log.before_data);
  if(!manifest.chunkCount)return manifest;
  const chunks=audits.filter(a=>a.action==='RESET_GROUP_DRAW_ARCHIVE').map(a=>JSON.parse(a.before_data)).filter(a=>a.archiveId===manifest.archiveId).sort((a,b)=>a.index-b.index);
  assert.equal(chunks.length,manifest.chunkCount);
  return JSON.parse(Buffer.concat(chunks.map(c=>Buffer.from(c.data,'base64'))).toString('utf8'));
}

async function fixture(){
  const f=await scoringFixture();
  f.db.exec(`UPDATE tournaments SET public_visible=1 WHERE id='tour';
    INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Sân 1');
    INSERT INTO teams(id,division_id,name,group_code) VALUES('d','division','D','B');
    UPDATE teams SET group_code='A' WHERE id IN ('a','b');
    UPDATE teams SET group_code='B' WHERE id='c';
    INSERT INTO players(id,full_name) VALUES('player','VĐV được giữ');
    INSERT INTO team_players(team_id,player_id) VALUES('a','player');
    INSERT INTO registrations(id,division_id,team_id,status,payment_status) VALUES('registration','division','a','approved','paid');
    UPDATE matches SET court_id='court',status='live',current_score_a=3,started_at='2026-10-11',version=2 WHERE id='match';
    INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES('set','match',1,11,5,1);
    INSERT INTO score_events(match_id,actor_user_id,event_type,payload,match_version) VALUES('match','ref','POINT','{"side":"A"}',2);
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,bracket_slot,status) VALUES('final','division','c','d','Chung kết','F-1','scheduled');
    INSERT INTO divisions(id,tournament_id,name) VALUES('sibling','tour','Nội dung khác'),('foreign','other','Giải khác');
    INSERT INTO teams(id,division_id,name,group_code) VALUES('s1','sibling','S1','A'),('s2','sibling','S2','A'),('f1','foreign','F1','A');
    INSERT INTO matches(id,division_id,team_a_id,team_b_id,status) VALUES('s-match','sibling','s1','s2','scheduled');
    INSERT INTO app_settings(key,value) VALUES('draw_config:division','{"groupCount":2,"teamsPerGroup":2,"advanceCount":1,"courtIds":["court"]}');`);
  const call=async(method='GET',body,actor='admin',division='division')=>{
    const response=await worker.fetch(new Request('https://test.invalid/api/divisions/'+division+'/reset-draw',{
      method,headers:{...(actor?{Authorization:'Bearer '+f.tokens[actor]}:{}),'Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})
    }),f.env);
    return {status:response.status,data:await response.json()};
  };
  const snapshot=()=>Object.fromEntries(['divisions','teams','team_players','players','matches','match_sets','score_events','registrations','courts','app_users','app_settings','audit_logs','division_draw_revisions'].map(t=>[t,f.db.prepare('SELECT * FROM '+t+' ORDER BY rowid').all().map(x=>({...x}))]));
  const reset=async(preview,actor='admin')=>call('POST',{confirmation:'QUAY LAI',expectedToken:preview.data.token},actor);
  return {...f,call,snapshot,reset};
}

test('reset preview shows the full division scope without changing data',async()=>{
  const f=await fixture();try{
    const before=f.snapshot(),result=await f.call();
    assert.equal(result.status,200);assert.equal(result.data.divisionName,'Doubles');
    assert.equal(result.data.summary.teamCount,4);assert.equal(result.data.summary.groupCount,2);
    assert.equal(result.data.summary.matchCount,2);assert.equal(result.data.summary.knockoutMatchCount,1);
    assert.equal(result.data.summary.liveMatchCount,1);assert.equal(result.data.summary.setCount,1);assert.equal(result.data.summary.scoreEventCount,1);
    assert.match(result.data.token,/^[a-f0-9]{64}$/);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('reset clears only this division and archives every removed match, set, event and group',async()=>{
  const f=await fixture();try{
    const before=f.snapshot(),preview=await f.call(),result=await f.reset(preview,'organizer');
    assert.equal(result.status,200);assert.equal(result.data.removedMatches,2);
    const after=f.snapshot();assert.equal(after.matches.length,1);assert.equal(after.matches[0].id,'s-match');
    assert.deepEqual(after.match_sets,[]);assert.deepEqual(after.score_events,[]);
    assert.ok(after.teams.filter(t=>t.division_id==='division').every(t=>t.group_code===null));
    assert.deepEqual(after.teams.filter(t=>t.division_id!=='division'),before.teams.filter(t=>t.division_id!=='division'));
    for(const table of ['team_players','players','registrations','courts','app_users','app_settings','divisions'])assert.deepEqual(after[table],before[table],table+' must be preserved');
    const log=after.audit_logs.find(a=>a.action==='RESET_GROUP_DRAW');assert.ok(log);assert.equal(log.actor_user_id,'organizer');
    const archive=readArchive(log,after.audit_logs);
    assert.deepEqual(archive.matches,before.matches.filter(m=>m.division_id==='division'));
    assert.deepEqual(archive.sets,before.match_sets);assert.deepEqual(archive.scoreEvents,before.score_events);
    assert.equal(archive.groups.length,4);assert.ok(f.controls.broadcasts.some(b=>b.event==='public:state'));
    assert.equal((await f.api('rally',{side:'A',expectedVersion:2},'ref')).status,404,'old referee score requests must fail');
    const draw=await worker.fetch(new Request('https://test.invalid/api/divisions/division/run-draw',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.organizer,'Content-Type':'application/json'},body:JSON.stringify({groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:['court']})}),f.env);
    assert.equal(draw.status,200);assert.equal((await draw.json()).created,2,'played groups must be drawable again after reset');
  }finally{f.db.close()}
});

for(const actor of [null,'ref'])test('reset preview and writes reject '+(actor||'anonymous'),async()=>{
  const f=await fixture();try{
    const before=f.snapshot();for(const method of ['GET','POST'])assert.equal((await f.call(method,method==='POST'?{confirmation:'QUAY LAI',expectedToken:'anything'}:undefined,actor)).status,actor?403:401);
    assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('organizers cannot preview or reset another tournament',async()=>{
  const f=await fixture();try{
    const before=f.snapshot();for(const method of ['GET','POST'])assert.equal((await f.call(method,method==='POST'?{confirmation:'QUAY LAI',expectedToken:'anything'}:undefined,'organizer','foreign')).status,403);
    assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const body of [{},{confirmation:'RESET'},{confirmation:'QUAY LAI'},{confirmation:'QUAY LAI',expectedToken:'stale'}])test('reset refuses missing confirmation or a stale preview '+JSON.stringify(body),async()=>{
  const f=await fixture();try{
    const before=f.snapshot();const result=await f.call('POST',body);assert.ok([400,409].includes(result.status));assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const [name,mutation] of [
  ['new point',"UPDATE matches SET current_score_a=4,version=3 WHERE id='match'"],
  ['late set',"INSERT INTO match_sets(id,match_id,set_no,score_a,score_b) VALUES('late','match',2,1,0)"],
  ['late undone event',"INSERT INTO score_events(match_id,event_type,match_version,undone_at) VALUES('match','POINT',3,'2026-10-11')"],
  ['new schedule',"INSERT INTO matches(id,division_id,team_a_id,team_b_id) VALUES('new','division','a','c')"],
  ['changed groups',"UPDATE teams SET group_code='C' WHERE id='a'"],
  ['deleted court',"DELETE FROM courts WHERE id='court'"],
  ['deleted referee',"DELETE FROM app_users WHERE id='ref'"]
])test('reset aborts atomically when '+name+' arrives after preview or before batch',async()=>{
  for(const duringBatch of [false,true]){
    const f=await fixture();try{
      const preview=await f.call();let before;
      if(duringBatch)f.controls.beforeBatch=async()=>{f.db.exec(mutation);before=f.snapshot()};
      else{f.db.exec(mutation);before=f.snapshot()}
      const result=await f.reset(preview);assert.equal(result.status,409);assert.equal(result.data.error,'DRAW_RESET_CONFLICT');assert.deepEqual(f.snapshot(),before);
    }finally{f.db.close()}
  }
});

test('a late archive failure rolls back the entire reset',async()=>{
  const f=await fixture();try{
    const preview=await f.call();f.db.exec("CREATE TRIGGER fail_reset_archive BEFORE INSERT ON audit_logs WHEN NEW.action='RESET_GROUP_DRAW' BEGIN SELECT RAISE(ABORT,'TEST_RESET_ARCHIVE_FAILURE'); END;");
    const before=f.snapshot();assert.equal((await f.reset(preview)).status,500);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('duplicate concurrent reset requests commit exactly one archive',async()=>{
  const f=await fixture();try{
    const preview=await f.call();const results=await Promise.all([f.reset(preview),f.reset(preview)]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='RESET_GROUP_DRAW'").get().n,1);
  }finally{f.db.close()}
});

test('delivery failure after commit does not turn a completed reset into failure',async()=>{
  const f=await fixture();try{
    const preview=await f.call();f.env.ROOMS.get=()=>({fetch:async()=>{throw new Error('TEST_RESET_DELIVERY_FAILURE')}});
    assert.equal((await f.reset(preview)).status,200);assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='division'").get().n,0);
  }finally{f.db.close()}
});

test('a bracket plan prepared before reset cannot recreate old qualifiers after reset',async()=>{
  const f=await fixture();try{
    f.db.exec("DELETE FROM matches WHERE id='final'; UPDATE matches SET status='completed',winner_team_id='a' WHERE id='match'; INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status) VALUES('poolB','division','c','d','c','Bảng B','completed')");
    const preview=await f.call();f.controls.beforeBatch=async()=>assert.equal((await f.reset(preview)).status,200);
    const response=await worker.fetch(new Request('https://test.invalid/api/divisions/division/generate-bracket',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:'{}'}),f.env);
    assert.equal(response.status,409);assert.equal((await response.json()).error,'BRACKET_STATE_CHANGED');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='division'").get().n,0);
  }finally{f.db.close()}
});

test('a draw plan prepared before reset cannot replace the newly empty groups',async()=>{
  const f=await fixture();try{
    f.db.exec("DELETE FROM score_events; DELETE FROM match_sets; DELETE FROM matches WHERE id='final'; UPDATE matches SET status='scheduled',started_at=NULL,current_score_a=0,version=1 WHERE id='match'");
    const preview=await f.call();f.controls.beforeBatch=async()=>assert.equal((await f.reset(preview)).status,200);
    const response=await worker.fetch(new Request('https://test.invalid/api/divisions/division/run-draw',{method:'POST',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:JSON.stringify({groupCount:2,teamsPerGroup:2,advanceCount:1,courtIds:['court']})}),f.env);
    assert.equal(response.status,409);assert.equal((await response.json()).error,'DRAW_VERSION_CONFLICT');
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='division'").get().n,0);
  }finally{f.db.close()}
});

test('played division with more than 2 MB of rally history resets within D1 row limits',async()=>{
  const f=await fixture();try{
    assert.equal((await f.api('point',{side:'A',delta:1,expectedVersion:2})).status,200);
    const payload=JSON.parse(f.db.prepare("SELECT payload FROM score_events ORDER BY id DESC LIMIT 1").get().payload);
    delete payload.expectedVersion;
    const insert=f.db.prepare("INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','POINT',?,3)");
    for(let i=0;i<1200;i++)insert.run(JSON.stringify({...payload,marker:'Rally '+i+' • Nguyễn Ánh'}));
    const before=f.snapshot();assert.ok(Buffer.byteLength(JSON.stringify(before.score_events))>2_000_000,'use real scoring payloads exceeding the D1 row limit');
    f.db.exec("CREATE TRIGGER simulate_d1_audit_limit BEFORE INSERT ON audit_logs WHEN LENGTH(CAST(NEW.before_data AS BLOB))>2000000 BEGIN SELECT RAISE(ABORT,'D1_ROW_TOO_LARGE'); END;");
    const prepare=f.env.DB.prepare.bind(f.env.DB);
    f.env.DB.prepare=sql=>{
      const wrap=s=>({...s,bind:(...args)=>wrap(s.bind(...args)),first:async()=>{const row=await s.first();if(row?.signature&&Buffer.byteLength(row.signature)>2_000_000)throw new Error('D1_SIGNATURE_TOO_LARGE');return row}});
      return wrap(prepare(sql));
    };
    const preview=await f.call();assert.equal(preview.status,200);
    assert.equal((await f.reset(preview)).status,200);
    const after=f.snapshot(),log=after.audit_logs.find(a=>a.action==='RESET_GROUP_DRAW');
    assert.deepEqual(readArchive(log,after.audit_logs).scoreEvents,before.score_events);
    for(const row of after.audit_logs.filter(a=>a.action.startsWith('RESET_GROUP_DRAW')))assert.ok(Buffer.byteLength(row.before_data)<2_000_000);
    assert.equal(after.matches.filter(m=>m.division_id==='division').length,0);
  }finally{f.db.close()}
});

test('failure in a later archive chunk rolls back matches, groups and earlier chunks',async()=>{
  const f=await fixture();try{
    const text=JSON.stringify({note:'Ánh '.repeat(80_000)});
    f.db.prepare("INSERT INTO score_events(match_id,event_type,payload,match_version) VALUES('match','POINT',?,2)").run(text);
    const preview=await f.call();
    f.db.exec("CREATE TRIGGER fail_late_archive BEFORE INSERT ON audit_logs WHEN NEW.action='RESET_GROUP_DRAW_ARCHIVE' AND json_extract(NEW.before_data,'$.index')=1 BEGIN SELECT RAISE(ABORT,'TEST_LATE_ARCHIVE_FAILURE'); END;");
    const before=f.snapshot();assert.equal((await f.reset(preview)).status,500);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

for(const [action,query] of [
  ['auto-seed-groups','SELECT id FROM teams WHERE division_id='],
  ['generate-round-robin','SELECT id,group_code FROM teams WHERE division_id=']
])test('legacy '+action+' cannot repopulate a division after reset',async()=>{
  const f=await fixture();try{
    f.db.exec('DELETE FROM matches');
    const preview=await f.call(),prepare=f.env.DB.prepare.bind(f.env.DB);let intercepted=false;
    f.env.DB.prepare=sql=>{
      const wrap=s=>({...s,bind:(...args)=>wrap(s.bind(...args)),all:async()=>{
        const result=await s.all();
        if(!intercepted&&sql.startsWith(query)){intercepted=true;assert.equal((await f.reset(preview)).status,200)}
        return result;
      }});
      return wrap(prepare(sql));
    };
    const response=await worker.fetch(new Request('https://test.invalid/api/divisions/division/'+action,{method:'POST',headers:{Authorization:'Bearer '+f.tokens.admin,'Content-Type':'application/json'},body:JSON.stringify({groupCount:2})}),f.env);
    assert.equal(response.status,409);assert.equal((await response.json()).error,'DRAW_RESET_CONFLICT');assert.equal(intercepted,true);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='division'").get().n,0);
    assert.equal(f.db.prepare("SELECT COUNT(*) n FROM teams WHERE division_id='division' AND group_code IS NOT NULL").get().n,0);
  }finally{f.db.close()}
});
