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

// Tournament posters can be stored as chunked base64 source so binary artwork
// remains reproducible through text-only repository automation.
const mlpPosterDir=join(cloudflareDir,"media-src","mlp-chi-dep-2026");
try{
  const parts=(await readdir(mlpPosterDir)).filter(name=>name.endsWith(".b64")).sort();
  if(parts.length){
    const encoded=(await Promise.all(parts.map(name=>readFile(join(mlpPosterDir,name),"utf8")))).join("").replace(/\s+/g,"");
    const tournamentAssetDir=join(outputDir,"assets","tournaments");
    await mkdir(tournamentAssetDir,{recursive:true});
    await writeFile(join(tournamentAssetDir,"mlp-chi-dep-2026.webp"),Buffer.from(encoded,"base64"));
  }
}catch(error){
  if(error?.code!=="ENOENT")throw error;
}
