import {before,after,test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright";

const [css,appCss,vendor,core,js]=await Promise.all([
  readFile(new URL("../assets/motion-system.css",import.meta.url),"utf8"),
  readFile(new URL("../assets/styles.css",import.meta.url),"utf8"),
  readFile(new URL("../assets/vendor/gsap-3.15.0.min.js",import.meta.url),"utf8"),
  readFile(new URL("../assets/motion-system.js",import.meta.url),"utf8"),
  readFile(new URL("../assets/ui-motion.js",import.meta.url),"utf8")
]);
let browser;
before(async()=>{browser=await chromium.launch({headless:true})});
after(async()=>{await browser?.close()});
async function open({width=390,reducedMotion="no-preference",html='<article class="tour-card">Giải PickleUp Bình Lợi</article>'}={}){
  const page=await browser.newPage({viewport:{width,height:780},reducedMotion});
  await page.setContent('<!doctype html><html><head></head><body class="site-sport public-body"><main id="site-main">'+html+'</main></body></html>');
  await page.addStyleTag({content:css+"\n"+appCss});
  await page.addScriptTag({content:vendor});
  await page.addScriptTag({content:core});
  await page.evaluate(()=>{
    window.motionCalls=[];
    for(const name of ["entrance","press"]){
      const original=PickleMotion[name];
      PickleMotion[name]=(...args)=>{
        const targets=name==="entrance"?(args[0] instanceof Element?[args[0]]:[...args[0]]):[args[0]];
        window.motionCalls.push({name,targets:targets.map(el=>({id:el.id,classes:el.className}))});
        return original(...args);
      };
    }
  });
  await page.addScriptTag({content:js});
  return page;
}

for(const width of [390,1280])test("cards actually animate at "+width+"px",async()=>{
  const page=await open({width});
  try{
    await page.waitForFunction(()=>window.motionCalls.some(call=>call.name==="entrance"&&call.targets.some(target=>String(target.classes).includes("tour-card"))));
    const item=page.locator(".tour-card");
    assert.equal(await item.getAttribute("data-motion-entered"),"1");
    await page.waitForTimeout(800);
    assert.equal(await item.evaluate(el=>getComputedStyle(el).opacity),"1");
  }finally{await page.close()}
});

test("new tournament cards animate after realtime DOM insertion without blocking visibility",async()=>{
  const page=await open({html:'<div id="publicTours"></div>'});
  try{
    await page.evaluate(()=>{const card=document.createElement("article");card.className="tour-card";card.textContent="Giải mới tháng 10";document.querySelector("#publicTours").append(card)});
    await page.waitForFunction(()=>window.motionCalls.some(call=>call.name==="entrance"&&call.targets.some(target=>String(target.classes).includes("tour-card"))));
    assert.equal(await page.locator(".tour-card").getAttribute("data-motion-entered"),"1");
  }finally{await page.close()}
});

test("dialog and buttons have visible animation without replacing their content",async()=>{
  const page=await open({html:'<button id="action">Bốc thăm</button><dialog id="genericDialog"><div class="modal-card">Cài đặt giải</div></dialog>'});
  try{
    const button=page.locator("#action");
    await button.dispatchEvent("pointerdown",{bubbles:true,pointerType:"touch"});
    assert.equal(await button.textContent(),"Bốc thăm");
    assert.equal(await page.evaluate(()=>window.motionCalls.filter(call=>call.name==="press"&&call.targets.some(target=>target.id==="action")).length),1);
    await page.evaluate(()=>document.querySelector("#genericDialog").showModal());
    await page.waitForFunction(()=>window.motionCalls.some(call=>call.name==="entrance"&&call.targets.some(target=>String(target.classes).includes("modal-card"))));
    await page.waitForFunction(()=>getComputedStyle(document.querySelector(".modal-card")).opacity==="1");
    assert.equal(await page.locator(".modal-card").evaluate(el=>getComputedStyle(el).opacity),"1");
  }finally{await page.close()}
});

test("score feedback runs on actual change and does not replay on an unchanged score",async()=>{
  const page=await open({html:'<strong id="scoreA">0</strong>'});
  try{
    await page.evaluate(()=>document.querySelector("#scoreA").textContent="1");
    await page.waitForFunction(()=>document.querySelector("#scoreA").classList.contains("score-pop"));
    assert.match(await page.locator("#scoreA").evaluate(el=>getComputedStyle(el).animationName),/scorePop/);
    await page.evaluate(()=>document.querySelector("#scoreA").classList.remove("score-pop"));
    await page.evaluate(()=>document.querySelector("#scoreA").textContent="1");
    await page.waitForTimeout(80);
    assert.equal(await page.locator("#scoreA").evaluate(el=>el.classList.contains("score-pop")),false);
  }finally{await page.close()}
});

test("reduce motion keeps every card visible and completely disables animations",async()=>{
  const page=await open({reducedMotion:"reduce"});
  try{
    assert.equal(await page.locator(".tour-card").evaluate(el=>getComputedStyle(el).opacity),"1");
    assert.equal(await page.locator(".tour-card").evaluate(el=>getComputedStyle(el).animationName),"none");
    assert.equal(await page.locator(".tour-card").evaluate(el=>el.classList.contains("pu-motion-in")),false);
    const button=page.locator(".tour-card");
    assert.notEqual(await button.textContent(),"");
  }finally{await page.close()}
});
