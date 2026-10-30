// A content fingerprint alone cannot prove that a source-only commit reached production.
// Require both the built asset version and the exact GitHub commit for CI deployments.
export function verifyReleaseIdentity(expected, live, {requireGitSha = true} = {}) {
  if (!expected || typeof expected.version !== "string" || !expected.version) {
    throw new Error("Expected release metadata has no version");
  }
  if (!live || live.version !== expected.version) {
    throw new Error("Production release mismatch: expected " + expected.version + " live " + (live?.version ?? "missing"));
  }
  if (requireGitSha) {
    if (typeof expected.git_sha !== "string" || !/^[0-9a-f]{40}$/.test(expected.git_sha)) {
      throw new Error("Expected Git commit SHA is missing or invalid");
    }
    if (live.git_sha !== expected.git_sha) {
      throw new Error("Production commit mismatch: expected " + expected.git_sha + " live " + (live.git_sha ?? "missing"));
    }
  } else if (expected.git_sha && live.git_sha !== expected.git_sha) {
    throw new Error("Production commit mismatch: expected " + expected.git_sha + " live " + (live.git_sha ?? "missing"));
  }
  return true;
}
