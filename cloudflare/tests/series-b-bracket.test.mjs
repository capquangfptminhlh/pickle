import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';
import {scoringFixture} from './helpers/scoring-fixture.mjs';

async function drawMatch(f,id){
  const before=f.db.prepare('SELECT * FROM matches WHERE id=?').get(id);
  const result=await f.api('relay-draw',{expectedVersion:before.version},'admin',id);
  assert.equal(result.status,200,JSON.stringify(result.data));
  const match=f.db.prepare('SELECT * FROM matches WHERE id=?').get(id);
  for(const field of ['relay_order_a','relay_order_b'])assert.deepEqual(JSON.parse(match[field]).sort(),['AB','BC','CA']);
  assert.ok(match.relay_drawn_at);assert.equal(match.version,before.version+1);
  return match;
}

async function fixture({groups=4,members=4,enabled=true,bronze=true}={}){
  const f=await scoringFixture();
  f.db.exec("DELETE FROM matches; DELETE FROM teams; UPDATE divisions SET event_type='team',format='pool_to_knockout',advance_count=2,best_of=1,points_to_win=27,win_by_two=0,scoring_mode='rally',relay_segment_points=9,relay_team_size=3,final_point_on_serve=1,third_place_match=1 WHERE id='division'");
  const call=async(path,body,method='POST',actor='admin')=>{
    const response=await worker.fetch(new Request('https://test.invalid'+path,{method,headers:{Authorization:'Bearer '+f.tokens[actor],'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body??{})})}),f.env);
    return {status:response.status,data:await response.json()};
  };
  const enabledResult=await call('/api/divisions/division',{seriesBEnabled:enabled,seriesBThirdPlaceMatch:bronze},'PATCH');
  assert.equal(enabledResult.status,200,JSON.stringify(enabledResult.data));
  for(let gi=0;gi<groups;gi++){
    const group=String.fromCharCode(65+gi);
    for(let rank=1;rank<=members;rank++){
      const id=group+rank;
      f.db.prepare("INSERT INTO teams(id,division_id,name,seed,group_code,status) VALUES(?,'division',?,?,?,'active')").run(id,id,rank,group);
      for(const [index,grade] of [...'ABC'].entries()){
        const player=id+'-'+grade;
        f.db.prepare('INSERT INTO players(id,full_name,skill_level,active) VALUES(?,?,?,1)').run(player,player,grade);
        f.db.prepare('INSERT INTO team_players(team_id,player_id,slot_no) VALUES(?,?,?)').run(id,player,index+1);
      }
    }
    for(let a=1;a<=members;a++)for(let b=a+1;b<=members;b++){
      const id='pool-'+group+a+b;
      f.db.prepare("INSERT INTO matches(id,division_id,team_a_id,team_b_id,winner_team_id,stage,status,completed_at) VALUES(?,'division',?,?,?,?,'completed','2026-10-11T00:00:00Z')").run(id,group+a,group+b,group+a,'Bảng '+group);
      f.db.prepare("INSERT INTO match_sets(id,match_id,set_no,score_a,score_b,completed) VALUES(?,?,1,27,?,1)").run('set-'+id,id,Math.max(0,18-a-b));
    }
  }
  const generate=()=>call('/api/divisions/division/generate-bracket',{});
  const bracket=()=>f.db.prepare("SELECT * FROM matches WHERE division_id='division' AND bracket_slot IS NOT NULL ORDER BY bracket_series,round_no,bracket_slot").all();
  const snapshot=()=>Object.fromEntries(['divisions','teams','matches','match_sets','score_events','audit_logs','app_settings','division_draw_reset_guards'].map(table=>[table,f.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all().map(row=>({...row}))]));
  return {...f,call,generate,bracket,snapshot};
}

test('division routes persist optional Serie B configuration and expose it in state',async()=>{
  const f=await fixture();try{
    const state=await f.call('/api/admin/state',undefined,'GET');
    const division=state.data.divisions.find(d=>d.id==='division');
    assert.equal(division.seriesBEnabled,true);assert.equal(division.seriesBThirdPlaceMatch,true);
    assert.equal(f.db.prepare("SELECT series_b_enabled FROM divisions WHERE id='division'").get().series_b_enabled,1);
    const defaults=await f.call('/api/tournaments/tour/divisions',{name:'Default division'});
    assert.equal(defaults.status,201);assert.equal(defaults.data.series_b_enabled,0);assert.equal(defaults.data.series_b_third_place_match,0);
    const explicit=await f.call('/api/tournaments/tour/divisions',{name:'B configured',seriesBEnabled:true,seriesBThirdPlaceMatch:true});
    assert.equal(explicit.status,201);assert.equal(explicit.data.series_b_enabled,1);
  }finally{f.db.close()}
});

for(const route of ['/api/divisions/division','/api/divisions/division/full'])for(const [body,error] of [[{format:'single_elimination',seriesBEnabled:true},'SERIES_B_REQUIRES_POOL_FORMAT'],[{advanceCount:3,seriesBEnabled:true},'SERIES_B_ADVANCE_COUNT_OVERLAP']])test(route+' rejects invalid Serie B '+error+' without changes',async()=>{
  const f=await fixture({enabled:false});try{
    const before=f.snapshot(),result=await f.call(route,body,'PATCH');
    assert.equal(result.status,400);assert.equal(result.data.error,error);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('four completed pools produce separate Top 2 Serie A and rank 3 Serie B brackets',async()=>{
  const f=await fixture();try{
    const result=await f.generate();assert.equal(result.status,200,JSON.stringify(result.data));
    assert.equal(result.data.seriesA.qualifiers,8);assert.equal(result.data.seriesB.qualifiers,4);
    assert.equal(result.data.seriesA.created,8);assert.equal(result.data.seriesB.created,4);assert.equal(result.data.created,12);
    assert.equal(result.data.seriesB.thirdPlaceMatch,true);
    const matches=f.bracket(),a=matches.filter(m=>m.bracket_series==='A'),b=matches.filter(m=>m.bracket_series==='B');
    assert.equal(a.length,8);assert.equal(b.length,4);
    assert.deepEqual(new Set(a.filter(m=>m.round_no===1).flatMap(m=>[m.team_a_id,m.team_b_id])),new Set(['A1','A2','B1','B2','C1','C2','D1','D2']));
    assert.deepEqual(new Set(b.filter(m=>m.round_no===1).flatMap(m=>[m.team_a_id,m.team_b_id])),new Set(['A3','B3','C3','D3']));
    const byId=new Map(matches.map(m=>[m.id,m]));
    for(const m of matches)for(const next of [m.next_match_id,m.loser_next_match_id].filter(Boolean))assert.equal(byId.get(next).bracket_series,m.bracket_series);
    assert.ok(a.every(m=>m.bracket_slot.startsWith('SE-')));assert.ok(b.every(m=>m.bracket_slot.startsWith('B-SE-')));
    const publicState=await f.call('/api/public/state',undefined,'GET');
    for(const m of publicState.data.matches.filter(m=>m.bracketSlot))assert.ok(['A','B'].includes(m.bracketSeries));
  }finally{f.db.close()}
});

test('disabled Serie B retains the existing Top 2 bracket and score rules',async()=>{
  const f=await fixture({enabled:false});try{
    const result=await f.generate();assert.equal(result.status,200);assert.equal(result.data.qualifiers,8);assert.equal(result.data.created,8);
    assert.equal(result.data.seriesB,null);assert.ok(f.bracket().every(m=>m.bracket_series==='A'));
    const division=f.db.prepare("SELECT * FROM divisions WHERE id='division'").get();
    assert.equal(division.points_to_win,27);assert.equal(division.relay_segment_points,9);assert.equal(division.final_point_on_serve,1);
  }finally{f.db.close()}
});

test('Serie B can omit its bronze playoff independently of Serie A',async()=>{
  const f=await fixture({bronze:false});try{
    const result=await f.generate();assert.equal(result.status,200);assert.equal(result.data.seriesA.thirdPlaceMatch,true);assert.equal(result.data.seriesB.thirdPlaceMatch,false);
    assert.equal(f.bracket().filter(m=>m.bracket_series==='B').length,3);
  }finally{f.db.close()}
});

for(const options of [{members:2},{groups:1,members:4}])test('insufficient Serie B qualifiers '+JSON.stringify(options)+' leave both brackets absent',async()=>{
  const f=await fixture(options);try{
    const before=f.snapshot(),result=await f.generate();assert.equal(result.status,400);assert.equal(result.data.error,'NOT_ENOUGH_SERIES_B_QUALIFIERS');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('incomplete group results cannot qualify either Serie',async()=>{
  const f=await fixture();try{
    f.db.exec("UPDATE matches SET status='scheduled',winner_team_id=NULL WHERE id='pool-A12'");
    const before=f.snapshot(),result=await f.generate();assert.equal(result.status,409);assert.equal(result.data.error,'GROUP_STAGE_NOT_COMPLETE');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('a failing Serie B insert rolls back all Serie A inserts too',async()=>{
  const f=await fixture();try{
    f.db.exec("CREATE TRIGGER fail_series_b BEFORE INSERT ON matches WHEN NEW.bracket_slot LIKE 'B-SE-%' BEGIN SELECT RAISE(ABORT,'TEST_SERIES_B_FAILURE'); END");
    const before=f.snapshot(),result=await f.generate();assert.equal(result.status,500);assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('concurrent plans create exactly one complete pair of brackets',async()=>{
  const f=await fixture();try{
    let other;f.controls.beforeBatch=async()=>{other=await f.generate()};
    const result=await f.generate();assert.deepEqual([result.status,other.status].sort(),[200,409]);assert.equal(f.bracket().length,12);
  }finally{f.db.close()}
});

for(const [name,sql] of [['result',"UPDATE matches SET winner_team_id=team_b_id,version=version+1 WHERE id='pool-A12'"],['series settings',"UPDATE divisions SET series_b_enabled=0 WHERE id='division'"],['advance count',"UPDATE divisions SET advance_count=1 WHERE id='division'"]])test('a late '+name+' invalidates both qualification plans',async()=>{
  const f=await fixture();try{
    let changed;f.controls.beforeBatch=async()=>{f.db.exec(sql);changed=f.snapshot()};
    const result=await f.generate();assert.equal(result.status,409);assert.equal(result.data.error,'BRACKET_STATE_CHANGED');assert.deepEqual(f.snapshot(),changed);
  }finally{f.db.close()}
});

test('B semifinal scoring routes winner and loser independently and keeps A untouched',async()=>{
  const f=await fixture();try{
    assert.equal((await f.generate()).status,200);
    const aBefore=f.bracket().filter(m=>m.bracket_series==='A').map(m=>({...m}));
    const semis=f.bracket().filter(m=>m.bracket_series==='B'&&m.round_no===1),winners=[],losers=[];
    for(const match of semis){const drawn=await drawMatch(f,match.id);const score=await f.api('quick-score',{sets:[[27,12]],expectedVersion:drawn.version},'admin',match.id);assert.equal(score.status,200,JSON.stringify(score.data));winners.push(match.team_a_id);losers.push(match.team_b_id)}
    const final=f.db.prepare("SELECT * FROM matches WHERE bracket_slot='B-SE-R2-M1'").get(),bronze=f.db.prepare("SELECT * FROM matches WHERE bracket_slot='B-SE-3RD-M1'").get();
    assert.deepEqual([final.team_a_id,final.team_b_id],winners);assert.deepEqual([bronze.team_a_id,bronze.team_b_id],losers);
    assert.equal((await f.api('quick-score',{sets:[[27,20]],expectedVersion:(await drawMatch(f,final.id)).version},'admin',final.id)).status,200);
    assert.equal((await f.api('quick-score',{sets:[[27,18]],expectedVersion:(await drawMatch(f,bronze.id)).version},'admin',bronze.id)).status,200);
    assert.deepEqual(f.bracket().filter(m=>m.bracket_series==='A').map(m=>({...m})),aBefore);
    const row=f.db.prepare("SELECT winner_team_id FROM matches WHERE id=?").get(final.id);assert.equal(row.winner_team_id,winners[0]);
    const undo=await f.api('undo',{},'admin',semis[0].id);assert.equal(undo.status,409);assert.equal(undo.data.error,'DOWNSTREAM_MATCH_LOCKED');
  }finally{f.db.close()}
});

test('draw reset archives and removes both branches together',async()=>{
  const f=await fixture();try{
    assert.equal((await f.generate()).status,200);
    const preview=await f.call('/api/divisions/division/reset-draw',undefined,'GET');assert.equal(preview.status,200);assert.equal(preview.data.summary.knockoutMatchCount,12);
    const result=await f.call('/api/divisions/division/reset-draw',{confirmation:'QUAY LAI',expectedToken:preview.data.token});assert.equal(result.status,200);assert.equal(result.data.removedMatches,36);assert.equal(f.bracket().length,0);
    const chunks=f.db.prepare("SELECT before_data FROM audit_logs WHERE action='RESET_GROUP_DRAW_ARCHIVE' ORDER BY id").all().map(row=>JSON.parse(row.before_data));
    const archive=JSON.parse(Buffer.concat(chunks.map(chunk=>Buffer.from(chunk.data,'base64'))).toString('utf8'));
    assert.equal(archive.matches.filter(m=>m.bracket_series==='B').length,4);
  }finally{f.db.close()}
});

test('Serie A and Serie B share the live-court guard without partial scoring',async()=>{
  const f=await fixture();try{
    assert.equal((await f.generate()).status,200);
    f.db.exec("INSERT INTO courts(id,tournament_id,name) VALUES('court1','tour','Court 1'),('court2','tour','Court 2')");
    const a=f.bracket().find(m=>m.bracket_series==='A'&&m.round_no===1),b=f.bracket().find(m=>m.bracket_series==='B'&&m.round_no===1);
    f.db.prepare("UPDATE matches SET court_id='court1' WHERE id IN (?,?)").run(a.id,b.id);
    await drawMatch(f,a.id);await drawMatch(f,b.id);
    assert.equal((await f.api('point',{side:'A',delta:1},'admin',a.id)).status,200);
    const before=f.snapshot(),blocked=await f.api('point',{side:'A',delta:1},'admin',b.id);
    assert.equal(blocked.status,409);assert.equal(blocked.data.error,'COURT_BUSY');assert.deepEqual(f.snapshot(),before);
    f.db.prepare("UPDATE matches SET court_id='court2' WHERE id=?").run(b.id);
    assert.equal((await f.api('point',{side:'A',delta:1},'admin',b.id)).status,200);
  }finally{f.db.close()}
});

test('bracket qualification settings are locked until an explicit draw reset',async()=>{
  const f=await fixture();try{
    assert.equal((await f.generate()).status,200);
    const before=f.snapshot(),result=await f.call('/api/divisions/division',{seriesBEnabled:false},'PATCH');assert.equal(result.status,409);assert.equal(result.data.error,'BRACKET_SETTINGS_LOCKED');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});

test('draw config stores Serie B selection and validates overlap before writes',async()=>{
  const f=await fixture({enabled:false});try{
    const config=await f.call('/api/divisions/division/draw-config',{groupCount:4,teamsPerGroup:4,advanceCount:2,seriesBEnabled:true,seriesBThirdPlaceMatch:true},'PUT');assert.equal(config.status,200);
    assert.equal(config.data.seriesBEnabled,true);assert.equal((await f.call('/api/divisions/division/draw-config',undefined,'GET')).data.seriesBThirdPlaceMatch,true);
    assert.equal(f.db.prepare("SELECT series_b_enabled FROM divisions WHERE id='division'").get().series_b_enabled,1);
    const before=f.snapshot(),invalid=await f.call('/api/divisions/division/draw-config',{advanceCount:3,seriesBEnabled:true},'PUT');assert.equal(invalid.status,400);assert.equal(invalid.data.error,'SERIES_B_ADVANCE_COUNT_OVERLAP');assert.deepEqual(f.snapshot(),before);
  }finally{f.db.close()}
});
