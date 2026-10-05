import test from "node:test";
import assert from "node:assert/strict";
import {rankGroupStandings} from "../../shared/standings.js";

const t=(id,w,extra={})=>({id,name:id,status:"active",w,l:0,sw:0,sl:0,pf:0,pa:0,seed:99,...extra});
const m=(a,b,winner,sets=[[11,5]])=>({a,b,winner,sets,status:"completed",stage:"Bảng A",bracketSlot:null});

test("two-way tie uses head-to-head before aggregate differential",()=>{
  const a=t("A",2,{sw:4,sl:1,pf:50,pa:20}),b=t("B",2,{sw:2,sl:2,pf:35,pa:30});
  assert.deepEqual(rankGroupStandings([a,b],[m("A","B","B",[[9,11]])]).map(x=>x.id),["B","A"]);
});

test("three-way tie uses mini-table before overall stats",()=>{
  const a=t("A",2,{sw:6,sl:1,pf:70,pa:30}),b=t("B",2,{sw:4,sl:2,pf:55,pa:40}),c=t("C",2,{sw:3,sl:3,pf:50,pa:45});
  const matches=[m("A","B","B",[[9,11]]),m("B","C","B",[[11,4]]),m("C","A","C",[[11,6]])];
  assert.deepEqual(rankGroupStandings([a,b,c],matches).map(x=>x.id)[0],"B");
});

test("withdrawn teams are excluded from ranking",()=>{
  const a=t("A",1),b={...t("B",3),status:"withdrawn"};
  assert.deepEqual(rankGroupStandings([a,b],[]).map(x=>x.id),["A"]);
});
