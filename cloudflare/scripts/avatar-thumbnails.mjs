// One-off backfill: player avatars were stored as the uploaded phone photo
// (up to 1.7MB) and rendered at 40-120px. For each R2 avatar this writes a
// 384px JPEG next to it under avatars/thumb/ and repoints players.avatar_url.
// Originals are never modified or deleted.
//
//   node scripts/avatar-thumbnails.mjs          # CI, needs Cloudflare credentials
//   DRY_RUN=1 node scripts/avatar-thumbnails.mjs  # read-only size report
import {execFileSync} from "node:child_process";
import {mkdtempSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import sharp from "sharp";

const ORIGIN=process.env.PUBLIC_APP_URL||"https://pickleup.vn";
const BUCKET="pickleup-media";
const DRY_RUN=process.env.DRY_RUN==="1";
const MAX=384;
const wrangler=args=>execFileSync("npx",["wrangler",...args],{encoding:"utf8",stdio:["ignore","pipe","inherit"],shell:process.platform==="win32"});
const sqlString=value=>"'"+String(value).replaceAll("'","''")+"'";

async function avatarRows(){
  if(DRY_RUN){
    const players=await (await fetch(ORIGIN+"/api/public/players")).json();
    return players.map(p=>({id:p.id,avatar_url:p.avatar_url}));
  }
  const text=wrangler(["d1","execute","DB","--remote","--json","--command","SELECT id,avatar_url FROM players WHERE avatar_url LIKE '%/api/media/avatars%'"]);
  // Skip any banner/warning lines wrangler prints before the JSON array.
  const out=JSON.parse(text.slice(text.search(/^\[\s*(\{|\])/m)));
  return out[0]?.results||[];
}
function mediaKey(url){
  try{
    const u=new URL(url,ORIGIN);
    if(!u.pathname.startsWith("/api/media/"))return null;
    return decodeURIComponent(u.pathname.slice("/api/media/".length));
  }catch{return null}
}

const rows=(await avatarRows()).filter(r=>{const key=mediaKey(r.avatar_url);return key?.startsWith("avatars/")&&!key.startsWith("avatars/thumb/")});
const dir=mkdtempSync(join(tmpdir(),"avatars-"));
const updates=[];let before=0,after=0;
for(const row of rows){
  const key=mediaKey(row.avatar_url);
  const res=await fetch(ORIGIN+"/api/media/"+encodeURIComponent(key));
  if(!res.ok){console.warn("skip (download "+res.status+")",row.id,key);continue}
  const original=Buffer.from(await res.arrayBuffer());
  // rotate() bakes in EXIF orientation, which the re-encode would otherwise drop.
  const thumb=await sharp(original).rotate().resize({width:MAX,height:MAX,fit:"inside",withoutEnlargement:true}).jpeg({quality:80,mozjpeg:true}).toBuffer();
  if(thumb.length>=original.length){console.log("keep (already small)",row.id,original.length);continue}
  before+=original.length;after+=thumb.length;
  const thumbKey="avatars/thumb/"+key.split("/").pop().replace(/\.[^.]+$/,"")+".jpg";
  const thumbUrl=new URL("/api/media/"+encodeURIComponent(thumbKey),new URL(row.avatar_url,ORIGIN)).href;
  console.log(`${row.id} ${(original.length/1024).toFixed(0)}KB -> ${(thumb.length/1024).toFixed(0)}KB ${thumbKey}`);
  if(DRY_RUN)continue;
  const file=join(dir,thumbKey.split("/").pop());writeFileSync(file,thumb);
  wrangler(["r2","object","put",BUCKET+"/"+thumbKey,"--file",file,"--content-type","image/jpeg","--remote"]);
  const check=await fetch(thumbUrl);
  if(!check.ok||Number(check.headers.get("content-length")||thumb.length)!==thumb.length)throw new Error("THUMBNAIL_NOT_SERVED "+thumbUrl);
  // Only repoint rows that still use the original, so a newer upload wins.
  updates.push(`UPDATE players SET avatar_url=${sqlString(thumbUrl)},updated_at=datetime('now') WHERE id=${sqlString(row.id)} AND avatar_url=${sqlString(row.avatar_url)};`);
}
if(updates.length)wrangler(["d1","execute","DB","--remote","--command",updates.join("\n")]);
console.log(`AVATAR_THUMBNAILS_${DRY_RUN?"DRY_RUN":"OK"} ${JSON.stringify({candidates:rows.length,updated:DRY_RUN?0:updates.length,beforeKB:Math.round(before/1024),afterKB:Math.round(after/1024)})}`);
