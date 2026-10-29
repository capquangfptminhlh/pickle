import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,existsSync} from "node:fs";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";

const root=fileURLToPath(new URL("../",import.meta.url));
const publicRoutes=["index.html","about.html","tournament.html","ranking.html","player.html","submit-tournament.html","login.html","checkin.html"];
const openRoutes=["open-play-admin.html","open-play-discover.html","open-play-referee.html","open-play.html"];
const scores=["referee.html","court-board.html","court-timeline.html","match.html"];
const routes=[...publicRoutes,...openRoutes,...scores,"admin.html"];
const read=p=>readFileSync(resolve(root,p),"utf8");
const css=read("assets/arena-suite-2026.css");

test("Every primary PickleUp route loads the unified Arena UI stylesheet",()=>{
  for(const file of routes){
    const html=read(file);
    assert.match(html,/<body[^>]*\barena-360\b/,file+" missing body scope");
    assert.match(html,/assets\/arena-suite-2026\.css\?v=1/,file+" missing shipped stylesheet");
    assert.ok(html.indexOf("assets/arena-suite-2026.css")<html.indexOf("</head>"),file+" stylesheet not loaded in head");
    assert.match(html,/<meta[^>]+name="viewport"/,file+" missing mobile viewport");
    assert.match(html,/<html[^>]+lang="vi"/,file+" missing Vietnamese language");
  }
});
test("Arena CSS covers actual app surfaces and accessibility",()=>{
  for(const cls of ["arena-flow-nav","arena-op","arena-admin","arena-public","arena-score","arena-board","arena-utility"]){
    assert.ok(css.includes(cls),"Missing suite style "+cls);
  }
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/focus-visible/);
  assert.match(css,/@media\(max-width:760px\)/);
});
test("Open Play operational stage shortcuts are not dead links",()=>{
  const html=read("open-play-admin.html");
  const nav=html.match(/<nav class="arena-flow-nav"[\s\S]*?<\/nav>/);
  assert.ok(nav,"Missing studio stage navigator");
  const targets=[...nav[0].matchAll(/href="#([^"]+)"/g)].map(m=>m[1]);
  assert.equal(targets.length,8);
  for(const id of targets)assert.ok(html.includes('id="'+id+'"'),"Dead Studio anchor "+id);
});
test("Open Play discovery shortcuts target actual sections",()=>{
  const html=read("open-play-discover.html");
  for(const id of ["sessionsPanel","registrations","myWaitlist","myMatches"]){
    assert.ok(html.includes('href="#'+id+'"'),"Missing shortcut "+id);
    assert.ok(html.includes('id="'+id+'"'),"Missing section "+id);
  }
});
test("Cross-module navigation routes exist",()=>{
  for(const file of ["open-play-admin.html","open-play-discover.html","open-play-referee.html","admin.html","court-timeline.html"]){
    const html=read(file);
    for(const a of html.matchAll(/\bhref="(\/?(?:open-play|court|referee|ranking|admin)[^"#?]*\.html)"/g)){
      const route=a[1].replace(/^\//,"");
      assert.ok(existsSync(resolve(root,route)),file+" has dead link to "+route);
    }
  }
});
test("Existing app hooks remain unique, preserving API/score flows",()=>{
  for(const file of routes){
    const ids=[...read(file).matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    assert.equal(new Set(ids).size,ids.length,file+" has duplicate IDs");
  }
  assert.match(read("index.html"),/id="publicTours"/);
  assert.match(read("admin.html"),/id="opsLauncher"/);
  assert.match(read("open-play-admin.html"),/id="confirmRounds"/);
  assert.match(read("tournament.html"),/id="tourBannerImage"/);
  assert.match(read("referee.html"),/data-rally="A"/);
  assert.match(read("referee.html"),/data-rally="B"/);
  assert.match(read("court-board.html"),/id="courtGrid"/);
});
