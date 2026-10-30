import { readFileSync } from "node:fs";
import { verifyReleaseIdentity } from "./release-identity.mjs";

const expectedRelease = JSON.parse(readFileSync(new URL("../cloudflare/public/release.json", import.meta.url), "utf8"));
const expected = expectedRelease.version;
const site = process.env.PICKLEUP_SITE || "https://pickleup.vn";
const base = new URL(site);
if (base.protocol !== "https:") throw Error("HTTPS required");

async function fetchText(path, attempt) {
  const url = new URL(path, base);
  url.searchParams.set("release_audit", String(attempt));
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
    headers: { "Cache-Control": "no-cache" },
  });
  if (!response.ok) throw Error(path + " HTTP " + response.status);
  return response.text();
}

// Pull requests have not been deployed: validate the generated release locally
// rather than comparing their changed assets against the current production site.
if (process.env.PICKLEUP_AUDIT_MODE === "local") {
  const localFile = path => readFileSync(new URL("../cloudflare/public/" + path, import.meta.url), "utf8");
  const html = localFile("index.html");
  if (!html.includes('name="pickleup-release" content="' + expected + '"')) {
    throw Error("Locally built homepage has an outdated release marker");
  }
  for (const [asset, marker] of [
    ["assets/arena-home-2026.css", "body.arena-home-2026"],
    ["assets/arena-suite-2026.css", ".arena-360"],
  ]) {
    if (!html.includes(asset)) throw Error("Locally built homepage does not include " + asset);
    if (!localFile(asset).includes(marker)) throw Error("Locally built Arena CSS invalid: " + asset);
  }
  if (!localFile("service-worker.js").includes('const VERSION="' + expected + '";')) {
    throw Error("Locally built service worker revision mismatch");
  }
  console.log("LOCAL_RELEASE_AUDIT_OK " + expected);
  process.exit(0);
}

let lastError = "";
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const release = JSON.parse(await fetchText("/release.json", attempt));
    console.log("EXPECTED=" + expected + " LIVE=" + release.version);
    verifyReleaseIdentity(expectedRelease, release, {
      requireGitSha: process.env.GITHUB_ACTIONS === "true" || Boolean(expectedRelease.git_sha),
    });
    if (expectedRelease.git_sha) console.log("LIVE_COMMIT_VERIFIED " + release.git_sha);

    const html = await fetchText("/", attempt);
    if (!html.includes('name="pickleup-release" content="' + expected + '"')) {
      throw Error("Homepage release meta tag is outdated");
    }

    for (const [path, marker] of [
      ["/assets/arena-home-2026.css", "body.arena-home-2026"],
      ["/assets/arena-suite-2026.css", ".arena-360"],
    ]) {
      if (!html.includes(path.slice(1))) throw Error("Homepage does not load " + path);
      const css = await fetchText(path, attempt);
      if (!css.includes(marker)) throw Error("Arena CSS is empty or unexpected: " + path);
      console.log("LIVE_ASSET_OK " + path);
    }

    const worker = await fetchText("/service-worker.js", attempt);
    if (!worker.includes('const VERSION="' + expected + '";')) {
      throw Error("Service worker version differs from deployed release");
    }
    console.log("LIVE_PWA_OK " + expected);
    console.log("PRODUCTION_RELEASE_AUDIT_OK " + expected);
    process.exit(0);
  } catch (error) {
    lastError = String(error);
    console.error("Attempt " + attempt + "/6: " + lastError);
    if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 3000));
  }
}

console.error("PRODUCTION_RELEASE_AUDIT_FAILED expected=" + expected + " reason=" + lastError);
process.exit(1);
