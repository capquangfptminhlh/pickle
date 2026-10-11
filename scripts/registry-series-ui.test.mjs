import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';

const source=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
test('homepage qualification uses official standings for two- and three-way ties',()=>{
  const fn=source('assets/public.js').match(/function sortGroupTeams\(arr,matches\)\{[^\r\n]+/)[0];
  for(const count of [2,3]){
    const teams=Array.from({length:count},(_,i)=>({id:'t'+i,w:2,sw:count-i,sl:0,pf:30-i,pa:10,seed:i+1,standingRank:count-i}));
    const c={teams};vm.runInNewContext(fn+';result=sortGroupTeams(teams,[]);',c);
    assert.deepEqual(Array.from(c.result,t=>t.id),teams.slice().reverse().map(t=>t.id));
  }
});
test('Top 1 operator qualification lists first and third place without admitting runners-up',()=>{
  const code=source('assets/admin-app.js').match(/const qualifiers=groups\.flatMap[^\r\n]+/)[0];
  const c={d:{id:'d',seriesBEnabled:true},advanceCount:1,groups:['A','B'],rankTournamentGroup:(_id,g)=>[1,2,3].map(rank=>({id:g+rank}))};
  vm.runInNewContext(code+';result=qualifiers;',c);
  assert.deepEqual(JSON.parse(JSON.stringify(c.result.map(q=>[q.team.id,q.series]))),[['A1','A'],['A3','B'],['B1','A'],['B3','B']]);
});
test('division forms save separate Serie B qualification and bronze settings',()=>{
  const elements={ruleSeriesB:{checked:true},ruleSeriesBThird:{checked:true},ruleThird:{checked:false}};
  const c={window:{},document:{addEventListener(){},getElementById:id=>elements[id]}};
  vm.runInNewContext(source('assets/match-format.js'),c);
  const mf=c.window.PickleMatchFormat,html=mf.extraFieldsHtml('rule',{seriesBEnabled:true,seriesBThirdPlaceMatch:true});
  assert.match(html,/id="ruleSeriesB"/);assert.match(html,/hạng 3 mỗi bảng/i);
  const settings=mf.readExtra('rule');assert.equal(settings.seriesBEnabled,true);assert.equal(settings.seriesBThirdPlaceMatch,true);assert.equal(settings.thirdPlaceMatch,false);
  assert.match(mf.rulesSummary({seriesBEnabled:true,advanceCount:2}),/Serie B/);
});
function renderer(){const c={window:{}};vm.runInNewContext(source('assets/bracket-ui.js'),c);return c.window.PickleBracket}
const match=(id,series,slot,a,b,winner=null)=>({id,divisionId:'d',bracketSeries:series,bracketSlot:slot,a,b,winner,status:winner?'done':'wait',sets:winner?[[11,4]]:[],stage:'Chung kết'});
test('completed bracket cards show actual set points as well as game wins',()=>{
  const m=match('final','A','SE-R1-M1','a','b','a');m.sets=[[27,24]];
  assert.match(renderer().render([m],id=>id),/Set 1: 27–24/);
  m.sets=[[11,7],[8,11],[11,9]];
  const html=renderer().render([m],id=>id);
  for(const score of ['Set 1: 11–7','Set 2: 8–11','Set 3: 11–9'])assert.ok(html.includes(score));
});
test('two series render independent rounds, bronze matches and champions',()=>{
  const api=renderer(),matches=[match('a-final','A','SE-R3-M1','a1','a2','a1'),match('a-bronze','A','SE-3RD-M1','a3','a4','a4'),match('b-s1','B','B-SE-R1-M1','b1','b4','b1'),match('b-s2','B','B-SE-R1-M2','b2','b3','b2'),match('b-final','B','B-SE-R2-M1','b1','b2','b2'),match('b-bronze','B','B-SE-3RD-M1','b3','b4','b3')];
  const html=api.render(matches,id=>id,{admin:false,seriesBEnabled:true});
  assert.equal((html.match(/data-bracket-series="A"/g)||[]).length,1);
  assert.equal((html.match(/data-bracket-series="B"/g)||[]).length,1);
  assert.equal((html.match(/bracket-third-place/g)||[]).length,2);
  assert.equal(api.champion(matches,id=>id,{series:'A'}),'a1');
  assert.equal(api.champion(matches,id=>id,{series:'B'}),'b2');
  assert.equal((html.match(/data-bracket-match="b-s[12]"/g)||[]).length,2);
  assert.doesNotMatch(html,/data-score-match/);
});
test('rank-three plan for four pools starts at semifinals and shows its own bronze game',()=>{
  const api=renderer(),teams=['A','B','C','D'].flatMap(group=>[1,2,3,4].map(n=>({id:group+n,group})));
  const html=api.renderPlan(teams,{advance:2,thirdPlace:true,seriesBEnabled:true,seriesBThirdPlaceMatch:true});
  const seriesB=html.split('data-bracket-series="B"')[1];
  assert.ok(seriesB,'Serie B needs a separate labelled plan');
  assert.match(seriesB,/Ba bảng A/);assert.match(seriesB,/Ba bảng D/);assert.doesNotMatch(seriesB,/Nhất bảng|Nhì bảng|Tứ kết/);
  assert.equal((seriesB.match(/bracket-plan-match/g)||[]).length,4,'two semis, one final, one bronze');
  assert.match(seriesB,/Thua Bán kết 1/);
});
test('legacy slots remain Serie A and division rounds are never mixed',()=>{
  const api=renderer(),a=match('legacy',undefined,'SE-R1-M1','a','b','a'),b={...match('other',undefined,'SE-R1-M1','c','d','d'),divisionId:'other'};
  assert.equal(api.champion([a],id=>id),'a');
  const html=api.render([a,b],id=>id,{divisionNames:{d:'Nội dung A',other:'Nội dung B'}});
  assert.match(html,/Nội dung A/);assert.match(html,/Nội dung B/);
  assert.equal((html.match(/bracket-tree/g)||[]).length,2);
});
test('a double elimination champion comes from the grand final, and single-series public results show a champion',()=>{
  const api=renderer(),wf=match('wf','A','DE-W-R3-M1','a','b','a'),gf=match('gf','A','DE-GF-M1','a','c');
  wf.stage='Chung kết nhánh thắng';
  assert.equal(api.champion([wf,gf],id=>id),'Chưa xác định');
  gf.winner='c';assert.equal(api.champion([wf,gf],id=>id),'c');
  assert.match(api.render([match('f','A','SE-R1-M1','a','b','a')],id=>id,{showChampions:true}),/VÔ ĐỊCH.*<strong>a<\/strong>/);
});

function preview({enabled=true,third=true,advance=2,groupSize=4}={}){
  const teams=['A','B','C','D'].flatMap(group=>Array.from({length:groupSize},(_,i)=>({id:group+(i+1),divisionId:'d',name:group+(i+1),group,seed:i+1,status:'active'})));
  const matches=[];
  for(const group of ['A','B','C','D'])for(let i=1;i<=groupSize;i++)for(let j=i+1;j<=groupSize;j++)matches.push({id:group+i+j,divisionId:'d',stage:'Bảng '+group,a:group+i,b:group+j,status:'done',winner:group+i,sets:[[11,4]],current:[0,0],version:1});
  let data=JSON.stringify({tournaments:[],divisions:[{id:'d',eventType:'doubles',format:'pool_to_knockout',advanceCount:advance,thirdPlaceMatch:true,seriesBEnabled:enabled,seriesBThirdPlaceMatch:third}],teams,matches,courts:[{id:'court'}],players:[],teamPlayers:{},clubs:[],ratingHistory:{},audit:[],registrations:[]});
  const c={window:{addEventListener(){},dispatchEvent(){}},CustomEvent:class{},crypto:webcrypto,localStorage:{getItem:()=>data,setItem:(_key,value)=>data=value},console,Date,Set,Map};
  vm.runInNewContext(source('preview/preview-api.js'),c);return {api:c.window.PickleAPI,read:()=>JSON.parse(data)};
}
test('preview generates rank-three Serie B and advancing B never fills A matches',async()=>{
  const f=preview(),result=await f.api.generateBracket('d'),state=f.read();
  assert.equal(result.seriesA.created,8);assert.equal(result.seriesB.created,4);assert.equal(result.created,12);
  const b=state.matches.filter(m=>m.bracketSeries==='B');assert.equal(b.length,4);
  assert.deepEqual(b.filter(m=>m.bracketSlot.startsWith('B-SE-R1-')).flatMap(m=>[m.a,m.b]).sort(),['A3','B3','C3','D3']);
  const beforeA=state.matches.filter(m=>m.bracketSlot?.startsWith('SE-'));
  const semis=b.filter(m=>m.bracketSlot.startsWith('B-SE-R1-'));
  await f.api.quickScore(semis[0].id,{sets:[[11,2]]});await f.api.quickScore(semis[1].id,{sets:[[2,11]]});
  const after=f.read(),final=after.matches.find(m=>m.bracketSlot==='B-SE-R2-M1'),bronze=after.matches.find(m=>m.bracketSlot==='B-SE-3RD-M1');
  assert.deepEqual([final.a,final.b],[semis[0].a,semis[1].b]);assert.deepEqual([bronze.a,bronze.b],[semis[0].b,semis[1].a]);
  assert.deepEqual(after.matches.filter(m=>m.bracketSlot?.startsWith('SE-')),beforeA);
});
test('preview respects main qualification count and disabling Serie B',async()=>{
  const f=preview({enabled:false,advance:1}),r=await f.api.generateBracket('d');
  assert.equal(r.qualifiers.length,4);assert.equal(f.read().matches.some(m=>m.bracketSeries==='B'),false);
});
test('preview rejects invalid Serie B before replacing an existing bracket',async()=>{
  const f=preview(),before=await f.api.generateBracket('d');assert.ok(before.created);
  await assert.rejects(()=>f.api.updateDivisionFull('d',{seriesBEnabled:false}),{message:'BRACKET_SETTINGS_LOCKED'});
  const invalid=preview({advance:3});const initial=invalid.read();
  await assert.rejects(()=>invalid.api.generateBracket('d'),{message:'SERIES_B_ADVANCE_COUNT_OVERLAP'});assert.deepEqual(invalid.read(),initial);
  const small=preview({groupSize:2});await assert.rejects(()=>small.api.generateBracket('d'),{message:'NOT_ENOUGH_SERIES_B_QUALIFIERS'});
});
test('preview draw configuration persists both series options',async()=>{
  const f=preview({enabled:false}),d=await f.api.drawConfig('d');assert.equal(d.seriesBEnabled,false);
  await f.api.saveDrawConfig('d',{mode:'random',groupCount:4,teamsPerGroup:4,advanceCount:2,courtIds:['court'],seriesBEnabled:true,seriesBThirdPlaceMatch:true});
  assert.equal((await f.api.drawConfig('d')).seriesBThirdPlaceMatch,true);assert.equal(f.read().divisions[0].seriesBEnabled,true);
  await assert.rejects(()=>f.api.updateDivision('d',{advanceCount:3}),{message:'SERIES_B_ADVANCE_COUNT_OVERLAP'});
});
