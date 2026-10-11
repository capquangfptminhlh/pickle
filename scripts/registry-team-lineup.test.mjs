import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const window={};
for(const file of ['match-format.js','team-lineup.js'])runInNewContext(readFileSync(new URL('../assets/'+file,import.meta.url),'utf8'),{window,document:{addEventListener(){}}});
const lineup=window.PickleTeamLineup;
const division={eventType:'team',relayTeamSize:3,relaySegmentPoints:9,pointsToWin:27};
function fixture(){return {
  teams:[{id:'team',name:'Cao / Hương / Giang'}],teamPlayers:{team:['c','a','b']},teamLineupSources:{team:'assigned'},
  players:[{id:'a',full_name:'Hương',skillLevel:'A',rating:1},{id:'b',full_name:'Giang',skillLevel:'B+',rating:4},{id:'c',full_name:'Cao',skillLevel:'C',rating:3}]
}}

test('three-player relay identifies AB/BC/CA from entered skill levels, not name/slot/rating order',()=>{
  const state=fixture(),before=JSON.stringify(state);
  for(const [score,code,names] of [[0,'AB',['Hương','Giang']],[9,'BC',['Giang','Cao']],[18,'CA',['Cao','Hương']]]){
    const result=lineup.match('team',division,score,0,state);
    assert.equal(result.code,code);assert.deepEqual([...result.names],names);
    assert.equal(result.ready,true);assert.equal(result.gradeBased,true);
  }
  assert.equal(JSON.stringify(state),before,'read-side recognition never rewrites roster or player profiles');
});

test('A+/B+/C+ keep their entered level while identifying relay A/B/C roles',()=>{
  const state=fixture();state.players[0].skillLevel='A+';state.players[2].skillLevel='C+';
  const result=lineup.match('team',division,18,0,state);
  assert.deepEqual([...result.names],['Cao','Hương']);assert.equal(result.players[0].skillLevel,'A+');
});

test('same-grade teams use the assigned or inferred roster order without changing grades',()=>{
  for(const source of ['assigned','inferred']){
    const state=fixture();state.teamLineupSources.team=source;state.players.forEach(p=>p.skillLevel='B');
    const before=JSON.stringify(state);
    for(const [score,code,names] of [[0,'AB',['Cao','Hương']],[9,'BC',['Hương','Giang']],[18,'CA',['Giang','Cao']]]){
      const result=lineup.match('team',division,score,0,state);
      assert.equal(result.ready,true);assert.equal(result.gradeBased,false);assert.equal(result.code,code);
      assert.deepEqual([...result.names],names);assert.deepEqual([...result.players].map(p=>p.skillLevel),['B','B','B']);
    }
    assert.equal(JSON.stringify(state),before,'relay recognition preserves entered grades and member order');
  }
});

test('missing or duplicate grades use confirmed member order when exactly three players are registered',()=>{
  for(const levels of [['A','A','C'],['A','B',''],['A','B','D']]){
    const state=fixture();state.players.forEach((p,i)=>p.skillLevel=levels[i]);
    const result=lineup.match('team',division,0,0,state);
    assert.equal(result.ready,true);assert.equal(result.gradeBased,false);assert.deepEqual([...result.names],['Cao','Hương']);
    assert.deepEqual([...result.players].map(p=>p.skillLevel),[levels[2],levels[0],levels[1]]);
  }
});

test('missing or duplicate grades without a confirmed roster order still warn instead of guessing positions',()=>{
  for(const levels of [['B','B','B'],['A','A','C'],['A','B',''],['A','B','D']]){
    const state=fixture();state.teamLineupSources.team='unassigned';state.players.forEach((p,i)=>p.skillLevel=levels[i]);
    const result=lineup.match('team',division,0,0,state);
    assert.equal(result.ready,false);assert.deepEqual([...result.names],[]);assert.match(result.identityWarning,/thứ tự/);
  }
});

test('updating player skill levels is recognized on the next state render',()=>{
  const state=fixture();state.players[2].skillLevel='B';
  let result=lineup.match('team',division,0,0,state);
  assert.equal(result.ready,true);assert.equal(result.gradeBased,false);assert.deepEqual([...result.names],['Cao','Hương']);
  state.players[2].skillLevel='C';result=lineup.match('team',division,0,0,state);
  assert.equal(result.ready,true);assert.equal(result.gradeBased,true);assert.deepEqual([...result.names],['Hương','Giang']);
});

test('unique entered skill groups still identify players when roster slot order is unassigned',()=>{
  const state=fixture();state.teamLineupSources.team='unassigned';
  const result=lineup.match('team',division,0,0,state);
  assert.equal(result.ready,true);assert.equal(result.gradeBased,true);assert.deepEqual([...result.names],['Hương','Giang']);
});

test('ordinary doubles keep registered serve order independent of skill level',()=>{
  const state=fixture();state.teamPlayers.team=['c','a'];
  const result=lineup.match('team',{eventType:'doubles'},0,0,state);
  assert.equal(result.relay,false);assert.deepEqual([...result.players].map(p=>p.id),['c','a']);
});

