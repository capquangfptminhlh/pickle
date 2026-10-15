import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=file=>readFileSync(new URL("../"+file,import.meta.url),"utf8");
const css={public:read("assets/public-refresh.css"),site:read("assets/site-sport.css"),admin:read("assets/admin-sport.css"),referee:read("assets/referee-arena.css")};

test("mobile docks fit their content plus iPhone Home indicator",()=>{
  assert.match(css.public,/public-mobile-dock\s*\{[^}]*height:auto!important;[^}]*min-height:calc\(66px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css.public,/public-mobile-dock\s*\{[^}]*padding:6px 8px calc\(8px \+ env\(safe-area-inset-bottom,0px\)\)/);
  assert.match(css.admin,/\.mobile-dock\s*\{[^}]*height:auto!important;[^}]*safe-area-inset-bottom/);
  assert.match(css.referee,/\.ref-bottom-actions\s*\{[^}]*bottom:0!important;[^}]*safe-area-inset-bottom/);
  assert.match(css.site,/public-body:not\(\.public-refresh\) \.public-mobile-dock\s*\{[^}]*height:auto!important/);
});

test("standalone header, editor dialogs, score console honor iOS safe-area insets",()=>{
  assert.match(css.public,/\.public-header\s*\{[^}]*safe-area-inset-top/);
  assert.match(css.admin,/\.topbar\s*\{[^}]*safe-area-inset-top/);
  assert.match(css.admin,/\.sidebar\s*\{[^}]*safe-area-inset-bottom/);
  assert.match(css.admin,/\.generic-dialog\[open\]\)\s*\{[^}]*safe-area-inset-top/);
  assert.match(css.referee,/\.courtside-top\s*\{[^}]*safe-area-inset-top/);
});

test("all shell pages and installed PWA use refreshed safe-area asset versions",()=>{
  const versions=[["site-sport.css","10"],["public-refresh.css","2"],["admin-sport.css","7"],["referee-arena.css","5"]];
  const pages=["index.html","about.html","admin.html","referee.html","tournament.html","ranking.html","player.html","submit-tournament.html","login.html","checkin.html","court-board.html","match.html","offline.html","legacy-migrate.html"];
  for(const path of pages){
    const html=read(path);
    assert.match(html,/viewport-fit=cover/,path+" needs the standalone viewport");
    for(const [filename,version] of versions){
      if(html.includes("assets/"+filename+"?v="))assert.ok(html.includes("assets/"+filename+"?v="+version),path+" has stale "+filename);
    }
  }
  const worker=read("service-worker.js");
  const version=worker.match(/const VERSION="pickleup-v(\d+)-/);assert.ok(version&&Number(version[1])>=80,"PWA cache must be v80 or newer");
  for(const [filename,version] of versions)assert.ok(worker.includes("/assets/"+filename+"?v="+version),"precache "+filename);
});
