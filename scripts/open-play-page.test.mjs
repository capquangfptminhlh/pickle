import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const root=new URL("../",import.meta.url);
test("Open Play entrypoint is a mobile-friendly no-write simulator",async()=>{
 const html=await readFile(new URL("open-play.html",root),"utf8");
 const code=await readFile(new URL("assets/open-play-page.js",root),"utf8");
 assert.match(html,/name="viewport"/);
 assert.match(html,/role="status"/);
 assert.match(html,/type="module" src="assets\/open-play-page.js"/);
 assert.match(code,/buildOpenPlayPairs/);
 assert.doesNotMatch(code,/\bfetch\s*\(|localStorage|sessionStorage|XMLHttpRequest/);
});
