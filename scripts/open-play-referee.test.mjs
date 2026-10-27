import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
test("Open Play referee screen is isolated and does not provide organizer endpoints",async()=>{
 const [html,script,staff]=await Promise.all([
  readFile(new URL("open-play-referee.html",root),"utf8"),
  readFile(new URL("assets/open-play-referee.js",root),"utf8"),
  readFile(new URL("assets/open-play-admin.js",root),"utf8")
 ]);
 assert.match(html,/lang="vi"/);
 assert.match(html,/id="matches"/);
 assert.match(html,/id="loginLink"/);
 assert.match(html,/assets\/open-play-referee.js/);
 assert.match(script,/user\.role!=="referee"/);
 assert.match(script,/\/api\/open-play\/referee\/matches/);
 assert.match(script,/version:m\.version/);
 assert.match(script,/Kết thúc trận/);
 assert.doesNotMatch(script,/\.innerHTML\s*=/);
 assert.doesNotMatch(script,/localStorage\.setItem/);
 assert.doesNotMatch(script,/\/correction"/);
 assert.match(staff,/\/api\/open-play\/referees/);
 assert.match(staff,/\/referee"/);
 assert.match(staff,/refereeSuggestions/);
});
