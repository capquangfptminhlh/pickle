import test from "node:test";
import assert from "node:assert/strict";
import {hashPassword,verifyPassword} from "../src/auth.js";

test("password hashes stay within the Cloudflare Workers PBKDF2 limit",async()=>{
  const password="correct horse battery staple";
  const hash=await hashPassword(password);
  const [,iterations]=hash.split("$");

  assert.equal(Number(iterations),100000);
  assert.equal(await verifyPassword(password,hash),true);
  assert.equal(await verifyPassword("wrong password",hash),false);
});
