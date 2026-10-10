import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../assets/admin-app.js',import.meta.url),'utf8');
const snapshotSource=source.slice(source.indexOf('const TOURNAMENT_TERMINAL='),source.indexOf('function tournamentInsightPanel'));
function snapshot({format='pool_to_knockout',matches=[],status='draft',extraDivisions=[]}={}){
  const context={state:{divisions:[{id:'d',tournamentId:'t',format,active:true},...extraDivisions],teams:[{id:'a',divisionId:'d',name:'A'},{id:'b',divisionId:'d',name:'B'}],matches,teamPlayers:{}},window:{},teamName:id=>id};
  vm.runInNewContext(snapshotSource,context);
  return context.tournamentSnapshot({id:'t',status});
}
const pool={id:'pool',divisionId:'d',stage:'Bảng A',status:'done',winner:'a',a:'a',b:'b',sets:[[11,0]]};
const final={...pool,id:'final',stage:'Chung kết',bracketSlot:'SE-R2-M1'};
test('completed pools still need knockout; tournament must remain operable',()=>assert.equal(snapshot({matches:[pool]}).isComplete,false));
test('a completed final finishes its division',()=>assert.equal(snapshot({matches:[pool,final]}).isComplete,true));
test('round robin completes without a knockout',()=>assert.equal(snapshot({format:'round_robin',matches:[pool]}).isComplete,true));
test('unfinished third place keeps tournament active',()=>assert.equal(snapshot({matches:[pool,final,{...final,id:'third',stage:'Tranh hạng ba',status:'wait',winner:null}]}).isComplete,false));
test('another populated division with no matches prevents completion',()=>{
  const context={state:{divisions:[{id:'d',tournamentId:'t',format:'pool_to_knockout',active:true},{id:'d2',tournamentId:'t',format:'round_robin',active:true}],teams:[{id:'a',divisionId:'d',name:'A'},{id:'b',divisionId:'d2',name:'B'}],matches:[final],teamPlayers:{}},window:{},teamName:id=>id};
  vm.runInNewContext(snapshotSource,context);assert.equal(context.tournamentSnapshot({id:'t',status:'draft'}).isComplete,false);
});
test('an empty automatic division does not prevent a finished populated division',()=>assert.equal(snapshot({matches:[final],extraDivisions:[{id:'empty',tournamentId:'t',format:'pool_to_knockout',active:true}]}).isComplete,true));
test('explicitly completed historical tournaments remain in history',()=>assert.equal(snapshot({status:'completed'}).isComplete,true));
test('no matches is not a completed tournament',()=>assert.equal(snapshot().isComplete,false));
test('Postgres and preview double elimination finish at Chung kết tổng',()=>assert.equal(snapshot({format:'double_elimination',matches:[{...final,stage:'Chung kết tổng',bracketSlot:'DE-GF'}]}).isComplete,true));
test('winning the winners bracket is not winning double elimination',()=>assert.equal(snapshot({format:'double_elimination',matches:[{...final,stage:'Chung kết nhánh thắng',bracketSlot:'DE-W-R2-M1'}]}).isComplete,false));
