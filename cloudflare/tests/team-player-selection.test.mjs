import test from "node:test";
import assert from "node:assert/strict";
import {normalizePlayerIds,validatePlayerIds,playerCountRange} from "../../shared/team-player-selection.js";

test("normalizes distinct non-empty player ids",()=>{
  assert.deepEqual(normalizePlayerIds([" p1 ","p2","p1",""]),["p1","p2"]);
});

test("defines player count by event type",()=>{
  assert.deepEqual(playerCountRange("singles"),{min:1,max:1});
  assert.deepEqual(playerCountRange("doubles"),{min:2,max:2});
  assert.deepEqual(playerCountRange("mixed_doubles"),{min:2,max:2});
  assert.deepEqual(playerCountRange("team"),{min:1,max:4});
});

test("rejects missing, duplicate, and invalid counts",()=>{
  assert.throws(()=>validatePlayerIds("singles",[]),{message:"PLAYER_SELECTION_REQUIRED"});
  assert.throws(()=>validatePlayerIds("doubles",["p1","p1"]),{message:"DUPLICATE_PLAYER_SELECTION"});
  assert.throws(()=>validatePlayerIds("doubles",["p1"]),{message:"INVALID_PLAYER_COUNT"});
  assert.deepEqual(validatePlayerIds("doubles",["p1","p2"]),["p1","p2"]);
});
