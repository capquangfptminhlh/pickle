import {cp,mkdir,readdir,readFile,rm,writeFile} from "node:fs/promises";
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

