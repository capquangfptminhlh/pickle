import test from "node:test";
import assert from "node:assert/strict";
import {previewOpenPlayRounds} from "../shared/open-play-rounds.js";
const roster=n=>Array.from({length:n},(_,i)=>({id:"p"+String(i).padStart(3,"0"),rating:i%2?2.7:2.5}));
const allAssigned=round=>round.courts.flatMap(c=>[...c.teamA.playerIds,...c.teamB.playerIds]);

test("four players rotate all three unique doubles partnerships",()=>{
 const result=previewOpenPlayRounds(roster(4).map(p=>({...p,rating:2.5})),{rounds:3,courtCount:1,maxCombinedRating:5.2});
 assert.equal(result.rounds.length,3);
 const pairs=result.rounds.flatMap(r=>r.courts.flatMap(c=>[c.teamA,c.teamB]));
 assert.equal(pairs.length,6);
 assert.equal(new Set(pairs.map(p=>[...p.playerIds].sort().join("|"))).size,6);
 for(const round of result.rounds){
   assert.equal(round.courts.length,1);
   assert.equal(new Set(allAssigned(round)).size,4);
   assert.equal(round.waitingIds.length,0);
   assert.ok(round.courts[0].teamA.combinedRating<=5.2);
   assert.ok(round.courts[0].teamB.combinedRating<=5.2);
 }
 assert.equal(result.fairGamesSpread,0);
 assert.equal(result.previewOnly,true);
});
test("one virtual court rotates benches fairly for six players",()=>{
 const result=previewOpenPlayRounds(roster(6),{rounds:3,courtCount:1,maxCombinedRating:5.2});
 for(const round of result.rounds){
   assert.equal(round.courts.length,1);
   assert.equal(round.waitingIds.length,2);
   assert.equal(new Set([...allAssigned(round),...round.waitingIds]).size,6);
 }
 assert.equal(result.fairGamesSpread,0);
 assert.ok(result.gamesByPlayer.every(p=>p.games===2));
});
test("no player is assigned twice per round; deterministic for reversed inputs",()=>{
 const input=roster(24);
 const options={rounds:5,courtCount:3,maxCombinedRating:5.2};
 const a=previewOpenPlayRounds(input,options);
 assert.deepEqual(previewOpenPlayRounds([...input].reverse(),options),a);
 for(const round of a.rounds){
   assert.equal(round.courts.length,3);
   assert.equal(allAssigned(round).length,12);
   assert.equal(new Set(allAssigned(round)).size,12);
   assert.equal(round.waitingIds.length,12);
 }
 assert.equal(a.fairGamesSpread<=1,true);
});
test("all virtual court teams obey total rating cap and tolerance",()=>{
 const input=[
  {id:"a",rating:2.5},{id:"b",rating:2.6},
  {id:"c",rating:2.7},{id:"d",rating:2.7},
  {id:"e",rating:2.5},{id:"f",rating:2.6}
 ];
 const result=previewOpenPlayRounds(input,{rounds:4,courtCount:1,maxCombinedRating:5.2,tolerance:0.2});
 for(const round of result.rounds)for(const court of round.courts){
   assert.ok(court.teamA.combinedRating<=5.4+1e-9);
   assert.ok(court.teamB.combinedRating<=5.4+1e-9);
 }
});
test("invalid round/court options and duplicate players are rejected",()=>{
 assert.throws(()=>previewOpenPlayRounds(roster(4),{rounds:0}),/INVALID_OPEN_PLAY_ROUNDS/);
 assert.throws(()=>previewOpenPlayRounds(roster(4),{rounds:13}),/INVALID_OPEN_PLAY_ROUNDS/);
 assert.throws(()=>previewOpenPlayRounds(roster(4),{rounds:"2.5"}),/INVALID_OPEN_PLAY_ROUNDS/);
 assert.throws(()=>previewOpenPlayRounds(roster(4),{courtCount:0}),/INVALID_OPEN_PLAY_COURT_COUNT/);
 assert.throws(()=>previewOpenPlayRounds(roster(4),{courtCount:33}),/INVALID_OPEN_PLAY_COURT_COUNT/);
 assert.throws(()=>previewOpenPlayRounds([{id:"a",rating:2},{id:"a",rating:2}]),/DUPLICATE_PLAYER/);
});
test("insufficient legal partners never manufactures an invalid match",()=>{
 const result=previewOpenPlayRounds([{id:"a",rating:2.5},{id:"b",rating:7},{id:"c",rating:7},{id:"d",rating:7}],{rounds:2,courtCount:1,maxCombinedRating:5.2});
 assert.ok(result.rounds.every(r=>r.courts.length===0&&r.waitingIds.length===4));
});
test("256-player preview remains bounded and respects virtual court cap",()=>{
 const result=previewOpenPlayRounds(roster(256),{rounds:2,courtCount:32,maxCombinedRating:5.2});
 assert.equal(result.rounds.length,2);
 assert.ok(result.rounds.every(r=>r.courts.length===32));
 assert.ok(result.rounds.every(r=>new Set(allAssigned(r)).size===128));
});
