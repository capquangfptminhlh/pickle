import assert from "node:assert/strict";
import {test} from "node:test";
import {buildCourtTimeline,sortTimelineMatches,isLiveTimelineMatch,filterTimelineMatches} from "../assets/court-timeline-model.mjs";
const fixture={
 tournaments:[{id:"a",name:"Giải A"},{id:"b",name:"Giải riêng"}],
 divisions:[{id:"d",tournamentId:"a"},{id:"private",tournamentId:"b"}],
 courts:[{id:"c2",tournamentId:"a",name:"Sân 2",sortOrder:2},{id:"c1",tournamentId:"a",name:"Sân 1",sortOrder:1},{id:"c3",tournamentId:"a",active:false}],
 matches:[
 {id:"scheduled",divisionId:"d",courtId:"c1",status:"wait",courtState:"scheduled",scheduledAt:"2026-10-28T09:00:00Z"},
 {id:"live",divisionId:"d",courtId:"c1",status:"live",scheduledAt:"2026-10-28T10:00:00Z"},
 {id:"unplaced",divisionId:"d",courtId:null,status:"wait"},
 {id:"inactive",divisionId:"d",courtId:"c3",status:"wait"},
 {id:"complete",divisionId:"d",courtId:"c1",status:"done"},
 {id:"other",divisionId:"private",courtId:"c1",status:"wait"}
 ]};
test("render only target tournament, ordered courts, live before scheduled and no completed",()=>{
 const result=buildCourtTimeline(fixture,"a");
 assert.deepEqual(result.columns.map(x=>x.court.name),["Sân 1","Sân 2"]);
 assert.deepEqual(result.columns[0].matches.map(x=>x.id),["live","scheduled"]);
 assert.deepEqual(result.unplaced.map(x=>x.id),["inactive","unplaced"]);
 assert.deepEqual(result.summary,{activeCourts:2,total:4,assigned:2,unplaced:2,live:1});
});
test("unknown tournaments do not leak alternate event details",()=>{
 assert.equal(buildCourtTimeline(fixture,"not-public"),null);
 assert.equal(buildCourtTimeline({tournaments:[]},undefined),null);
});
test("mixed and malformed date values sort predictably",()=>{
 const matches=[{id:"b",scheduledAt:"invalid"},{id:"a",scheduledAt:"2026-10-29T10:00:00Z"},{id:"c",scheduledAt:"2026-10-28T10:00:00Z"}];
 assert.deepEqual(sortTimelineMatches(matches).map(m=>m.id),["c","a","b"]);
});
test("no courts is a real unplaced queue rather than a synthetic court",()=>{
 const s={...fixture,courts:[]};
 const a=buildCourtTimeline(s,"a");
 assert.equal(a.columns.length,0);
 assert.equal(a.unplaced.length,4);
 assert.equal(a.summary.assigned,0);
});

test("snake_case live state matches summary, filter, priority and pending complement",()=>{
 const s={
  tournaments:[{id:"t",name:"Đôi tự do"}],
  divisions:[{id:"d",tournament_id:"t"}],
  courts:[{id:"court",tournament_id:"t",name:"Sân 1"}],
  matches:[
   {id:"waiting",division_id:"d",court_id:"court",status:"wait",court_state:"scheduled"},
   {id:"snake-live",division_id:"d",court_id:"court",status:"wait",court_state:"live"},
   {id:"camel-live",division_id:"d",court_id:"court",status:"wait",courtState:"live"},
   {id:"status-live",division_id:"d",court_id:"court",status:"live"},
   {id:"unplaced-live",division_id:"d",court_id:null,status:"wait",court_state:"live"},
  ]
 };
 const timeline=buildCourtTimeline(s,"t");
 assert.equal(timeline.summary.live,4);
 assert.equal(timeline.summary.unplaced,1);
 assert.deepEqual(timeline.columns[0].matches.map(m=>m.id),["camel-live","snake-live","status-live","waiting"]);
 assert.deepEqual(filterTimelineMatches(timeline.columns[0].matches,"live").map(m=>m.id),["camel-live","snake-live","status-live"]);
 assert.deepEqual(filterTimelineMatches(timeline.columns[0].matches,"pending").map(m=>m.id),["waiting"]);
 assert.deepEqual(filterTimelineMatches(timeline.unplaced,"live").map(m=>m.id),["unplaced-live"]);
 assert.equal(isLiveTimelineMatch({status:"wait",court_state:"live"}),true);
 assert.equal(isLiveTimelineMatch({status:"wait",court_state:"scheduled"}),false);
});
