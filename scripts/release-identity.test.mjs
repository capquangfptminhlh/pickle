import test from "node:test";
import assert from "node:assert/strict";
import {verifyReleaseIdentity} from "./release-identity.mjs";

const version = "pickleup-v86-d9cf8cc34ce5b77b";
const sha = "a".repeat(40);
const other = "b".repeat(40);
test("matching asset version and commit passes", () => {
  assert.equal(verifyReleaseIdentity({version,git_sha:sha},{version,git_sha:sha}),true);
});
test("same assets but stale production commit fails", () => {
  assert.throws(() => verifyReleaseIdentity({version,git_sha:sha},{version,git_sha:other}),/Production commit mismatch/);
});
test("missing live commit fails closed", () => {
  assert.throws(() => verifyReleaseIdentity({version,git_sha:sha},{version}),/Production commit mismatch/);
});
test("missing expected SHA fails closed when run in CI", () => {
  assert.throws(() => verifyReleaseIdentity({version,git_sha:null},{version,git_sha:sha}),/missing or invalid/);
});
test("mismatched content revision fails even when commit matches", () => {
  assert.throws(() => verifyReleaseIdentity({version,git_sha:sha},{version:"pickleup-v86-other",git_sha:sha}),/Production release mismatch/);
});
test("local manual checks can omit SHA if explicitly requested", () => {
  assert.equal(verifyReleaseIdentity({version,git_sha:null},{version,git_sha:sha},{requireGitSha:false}),true);
});
