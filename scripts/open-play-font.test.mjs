import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
const load=p=>readFile(new URL(p,root),"utf8");

test("Open Play uses Vietnamese-capable sport-display and clean UI font stacks",async()=>{
 const [css,admin,discover,simulator]=await Promise.all([
  load("assets/open-play-ui.css"),
  load("open-play-admin.html"),
  load("open-play-discover.html"),
  load("open-play.html")
 ]);
 assert.match(css,/family=Barlow\+Condensed/);
 assert.match(css,/family=Plus\+Jakarta\+Sans/);
 assert.match(css,/display=swap/);
 assert.match(css,/--op-font-body:"Plus Jakarta Sans"/);
 assert.match(css,/--op-font-display:"Barlow Condensed"/);
 assert.match(css,/\.op-hero h1\{font-family:var\(--op-font-display\)/);
 assert.match(css,/body,button,input,select,textarea\{font-family:var\(--op-font-body\)/);
 assert.match(css,/@media\(max-width:600px\)/);
 assert.match(css,/@media\(max-width:420px\)/);
 for(const page of [admin,discover]){
  assert.match(page,/assets\/open-play-ui\.css/);
  assert.match(page,/rel="preconnect" href="https:\/\/fonts\.googleapis\.com"/);
 }
 assert.match(simulator,/family=Barlow\+Condensed/);
 assert.match(simulator,/family=Plus\+Jakarta\+Sans/);
 assert.match(simulator,/font-family:'Barlow Condensed'/);
 assert.doesNotMatch(css,/@font-face\s*\{[^}]*data:/);
});
