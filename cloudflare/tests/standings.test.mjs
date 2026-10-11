import test from "node:test";
import assert from "node:assert/strict";
import {rankGroupStandings} from "../../shared/standings.js";

const t=(id,w,extra={})=>({id,name:id,status:"active",w,l:0,sw:0,sl:0,pf:0,pa:0,seed:99,...extra});
const m=(a,b,winner,sets=[[11,5]])=>({a,b,winner,sets,status:"completed",stage:"Bảng A",bracketSlot:null});

test("two-way tie uses head-to-head before aggregate differential",()=>{
  const a=t("A",2,{sw:4,sl:1,pf:50,pa:20}),b=t("B",2,{sw:2,sl:2,pf:35,pa:30});
  assert.deepEqual(rankGroupStandings([a,b],[m("A","B","B",[[9,11]])]).map(x=>x.id),["B","A"]);
});

test("three-way tie uses only tied-team point differential",()=>{
  const a=t("A",2,{sw:6,sl:1,pf:70,pa:30}),b=t("B",2,{sw:4,sl:2,pf:55,pa:40}),c=t("C",2,{sw:3,sl:3,pf:50,pa:45});
  const matches=[m("A","B","B",[[9,11]]),m("B","C","B",[[11,4]]),m("C","A","C",[[11,6]])];
  assert.deepEqual(rankGroupStandings([a,b,c],matches).map(x=>x.id),["B","C","A"]);
});

test("withdrawn teams are excluded from ranking",()=>{
  const a=t("A",1),b={...t("B",3),status:"withdrawn"};
  assert.deepEqual(rankGroupStandings([a,b],[]).map(x=>x.id),["A"]);
});

 test("three tied teams use points before set differential and never pairwise head-to-head",()=>{
  const a=t("A",2,{sw:9,sl:1,pf:70,pa:60}),b=t("B",2,{sw:4,sl:2,pf:65,pa:40}),c=t("C",2,{sw:3,sl:3,pf:50,pa:30});
  const matches=[m("A","B","A",[[27,25]]),m("B","C","B",[[27,10]]),m("C","A","C",[[27,20]]),m("A","outside","A",[[27,0]])];
  for(const teams of [[a,b,c],[c,a,b],[b,c,a]])assert.deepEqual(rankGroupStandings(teams,matches).map(x=>x.id),["B","A","C"]);
 });
 test("four tied teams also use tied-team point differential",()=>{
  const teams=[t("A",1,{pf:10}),t("B",1,{pf:20}),t("C",1,{pf:30}),t("D",1,{pf:40})];
  assert.deepEqual(rankGroupStandings(teams,[m("A","D","A")]).map(x=>x.id),["A","C","B","D"]);
 });
 test("wins remain first and ties do not cross win buckets",()=>{
  const teams=[t("A",2,{pf:1}),t("B",1,{pf:100}),t("C",1,{pf:5})];
  assert.deepEqual(rankGroupStandings(teams,[m("B","C","C")]).map(x=>x.id),["A","C","B"]);
 });

test("three-way mini point difference takes priority over mini wins",()=>{
 const teams=[t("A",2),t("B",2),t("C",2)];
 const matches=[m("A","B","B",[[26,27]]),m("B","C","B",[[27,26]]),m("A","C","A",[[27,7]])];
 assert.deepEqual(rankGroupStandings(teams,matches).map(t=>t.id),["A","B","C"]);
});
