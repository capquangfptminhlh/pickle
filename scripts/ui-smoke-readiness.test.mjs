import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {dirname,resolve} from "node:path";
import vm from "node:vm";

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require("playwright"))}
catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const source=await readFile(new URL("./ui-smoke.mjs",import.meta.url),"utf8");
const start=source.indexOf("// Regression checks for match operations.");
const end=source.indexOf("for(const [pid,selector,label]",start);
assert.ok(start>=0&&end>start,"match regression section must exist");
const checks=source.slice(start,end);

test('route smoke settles startup requests and keeps real failures scoped to their document',async()=>{
  const helpers=source.slice(source.indexOf('async function inspect('),source.indexOf('const page=await browser.newPage'));
  const failures=[],{goto}=vm.runInNewContext(helpers+';({goto})',{failures});
  const browser=await chromium.launch({headless:true}),page=await browser.newPage();
  let settled=false;
  await page.route('http://smoke.test/fixture/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/slow')){await new Promise(r=>setTimeout(r,600));settled=true;await route.fulfill({body:'ok'});return}
    if(path.endsWith('/broken')){await route.fulfill({status:503,body:'real failure'});return}
    await route.fulfill({contentType:'text/html',body:path.endsWith('/old')?'<h1>Old</h1><script>fetch("/fixture/slow").catch(()=>console.error("aborted old startup"))</script>':'<h1>Next</h1><script>fetch("/fixture/broken")</script>'});
  });
  try{
    await page.goto('http://smoke.test/fixture/old',{waitUntil:'domcontentloaded'});
    await goto(page,'http://smoke.test/fixture/next','next document');
    assert.ok(settled,'previous startup request completes before navigation');
    assert.ok(failures.some(f=>f.label==='next document'&&f.errors.some(e=>e.includes('http 503'))),'real failed response remains a smoke failure');
    assert.ok(failures.every(f=>f.errors.every(e=>!e.includes('aborted old startup'))),'previous page is not aborted by test navigation');
    for(const event of ['console','pageerror','response'])assert.equal(page.listenerCount(event),0,'inspection listeners detached after route');
  }finally{await browser.close()}
});

test("tournament record smoke accepts uppercase presentation and still rejects a wrong record",async t=>{
  const recordCheck=source.split('\n').find(line=>line.includes('tournament route shows wrong record'));
  assert.ok(recordCheck,'tournament record assertion exists');
  const browser=await chromium.launch({headless:true});
  try{
    for(const scenario of [
      {title:'UI Smoke Tournament',expected:[]},
      {title:'Another Tournament',expected:['tournament route shows wrong record']}
    ])await t.test(scenario.title,async()=>{
      const ppage=await browser.newPage(),failures=[];
      try{
        await ppage.setContent('<style>h1{text-transform:uppercase}</style><h1 id="tourName"></h1>');
        await ppage.locator('#tourName').evaluate((el,title)=>el.textContent=title,scenario.title);
        assert.equal(await ppage.locator('#tourName').innerText(),scenario.title.toUpperCase());
        await vm.runInNewContext(`(async()=>{${recordCheck}})()`,{ppage,failures});
        assert.deepEqual(failures.flatMap(f=>f.errors),scenario.expected);
      }finally{await ppage.close()}
    });
  }finally{await browser.close()}
});

test("match smoke waits for rendered controls and preserves scoring safeguards",async t=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const scenario of [
      {name:"delayed navigation still reviews the completed match",expected:[]},
      {name:"missing completed review still fails",missing:true,expected:["completed score review and Undo entry missing"]},
      {name:"enabled completed scoring still fails",editable:true,expected:["completed match still allows score changes"]},
      {name:"inaccessible completed Undo still fails",noUndo:true,expected:["completed match Undo is inaccessible"]},
      {name:"missing eligible scores entry still fails",missingScore:true,expected:["score entry missing for eligible match"]},
      {name:"premature set and match completion still fails",scoreEditable:true,expected:["finish match enabled before required set wins","finish set enabled below target score"]}
    ])await t.test(scenario.name,async()=>{
      const page=await browser.newPage();
      page.setDefaultTimeout(6000);
      try{
        await page.setContent('<button data-page="matches">Matches</button><button data-page="scores">Scores</button><main id="content">Settings</main><dialog id="scoreDialog"><button class="icon-btn">Close</button><span id="scoreA">0</span><span id="scoreB">0</span><input id="targetScore" value="11"><button data-score="a">A−</button><button data-score="a">A+</button><button data-score="b">B−</button><button data-score="b">B+</button><button id="finishSet">Set</button><button id="finishMatch">Match</button><button id="saveQuickScore">Save</button><button id="undoScore">Undo</button></dialog>');
        await page.evaluate(scenario=>{
          window.state={matches:[{id:"completed",status:"done",a:"team-a",b:"team-b"}]};
          const content=document.querySelector("#content"),dialog=document.querySelector("#scoreDialog");
          dialog.querySelector(".icon-btn").onclick=()=>dialog.close();
          document.querySelectorAll("[data-page]").forEach(nav=>nav.onclick=()=>{
            const update=async()=>{
              await new Promise(resolve=>setTimeout(resolve,450));
              const scores=nav.dataset.page==="scores";
              const missing=scores?scenario.missingScore:scenario.missing;
              content.innerHTML=`<h2>${scores?"Các trận cần nhập":"Lịch thi đấu"}</h2><select id="courtFilter"><option value="">All</option></select><select id="statusFilter"><option value="">All</option><option value="live">Live</option></select><div id="matchList"><div data-match-card="completed" data-match-status="done">${missing?"":'<button data-score-match="completed">Review / Undo</button>'}</div></div>`;
              content.querySelector("[data-score-match]")?.addEventListener("click",()=>{
                dialog.querySelectorAll("[data-score], #finishSet, #finishMatch, #saveQuickScore").forEach(el=>el.disabled=!(scores?scenario.scoreEditable:scenario.editable));
                document.querySelector("#undoScore").disabled=!!scenario.noUndo;
                dialog.showModal();
              });
              document.querySelector("#statusFilter").onchange=e=>content.querySelector("[data-match-card]").hidden=!!e.target.value;
            };
            if(document.startViewTransition)document.startViewTransition(update);
            else void update();
          });
        },scenario);
        const failures=[];
        await vm.runInNewContext(`(async()=>{${checks}})()`,{page,failures});
        assert.deepEqual(failures.flatMap(f=>f.errors),scenario.expected);
      }finally{await page.close()}
    });
  }finally{await browser.close()}
});
