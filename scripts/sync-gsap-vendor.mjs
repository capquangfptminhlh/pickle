import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "node_modules/gsap/dist/gsap.min.js");
const target = resolve(root, "assets/vendor/gsap-3.15.0.min.js");

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
const bytes = await readFile(target);
console.log(
  `gsap-3.15.0 ${createHash("sha256").update(bytes).digest("hex")}`,
);
