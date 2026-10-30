import { readFileSync } from "node:fs";

const expected = JSON.parse(readFileSync(new URL("../cloudflare/public/release.json", import.meta.url), "utf8")).version;
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

let lastError = "";
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const release = JSON.parse(await fetchText("/release.json", attempt));
    console.log("EXPECTED=" + expected + " LIVE=" + release.version);
    if (release.version !== expected) throw Error("Production release mismatch");

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
