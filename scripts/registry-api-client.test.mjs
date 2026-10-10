import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
const source=await readFile(new URL('../assets/api.js',import.meta.url),'utf8');
function client(response){
  const context={window:{},localStorage:{getItem:()=>null,removeItem(){},setItem(){}},location:{pathname:'/admin.html'},fetch:async()=>response,Error};
  vm.runInNewContext(source,context);return context.window.PickleAPI;
}
for(const status of [200,500])test(`aborted JSON body (${status}) rejects instead of returning an empty state`,async()=>{
  const abort=new DOMException('The response body was aborted.','AbortError');
  const response=new Response(new ReadableStream({start(controller){controller.error(abort)}}),{status});
  await assert.rejects(client(response).adminState(),e=>e===abort);
});
test('a non-JSON server error still exposes the request status',async()=>{
  await assert.rejects(client(new Response('<h1>Unavailable</h1>',{status:503})).adminState(),e=>e.message==='REQUEST_FAILED'&&e.status===503);
});
test('an empty no-content response remains supported',async()=>{
  assert.equal(JSON.stringify(await client(new Response(null,{status:204})).request('/api/auth/logout',{method:'POST'})),'{}');
});
