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

test('missing or duplicate skill roles never produce guessed relay pair names',()=>{
  for(const levels of [['B','B','B'],['A','A','C'],['A','B',''],['A','B','D']]){
    const state=fixture();state.players.forEach((p,i)=>p.skillLevel=levels[i]);
    const result=lineup.match('team',division,0,0,state);
    assert.equal(result.ready,false);assert.deepEqual([...result.names],[]);assert.match(result.identityWarning,/Trình/);
  }
});

test('updating player skill levels is recognized on the next state render',()=>{
  const state=fixture();state.players[2].skillLevel='B';
  assert.equal(lineup.match('team',division,0,0,state).ready,false);
  state.players[2].skillLevel='C';assert.equal(lineup.match('team',division,0,0,state).ready,true);
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
