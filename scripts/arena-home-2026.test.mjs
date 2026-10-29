import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/arena-home-2026.css",import.meta.url),"utf8");

test("Arena homepage stylesheet is actually linked after the legacy layers",()=>{
  assert.match(html,/body class="[^"]*\barena-home-2026\b/);
  const newCss=html.indexOf('assets/arena-home-2026.css?v=1');
  const oldCss=html.indexOf('assets/public-refresh.css?v=2');
  assert.ok(newCss>oldCss,"arena design must win over old public CSS");
  assert.match(css,/\.desktop-hero-card/);
  assert.match(css,/\.arena-action-grid/);
  assert.match(css,/\.hero-live-card/);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/prefers-reduced-motion:reduce/);
});

test("player-first actions are real routes and live data hooks remain stable",()=>{
  for(const path of ["/open-play-discover.html","/open-play-admin.html","/open-play-referee.html","/submit-tournament.html"]){
    assert.ok(html.includes('href="'+path+'"'),path+" action missing");
  }
  for(const id of ["site-main","desktopLiveCount","desktopTournamentCount","desktopPlayerCount","desktopPostCount","desktopFeaturedName","heroLive","liveCount","publicTours","publicMatches","publicTopPlayers","publicStandings","publicBracket","publicNews","publicSponsors"]){
    const hits=html.match(new RegExp('id="'+id+'"',"g"))||[];
    assert.equal(hits.length,1,id+" should occur once");
  }
});

test("page has responsive hierarchy and does not claim phantom live matches",()=>{
  assert.ok(html.indexOf('id="open-play"')<html.indexOf('id="tournaments"'));
  assert.ok(html.indexOf('id="tournaments"')<html.indexOf('id="live"'));
  assert.match(html,/id="desktopLiveCount">0/);
  assert.match(html,/id="liveCount">0 trận/);
  assert.doesNotMatch(html,/href="#"/);
});