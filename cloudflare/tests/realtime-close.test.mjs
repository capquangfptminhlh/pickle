import test from 'node:test';
import assert from 'node:assert/strict';
import {TournamentRoom} from '../src/realtime.js';
const room=()=>new TournamentRoom({},{});
for(const code of [1000,1001])test(`realtime reciprocates client close ${code}`,async()=>{
  const calls=[];await room().webSocketClose({close:(...args)=>calls.push(args)},code,'Client left',true);
  assert.deepEqual(calls,[[code,'Client left']]);
});
test('empty or abnormal close codes are not sent as invalid wire codes',async()=>{
  for(const code of [1005,1006,1015]){
    const calls=[];await room().webSocketClose({close:(...args)=>calls.push(args)},code,'',false);
    assert.deepEqual(calls,[[1000,'']]);
  }
});
test('already closed sockets do not produce uncaught close errors',async()=>{
  await assert.doesNotReject(()=>room().webSocketClose({close(){throw new Error('Already closed')}},1000,'',true));
});
