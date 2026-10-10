import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const smoke=await readFile(new URL('../scripts/smoke.mjs',import.meta.url),'utf8');
const assertion=smoke.split('\n').find(line=>line.startsWith('assert(refereePage.'));
test('courtside static smoke checks functional shell across translated labels',async()=>{
 const shell=await readFile(new URL('../../referee.html',import.meta.url),'utf8');
 for(const refereePage of [shell,shell.replace('TRỌNG TÀI · COURTSIDE','REFEREE COURTSIDE')])vm.runInNewContext(assertion,{refereePage,assert:(value,message)=>assert.ok(value,message)});
 assert.throws(()=>vm.runInNewContext(assertion,{refereePage:'<h1>REFEREE COURTSIDE</h1>',assert:(value,message)=>assert.ok(value,message)}),/referee courtside static page served/);
});
