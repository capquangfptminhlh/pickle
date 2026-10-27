import test from "node:test";
import assert from "node:assert/strict";
import {buildOpenPlayPairs} from "../shared/open-play.js";
test("pairs remain in cap and are independent of input order",()=>{
 const input=[{id:"a",rating:2.5},{id:"b",rating:2.5},{id:"c",rating:3.1},{id:"d",rating:2.0}];
 const a=buildOpenPlayPairs(input,{maxCombinedRating:5.2});
 assert.equal(a.pairs.length,2);
 assert.deepEqual(buildOpenPlayPairs([...input].reverse(),{maxCombinedRating:5.2}),a);
 assert.ok(a.pairs.every(p=>p.combinedRating<=5.2));
});
test("odd roster leaves one and never duplicates members",()=>{
 const a=buildOpenPlayPairs([{id:"x",rating:2},{id:"y",rating:3},{id:"z",rating:3}],{maxCombinedRating:5.2});
 assert.equal(a.pairs.length,1); assert.equal(a.unpairedIds.length,1);
 assert.equal(new Set([...a.pairs.flatMap(p=>p.playerIds),...a.unpairedIds]).size,3);
});
test("tolerance is explicit, capped and not a hidden rating increase",()=>{
 const ps=[{id:"a",rating:2.6},{id:"b",rating:2.7}];
 assert.equal(buildOpenPlayPairs(ps,{maxCombinedRating:5.2}).pairs.length,0);
 assert.equal(buildOpenPlayPairs(ps,{maxCombinedRating:5.2,tolerance:0.2}).pairs.length,1);
});
test("rejects invalid or duplicated players and oversized batches",()=>{
 assert.throws(()=>buildOpenPlayPairs([{id:"a",rating:2},{id:"a",rating:2}]),/DUPLICATE_PLAYER/);
 assert.throws(()=>buildOpenPlayPairs([{id:"a",rating:"no"}]),/INVALID_PLAYER_RATING/);
 assert.throws(()=>buildOpenPlayPairs(Array.from({length:17},(_,i)=>({id:String(i),rating:2}))),/OPEN_PLAY_BATCH_TOO_LARGE/);
});
