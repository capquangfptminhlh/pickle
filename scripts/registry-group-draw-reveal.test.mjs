import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import test from "node:test";

const require=createRequire(import.meta.url);
const {chromium}=require("playwright");
const source=await readFile(new URL("../assets/draw-reveal.js",import.meta.url),"utf8");

async function pageFixture(){
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage();
  await page.setContent('<main id="host"></main>');
  await page.addScriptTag({content:source});
  return {browser,page};
}

test("announces real pairs one by one, finishing group A before B then C",async()=>{
  const {browser,page}=await pageFixture();
  try{
    const data=await page.evaluate(async()=>{
      const seen=[];
      const observer=new MutationObserver(muts=>{
        for(const mutation of muts)for(const node of mutation.addedNodes){
          if(node.nodeType===1&&node.classList.contains("draw-reveal-team")){
            seen.push(node.closest(".draw-reveal-group").dataset.revealGroup+":"+node.dataset.teamId);
          }
        }
      });
      observer.observe(document.querySelector("#host"),{subtree:true,childList:true});
      const payload={groups:[{group:"C",count:2},{group:"B",count:2},{group:"A",count:2}],
        assignments:[{teamId:"b2",teamName:"B Team 2",group:"B"},{teamId:"a1",teamName:"A Team 1",group:"A"},
        {teamId:"c1",teamName:"C Team 1",group:"C"},{teamId:"b1",teamName:"B Team 1",group:"B"},
        {teamId:"a2",teamName:"A Team 2",group:"A"},{teamId:"c2",teamName:"C Team 2",group:"C"}]};
      const result=await window.PickleDrawReveal.play(document.querySelector("#host"),payload);
      observer.disconnect();
      return {seen,result,counts:[...document.querySelectorAll("[data-reveal-group]")].map(el=>[el.dataset.revealGroup,el.querySelectorAll(".draw-reveal-team").length])};
    });
    assert.deepEqual(data.seen,["A:a1","A:a2","B:b2","B:b1","C:c1","C:c2"]);
    assert.deepEqual(data.counts,[["A",2],["B",2],["C",2]]);
    assert.equal(data.result.total,6);
  }finally{await browser.close()}
});

test("skip reveals all saved assignments without adding fake teams or HTML",async()=>{
  const {browser,page}=await pageFixture();
  try{
    await page.evaluate(()=>{
      const groups=["B","A","C","D"].map(group=>({group,count:3}));
      const assignments=groups.flatMap(({group})=>[0,1,2].map(i=>({group,teamId:group+i,teamName:i===0?"<img src=x onerror=alert(1)>":group+" pair "+(i+1)})));
      window.revealPromise=window.PickleDrawReveal.play(document.querySelector("#host"),{groups,assignments});
    });
    await page.locator("[data-reveal-skip]").click();
    const result=await page.evaluate(()=>window.revealPromise);
    assert.equal(result.skipped,true);
    assert.equal(await page.locator(".draw-reveal-team").count(),12);
    assert.equal(await page.locator(".draw-reveal-team img").count(),0);
    assert.equal(await page.locator(".draw-reveal-stage.is-complete").count(),1);
    assert.equal(await page.locator("[data-reveal-skip]").isHidden(),true);
  }finally{await browser.close()}
});

test("closing the draw cancels animation without modifying actual assignments",async()=>{
  const {browser,page}=await pageFixture();
  try{
    const result=await page.evaluate(async()=>{
      const controller=new AbortController();
      const assignments=Array.from({length:12},(_,i)=>({teamId:String(i),teamName:"Cặp "+i,group:i<6?"A":"B"}));
      const promise=window.PickleDrawReveal.play(document.querySelector("#host"),{groups:[{group:"A",count:6},{group:"B",count:6}],assignments},{signal:controller.signal});
      controller.abort();
      return promise;
    });
    assert.equal(result.cancelled,true);
    assert.equal(await page.locator(".draw-reveal-group.is-complete").count(),0);
  }finally{await browser.close()}
});

test("respect reduce-motion accessibility and show every team immediately",async()=>{
  const {browser,page}=await pageFixture();
  try{
    await page.emulateMedia({reducedMotion:"reduce"});
    const result=await page.evaluate(()=>window.PickleDrawReveal.play(document.querySelector("#host"),{
      groups:[{group:"A",count:2},{group:"B",count:2}],
      assignments:["A","A","B","B"].map((group,i)=>({teamId:String(i),teamName:"Pair "+i,group}))
    }));
    assert.equal(result.total,4);
    assert.equal(await page.locator(".draw-reveal-team.is-instant").count(),4);
  }finally{await browser.close()}
});
