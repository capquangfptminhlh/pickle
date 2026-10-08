import test from "node:test";
import assert from "node:assert/strict";
import {readdirSync,readFileSync,statSync} from "node:fs";

// assets/api.js posterSources() points cards and the tournament page at
// <name>-640.webp / <name>-1024.webp for every repo poster. A poster added
// without its variants would render broken, so require them here
// (generate with: cd cloudflare && node scripts/poster-variants.mjs).
const dir=new URL("../assets/tournaments/",import.meta.url);
const posters=readdirSync(dir).filter(f=>f.endsWith("-original.jpg"));

test("every repo poster ships valid, smaller 640 and 1024 WebP variants",()=>{
  assert.ok(posters.length>0,"expected at least one repo poster");
  for(const file of posters){
    const original=statSync(new URL(file,dir)).size;
    for(const width of [640,1024]){
      const name=file.replace(/-original\.jpg$/,`-${width}.webp`);
      const bytes=readFileSync(new URL(name,dir));
      assert.equal(bytes.subarray(0,4).toString("latin1"),"RIFF",name);
      assert.equal(bytes.subarray(8,12).toString("latin1"),"WEBP",name);
      assert.ok(bytes.length<original,`${name} should be smaller than ${file}`);
    }
  }
});
