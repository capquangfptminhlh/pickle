// Builds the responsive WebP variants for repo-hosted tournament posters:
//   assets/tournaments/<name>-original.jpg -> <name>-640.webp, <name>-1024.webp
// Cards use 640px, the tournament page 1024px; small print stays legible.
//   cd cloudflare && node scripts/poster-variants.mjs
import {readdirSync,statSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import sharp from "sharp";

const dir=fileURLToPath(new URL("../../assets/tournaments/",import.meta.url));
const sizes=[[640,82],[1024,86]];
for(const file of readdirSync(dir).filter(f=>f.endsWith("-original.jpg"))){
  const base=file.replace(/-original\.jpg$/,"");
  for(const [width,quality] of sizes){
    const out=join(dir,`${base}-${width}.webp`);
    await sharp(join(dir,file)).resize({width,withoutEnlargement:true}).webp({quality,effort:6,smartSubsample:true}).toFile(out);
    console.log(`${base}-${width}.webp ${(statSync(out).size/1024).toFixed(0)}KB`);
  }
}
