import {cp,mkdir,readdir,readFile,rm,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const cloudflareDir=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const projectDir=resolve(cloudflareDir,"..");
const outputDir=join(cloudflareDir,"public");

await rm(outputDir,{recursive:true,force:true});
await mkdir(outputDir,{recursive:true});

for(const entry of await readdir(projectDir,{withFileTypes:true})){
  if(entry.isFile()&&entry.name.endsWith(".html")){
    // Socket.IO is served by the Node backend. Workers use the API's native
    // WebSocket adapter; do not request a missing Node client on these pages.
    const html=await readFile(join(projectDir,entry.name),"utf8");
    await writeFile(join(outputDir,entry.name),html.replace(/<script src="\/socket\.io\/socket\.io\.js"><\/script>/g,""));
  }
}

for(const name of ["manifest.webmanifest","service-worker.js"]){
  await cp(join(projectDir,name),join(outputDir,name));
}

await cp(join(projectDir,"assets"),join(outputDir,"assets"),{recursive:true});

// The Open Play browser entry imports this audited shared ESM module at
// /shared/open-play.js. Publish only the client-safe matcher, not the entire
// server-side shared directory.
await mkdir(join(outputDir,"shared"),{recursive:true});
await cp(join(projectDir,"shared","open-play.js"),join(outputDir,"shared","open-play.js"));


/*
 * Each static release must change its service worker bytes, otherwise installed
 * PWAs keep the old cache name even if GitHub/Cloudflare have new assets.
 * Hash published source assets rather than rely on manually bumped ?v=N values.
 */
const digest=createHash("sha256");
async function hashPublishedFiles(directory,relative=""){
  for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    const name=relative?relative+"/"+entry.name:entry.name;
    const full=join(directory,entry.name);
    if(entry.isDirectory())await hashPublishedFiles(full,name);
    else if(entry.isFile()&&entry.name!=="service-worker.js"&&/\.(?:html|css|js|webmanifest|svg)$/.test(entry.name)){
      digest.update(name+"\0");
      digest.update(await readFile(full));
    }
  }
}
await hashPublishedFiles(outputDir);
const revision=digest.digest("hex").slice(0,16);
const version="pickleup-v86-"+revision;
const workerSource=await readFile(join(projectDir,"service-worker.js"),"utf8");
if(!/const VERSION="pickleup-v\d+[^"]*";/.test(workerSource))throw new Error("PWA_VERSION_MARKER_MISSING");
await writeFile(join(outputDir,"service-worker.js"),workerSource.replace(/const VERSION="pickleup-v\d+[^"]*";/, 'const VERSION="'+version+'";'));
await writeFile(join(outputDir,"release.json"),JSON.stringify({version,revision,git_sha:process.env.GITHUB_SHA||null})+"\n");
