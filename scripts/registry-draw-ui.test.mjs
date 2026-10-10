import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname,resolve} from "node:path";
import test from "node:test";
import vm from "node:vm";

const source=await readFile(new URL("../assets/draw-flex.js",import.meta.url),"utf8");

test("center draw chooses among populated divisions in the current tournament",async()=>{
  const require=createRequire(import.meta.url),{chromium}=require("playwright"),browser=await chromium.launch();
  try{
    const page=await browser.newPage();page.setDefaultTimeout(3000);
    await page.setContent('<dialog id="genericDialog"><h2 id="genericTitle"></h2><div id="genericBody"><button data-center-draw="tour">Draw</button><button data-auto-draw="empty">Empty</button></div></dialog>');
    await page.evaluate(()=>{
      window.state={divisions:[{id:'empty',tournamentId:'tour',name:'Empty'},...['a','b'].map(id=>({id,tournamentId:'tour',name:'Nội dung '+id})),{id:'foreign',tournamentId:'other',name:'Foreign'}],teams:['a','b','foreign'].flatMap(divisionId=>[0,1,2,3].map(i=>({id:divisionId+i,divisionId,name:divisionId+i}))),courts:[{id:'court',tournamentId:'tour',name:'Sân 1'}],matches:[]};
      window.toast=()=>{};window.loaded=[];window.API={drawConfig:async id=>{loaded.push(id);return {}}};document.querySelector('#genericDialog').showModal();
    });
    await page.addScriptTag({content:source});await page.locator('[data-center-draw]').click();
    assert.deepEqual(await page.locator('#drawDivisionChoice option').evaluateAll(options=>options.map(x=>x.value)),['a','b']);
    await page.locator('#drawDivisionChoice').selectOption('b');await page.locator('#openDivisionDraw').click();
    await page.locator('[data-flex-run]').waitFor();assert.deepEqual(await page.evaluate(()=>loaded),['b']);
    assert.match(await page.locator('.draw-setup-overlay').getAttribute('aria-label'),/Nội dung b/);
  }finally{await browser.close()}
});

for(const action of ["save","run"])test(`invalid ${action} draw counts show an actionable operator message`,async()=>{
  const require=createRequire(import.meta.url),{chromium}=require("playwright"),browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();page.setDefaultTimeout(3000);page.on("dialog",dialog=>dialog.accept());
    await page.setContent('<button data-auto-draw="division">Draw</button>');
    await page.evaluate(()=>{
      window.state={divisions:[{id:"division",tournamentId:"tour",advanceCount:2}],teams:["a","b","c","d"].map(id=>({id,divisionId:"division",name:id})),courts:[{id:"court",tournamentId:"tour",name:"Court"}],matches:[]};
      window.toasts=[];window.toast=message=>toasts.push(message);
      const reject=async()=>{throw new Error("INVALID_DRAW_OPTIONS")};
      window.API={drawConfig:async()=>({}),saveDrawConfig:reject,runDraw:reject};
    });
    await page.addScriptTag({content:source});await page.locator("[data-auto-draw]").click();await page.locator("[data-flex-advance]").fill("1.5");
    await page.locator(`[data-flex-${action}]`).click();await page.waitForFunction(()=>toasts.some(t=>t.includes("phải là số nguyên")));
    assert.equal(await page.evaluate(()=>toasts.some(t=>t.includes("INVALID_DRAW_OPTIONS"))),false);
  }finally{await browser.close()}
});

test("draw button polish stops mutating after labels are current",()=>{
  let writes=0,callback;
  const button=dataset=>{
    let text="Original",title="";
    return {dataset,
      get textContent(){return text},set textContent(value){writes++;text=value},
      get title(){return title},set title(value){writes++;title=value}
    };
  };
  const draw=button({autoDraw:"division"}),bracket=button({top2Bracket:"division"}),center=button({centerDraw:""});
  const buttons={"[data-auto-draw]":[draw],"[data-top2-bracket]":[bracket],"[data-center-draw]":[center]};
  const state={divisions:[{id:"division",advanceCount:3}]};
  vm.runInNewContext(source,{
    state,window:{},
    document:{querySelectorAll:selector=>buttons[selector]||[],addEventListener(){},documentElement:{}},
    MutationObserver:class {constructor(fn){callback=fn}observe(){}},
    addEventListener(){}
  });
  assert.equal(draw.textContent,"🎛 Thiết lập & bốc thăm");
  assert.equal(bracket.textContent,"🏆 Tạo nhánh Top 3");
  assert.equal(center.textContent,"🎡 Thiết lập / quay chia bảng");
  const initialWrites=writes;
  callback();callback();
  assert.equal(writes,initialWrites,"observer callbacks must not write current labels again");
  state.divisions[0].advanceCount=4;
  callback();
  assert.equal(bracket.textContent,"🏆 Tạo nhánh Top 4");
  assert.equal(writes,initialWrites+1,"a changed qualifier count updates only its own label");
});

test("draw setup opens above the operator dialog and restores it after close or Escape",async()=>{
  const require=createRequire(import.meta.url);
  let chromium;
  try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();
    page.setDefaultTimeout(3000);
    await page.setContent('<dialog id="genericDialog"><button data-auto-draw="division">Draw</button></dialog>');
    await page.evaluate(()=>{
      window.state={
        divisions:[{id:"division",tournamentId:"tour",name:"Đôi phong trào",advanceCount:2}],
        teams:["a","b","c","d"].map(id=>({id,divisionId:"division",name:id})),
        courts:[{id:"court",tournamentId:"tour",name:"Sân 01"}],matches:[]
      };
      window.savedPayloads=[];window.toasts=[];
      window.API={drawConfig:async()=>({}),saveDrawConfig:async(id,payload)=>savedPayloads.push({id,payload})};
      window.toast=message=>toasts.push(message);
      document.querySelector("#genericDialog").showModal();
    });
    await page.addScriptTag({content:source});
    const trigger=page.locator("[data-auto-draw]");
    await trigger.click();
    const setup=page.locator(".draw-setup-overlay");
    await setup.waitFor();
    assert.equal(await setup.evaluate(el=>el.tagName),"DIALOG","draw setup must participate in the native modal top layer");
    assert.equal(await setup.evaluate(el=>el.matches(":modal")),true);
    assert.ok(await setup.getAttribute("aria-label")||await setup.getAttribute("aria-labelledby"),"setup dialog needs an accessible name");
    await page.locator("[data-flex-save]").click();
    await page.waitForFunction(()=>savedPayloads.length===1);
    const saved=await page.evaluate(()=>savedPayloads[0]);
    assert.equal(saved.id,"division");assert.deepEqual(saved.payload.courtIds,["court"]);
    assert.equal(saved.payload.groupCount,1);assert.equal(saved.payload.advanceCount,2);
    await page.locator("[data-flex-close]").click();
    await setup.waitFor({state:"detached"});
    assert.equal(await page.locator("#genericDialog").evaluate(el=>el.matches(":modal")),true);
    assert.equal(await trigger.evaluate(el=>el===document.activeElement),true,"closing returns keyboard focus to the operator action");
    await trigger.click();await setup.waitFor();
    await page.keyboard.press("Escape");
    await setup.waitFor({state:"detached"});
    assert.equal(await page.locator("#genericDialog").evaluate(el=>el.matches(":modal")),true);
    assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  }finally{await browser.close()}
});
