import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname,resolve} from "node:path";
const require=createRequire(import.meta.url);
let chromium;try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const apiSource=await readFile(new URL("../assets/api.js",import.meta.url),"utf8");

// Phone photos uploaded as avatars were served at 1-1.7MB each, making the
// ranking page ~25MB. Uploads must be downscaled in the browser first.
test("avatar uploads are downscaled to 384px JPEG before leaving the browser",async()=>{
  const browser=await chromium.launch();
  try{
    const page=await browser.newPage();
    // api.js reads localStorage, so the page needs a real origin.
    await page.route("http://pickle.test/",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>shrink</title>"}));
    await page.goto("http://pickle.test/");
    await page.addScriptTag({content:apiSource});
    const result=await page.evaluate(async()=>{
      const canvas=document.createElement("canvas");canvas.width=3000;canvas.height=4000;
      const ctx=canvas.getContext("2d");
      for(let i=0;i<4000;i+=8){ctx.fillStyle=`hsl(${i%360} 70% ${30+(i*7)%50}%)`;ctx.fillRect(0,i,3000,8)}
      const big=await new Promise(r=>canvas.toBlob(r,"image/png"));
      const file=new File([big],"phone-photo.png",{type:"image/png"});
      const small=await window.PickleAPI.shrinkImage(file,{max:384,quality:.82});
      const bitmap=await createImageBitmap(small);
      const pdf=new File([new Uint8Array([37,80,68,70])],"receipt.pdf",{type:"application/pdf"});
      return {before:file.size,after:small.size,type:small.type,name:small.name,w:bitmap.width,h:bitmap.height,pdfUntouched:(await window.PickleAPI.shrinkImage(pdf))===pdf};
    });
    assert.equal(result.type,"image/jpeg");
    assert.equal(result.name,"phone-photo.jpg");
    assert.equal(Math.max(result.w,result.h),384);
    assert.equal(result.w,288);
    assert.ok(result.after<result.before/10,`expected strong reduction, got ${result.before} -> ${result.after}`);
    assert.ok(result.after<120*1024,`avatar should be under 120KB, got ${result.after}`);
    assert.ok(result.pdfUntouched,"non-image files are passed through unchanged");
  }finally{await browser.close()}
});
