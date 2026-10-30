import { readFileSync } from "node:fs";
const expected = JSON.parse(readFileSync(new URL("../cloudflare/public/release.json", import.meta.url), "utf8")).version;
const site = process.env.PICKLEUP_SITE || "https://pickleup.vn";
const base = new URL(site);
if (base.protocol !== "https:") throw Error("HTTPS required");
let last = "";
for (let attempt = 1; attempt <= 6; attempt++) {
  try {
    const url = new URL("/release.json", base);
    url.searchParams.set("audit", String(attempt));
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "Cache-Control": "no-cache" } });
    if (!response.ok) throw Error("HTTP " + response.status);
    const payload = await response.json();
    const live = payload.version;
    if (typeof live !== "string") throw Error("Missing live version");
    console.log("EXPECTED=" + expected + " LIVE=" + live);
    if (live !== expected) throw Error("Production version mismatch");
    const home = await fetch(new URL("/?audit=" + encodeURIComponent(expected), base), { cache: "no-store", signal: AbortSignal.timeout(10000), headers: { "Cache-Control": "no-cache" } });
    if (!home.ok) throw Error("Homepage HTTP " + home.status);
    const html = await home.text();
    if (!html.includes(expected)) throw Error("Homepage missing current release identity");
    if (!html.includes("arena-home-2026.css")) throw Error("Arena stylesheet not referenced on live homepage");
    console.log("PRODUCTION_RELEASE_AUDIT_OK " + expected);
    process.exit(0);
  } catch (error) {
    last = String(error);
    console.error("Attempt " + attempt + "/6: " + last);
    if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
console.error("PRODUCTION_RELEASE_AUDIT_FAILED expected=" + expected + " reason=" + last);
process.exit(1);