test('a four-person roster in a three-person relay explains its count mismatch',()=>{
  const state=fixture();state.players.push({id:'extra',full_name:'Dư người',skillLevel:'B'});state.teamPlayers.team.push('extra');
  const result=lineup.match('team',division,0,0,state);
  assert.equal(result.ready,false);assert.match(result.identityWarning,/đúng 3 VĐV/);assert.equal(result.players.length,4);
});

test('four-person relay keeps explicit player slots independent of entered grades',()=>{
  const state=fixture();state.players.push({id:'d',full_name:'Dũng',skillLevel:'B'});state.teamPlayers.team.push('d');
  for(const [score,code,names] of [[0,'AB',['Cao','Hương']],[9,'BC',['Hương','Giang']],[18,'CD',['Giang','Dũng']],[27,'DA',['Dũng','Cao']]]){
    const result=lineup.match('team',{...division,relayTeamSize:4,pointsToWin:36},score,0,state);
    assert.equal(result.ready,true);assert.equal(result.code,code);assert.deepEqual([...result.names],names);
  }
});

test('independent drawn permutations select each side at all thresholds',()=>{
 const state=fixture();state.teams.push({id:'other',name:'Other'});state.teamPlayers.other=['a','b','c'];state.teamLineupSources.other='assigned';
 const permutations=[['AB','BC','CA'],['AB','CA','BC'],['BC','AB','CA'],['BC','CA','AB'],['CA','AB','BC'],['CA','BC','AB']];
 for(const order of permutations){const m={a:'team',b:'other',relayOrderA:order,relayOrderB:['BC','CA','AB']};for(const [i,score] of [0,9,18].entries()){
  assert.equal(lineup.match('team',division,score,0,state,m).code,order[i]);assert.equal(lineup.match('other',division,score,0,state,m).code,m.relayOrderB[i]);
 }}
 const m={a:'team',b:'other',relayOrderA:['CA','AB','BC'],relayOrderB:['BC','CA','AB']};
 assert.match(lineup.legText('team','other',division,0,0,state,m),/CA.*BC/);assert.match(lineup.legText('team','other',division,0,0,state,m),/Tiếp theo.*AB.*CA/);
});
test('unstarted relay awaits draw without presenting AB as confirmed; started legacy retains AB',()=>{
 const state=fixture(),m={a:'team',b:'other',status:'wait',current:[0,0],sets:[]};
 const pending=lineup.match('team',division,0,0,state,m);assert.equal(pending.code,'');assert.equal(pending.awaitingDraw,true);assert.deepEqual([...pending.names],[]);
 assert.match(lineup.legText('team','other',division,0,0,state,m),/Bốc thăm/);
 assert.equal(lineup.match('team',division,0,0,state,{...m,startedAt:'2026-10-11'}).code,'AB');assert.equal(lineup.match('team',division,0,0,state,{...m,hasHistory:true}).code,'AB');
});

test('Preview requires independent draw, persists it across points/Undo/reset and refuses redraw',async()=>{
 const {webcrypto}=await import('node:crypto');let saved=JSON.stringify({tournaments:[],divisions:[{id:'d',...division}],teams:[{id:'a'},{id:'b'}],teamPlayers:{a:['a1','a2','a3'],b:['b1','b2','b3']},players:[],matches:[{id:'m',divisionId:'d',a:'a',b:'b',version:1,status:'wait',sets:[],current:[0,0]}],audit:[]});
 const w={addEventListener(){},dispatchEvent(){}};runInNewContext(readFileSync(new URL('../preview/preview-api.js',import.meta.url),'utf8'),{window:w,CustomEvent:class{},crypto:webcrypto,localStorage:{getItem:()=>saved,setItem:(_,v)=>saved=v},console,Date,Set,Map});
 await assert.rejects(()=>w.PickleAPI.point('m',{side:'A',delta:1,expectedVersion:1}),{message:'RELAY_DRAW_REQUIRED'});
 const draw=await w.PickleAPI.relayDraw('m',{expectedVersion:1});assert.deepEqual([...draw.relayOrderA].sort(),['AB','BC','CA']);assert.deepEqual([...draw.relayOrderB].sort(),['AB','BC','CA']);assert.ok(draw.relayDrawnAt);
 await assert.rejects(()=>w.PickleAPI.relayDraw('m',{expectedVersion:1}),{message:'VERSION_CONFLICT'});
 await w.PickleAPI.point('m',{side:'A',delta:1,expectedVersion:2});await w.PickleAPI.undo('m');await w.PickleAPI.resetMatch('m');
 assert.deepEqual(JSON.parse(saved).matches[0].relayOrderA,[...draw.relayOrderA]);await assert.rejects(()=>w.PickleAPI.relayDraw('m',{expectedVersion:JSON.parse(saved).matches[0].version}),{message:'RELAY_DRAW_LOCKED'});
 await w.PickleAPI.point('m',{side:'B',delta:27});const done=await w.PickleAPI.finishMatch('m');assert.equal(done.winner,'b');assert.deepEqual([...done.sets[0]],[0,27]);
});
