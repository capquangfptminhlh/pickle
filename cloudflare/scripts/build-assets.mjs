import {cp,mkdir,readdir,rm} from "node:fs/promises";
import {dirname,join,resolve} from "node:path";
import {fileURLToPath} from "node:url";

const cloudflareDir=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const projectDir=resolve(cloudflareDir,"..");
const outputDir=join(cloudflareDir,"public");

await rm(outputDir,{recursive:true,force:true});
await mkdir(outputDir,{recursive:true});

for(const entry of await readdir(projectDir,{withFileTypes:true})){
  if(entry.isFile()&&entry.name.endsWith(".html")){
    await cp(join(projectDir,entry.name),join(outputDir,entry.name));
  }
}

for(const name of ["manifest.webmanifest","service-worker.js"]){
  await cp(join(projectDir,name),join(outputDir,name));
}

await cp(join(projectDir,"assets"),join(outputDir,"assets"),{recursive:true});
