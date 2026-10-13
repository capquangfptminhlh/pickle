import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

const read = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("GSAP is exact-pinned and vendored locally", async () => {
  const pkg = JSON.parse(await read("package.json"));
  assert.equal(pkg.dependencies.gsap, "3.15.0");
  const vendor = await read("assets/vendor/gsap-3.15.0.min.js");
  assert.match(vendor, /GreenSock|GSAP/);
  assert.ok(vendor.length > 50000, "vendor file contains the production runtime");
  assert.doesNotMatch(vendor, /[ \t]+$/m);
  assert.match(vendor, /[^\r\n]\r?\n$/, "vendor file ends with exactly one newline");
});
