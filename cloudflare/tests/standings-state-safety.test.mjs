import test from 'node:test';
import assert from 'node:assert/strict';
import {scoringFixture} from './helpers/scoring-fixture.mjs';
import {loadState,loadPublicPlayer} from '../src/state.js';
import {rankGroupStandings} from '../../shared/standings.js';

test('imported walkovers count as wins and losses in organizer and public standings',async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'; UPDATE teams SET group_code='A'; UPDATE matches SET stage='Bảng A',status='walkover',winner_team_id='b' WHERE id='match'");
    for(const publicOnly of [false,true]){
      const state=await loadState(f.env,{publicOnly}),a=state.teams.find(t=>t.id==='a'),b=state.teams.find(t=>t.id==='b');
      assert.equal(b.w,1);assert.equal(a.l,1);assert.equal(b.standingRank,1);
      assert.equal(state.matches[0].status,'done');assert.equal(state.matches[0].courtState,'done');assert.equal(state.matches[0].resultReason,'walkover');
      assert.deepEqual([a.sw,a.sl,a.pf,a.pa,b.sw,b.sl,b.pf,b.pa],[0,0,0,0,0,0,0,0],'walkover must not invent scored sets');
    }
  }finally{f.db.close()}
});

test('legacy winner and loser bracket stages do not change pool standings',async()=>{
  const f=await scoringFixture();
  try{
    for(const stage of ['Nhánh thắng','Nhánh thua']){
      f.db.prepare("UPDATE matches SET stage=?,status='completed',winner_team_id='a' WHERE id='match'").run(stage);
      const state=await loadState(f.env);
      assert.equal(state.teams.find(t=>t.id==='a').w,0,stage);
      assert.equal(state.teams.find(t=>t.id==='b').l,0,stage);
    }
  }finally{f.db.close()}
});

test('an invalid legacy winner does not add two losses or break head-to-head ties',async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE matches SET stage='Bảng A',status='completed',winner_team_id='c' WHERE id='match'");
    const state=await loadState(f.env);
    assert.deepEqual(state.teams.map(t=>[t.w,t.l]),[[0,0],[0,0],[0,0]]);
    const teams=[{id:'a',name:'A',w:1,sw:1,sl:0,pf:11,pa:2},{id:'b',name:'B',w:1,sw:1,sl:0,pf:11,pa:9}];
    const matches=[{a:'a',b:'b',winner:'c',status:'done',stage:'Bảng A',sets:[[0,11]]}];
    assert.deepEqual(rankGroupStandings(teams,matches).map(t=>t.id),['a','b']);
  }finally{f.db.close()}
});

test('public player history counts a walkover without fabricating points',async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'; INSERT INTO players(id,full_name) VALUES('pa','Player A'),('pb','Player B'); INSERT INTO team_players(team_id,player_id) VALUES('a','pa'),('b','pb'); UPDATE matches SET stage='Bảng A',status='walkover',winner_team_id='b' WHERE id='match'");
    const a=await loadPublicPlayer(f.env,'pa'),b=await loadPublicPlayer(f.env,'pb');
    assert.equal(a.stats.losses,1);assert.equal(b.stats.wins,1);assert.equal(b.matches[0].won,true);assert.equal(a.matches[0].lost,true);
    assert.equal(b.stats.pointsFor,0);assert.equal(a.stats.pointsAgainst,0);
  }finally{f.db.close()}
});

for(const status of ['completed','walkover'])test('an imported '+status+' self-match contributes no standings or player win/loss',async()=>{
  const f=await scoringFixture();
  try{
    f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'; INSERT INTO players(id,full_name) VALUES('pa','Player A'); INSERT INTO team_players(team_id,player_id) VALUES('a','pa')");
    f.db.prepare("UPDATE matches SET stage='Bảng A',team_b_id='a',status=?,winner_team_id='a' WHERE id='match'").run(status);
    for(const publicOnly of [false,true]){
      const state=await loadState(f.env,{publicOnly});
      assert.deepEqual(state.teams.map(t=>[t.w,t.l]),[[0,0],[0,0],[0,0]],'one team cannot beat itself');
    }
    const player=await loadPublicPlayer(f.env,'pa');
    assert.equal(player.stats.wins,0);assert.equal(player.stats.losses,0);
    assert.equal(player.matches[0].won,false);assert.equal(player.matches[0].lost,false);
  }finally{f.db.close()}
});
