import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const code=readFileSync(new URL('../assets/match-live.js',import.meta.url),'utf8');
async function render(overrides){
  const elements=new Map(),get=s=>{if(!elements.has(s))elements.set(s,{});return elements.get(s)};
  const match={id:'m',divisionId:'d',a:'a',b:'b',status:'done',winner:'a',current:[0,0],sets:[[27,24]],stage:'Chung kết',bracketSlot:'B-SE-R2-M1',bracketSeries:'B',...overrides};
  const state={matches:[match],teams:[{id:'a',name:'An / Bình / Chi'},{id:'b',name:'Dũng / Giang / Hà'}],divisions:[{id:'d',tournamentId:'t'}],tournaments:[{id:'t',name:'Giải thử'}],courts:[]};
  vm.runInNewContext(code,{window:{PickleAPI:{publicState:async()=>state}},document:{querySelector:get},location:{search:'?id=m'},URLSearchParams,Date,setTimeout,clearTimeout});
  await new Promise(resolve=>setImmediate(resolve));return get;
}
test('public QR completed score uses persisted points and identifies its series and winning team',async()=>{
  const get=await render({});
  assert.equal(String(get('#matchScoreA').textContent),'27');assert.equal(String(get('#matchScoreB').textContent),'24');
  assert.equal(get('#matchTeamA').textContent,'An / Bình / Chi');assert.match(get('#matchStage').textContent,/Serie B/);
  assert.equal(get('#serveInfo').hidden,false);assert.match(get('#serveInfo').textContent,/An \/ Bình \/ Chi.*thắng trận/);
});
test('public QR live game keeps current score and completed best-of-three shows last set',async()=>{
  let get=await render({status:'live',winner:null,current:[8,7],sets:[]});assert.equal(String(get('#matchScoreA').textContent),'8');
  get=await render({sets:[[11,7],[8,11],[11,9]]});assert.equal(String(get('#matchScoreA').textContent),'11');assert.equal(String(get('#matchScoreB').textContent),'9');
});
test('public QR special results never invent a 0–0 score',async()=>{
  const get=await render({resultReason:'retired',sets:[]});assert.equal(get('#matchScoreA').textContent,'—');assert.equal(get('#matchScoreB').textContent,'—');
});
