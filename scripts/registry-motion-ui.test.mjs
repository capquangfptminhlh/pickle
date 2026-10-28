import assert from "node:assert/strict";
import {before,after,test} from "node:test";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,extname} from "node:path";
import {chromium} from "playwright";
import worker from "../cloudflare/src/index.js";
import {scoringFixture} from "../cloudflare/tests/helpers/scoring-fixture.mjs";

const root=fileURLToPath(new URL("../",import.meta.url));
let browser,server,base,f;
before(async()=>{
  f=await scoringFixture();
  f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'");
  server=createServer(async(req,res)=>{
    try{
      const pathname=new URL(req.url,"http://localhost").pathname;
      if(pathname==="/socket.io/socket.io.js"){res.end("");return}
      const full=resolve(root,"."+(pathname==="/"?"/index.html":pathname));
      if(!full.startsWith(root)){res.writeHead(403).end();return}
      res.setHeader("Content-Type",({".js":"application/javascript",".html":"text/html",".css":"text/css",".svg":"image/svg+xml",".jpg":"image/jpeg"})[extname(full)]||"application/octet-stream");
      res.end(await readFile(full));
    }catch{res.writeHead(404).end()}
  });
  await new Promise(done=>server.listen(0,"127.0.0.1",done));
  base=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});
});
after(async()=>{await browser?.close();if(server)await new Promise(done=>server.close(done));f?.db.close()});

async function withPage(options,fn){
  const {width=1440,motion="no-preference",fallback=false,blockGsap=false,admin=false,path="/",motionSpy=false,beforeGoto,...rest}=options;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion,serviceWorkers:"block",...rest});
  try{
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(7000);
    page.on("pageerror",e=>errors.push(e.message));
    if(blockGsap){page.__gsapRequests=0;page.on("request",request=>{if(request.url().includes("gsap-3.15.0.min.js"))page.__gsapRequests++})}
    await page.addInitScript(()=>localStorage.setItem("pickleup-theme-v2","light"));
    if(motionSpy)await page.addInitScript(()=>{
      window.__motionCalls=[];
      window.__testSocketHandlers={};
      window.io=()=>({on:(name,fn)=>{window.__testSocketHandlers[name]=fn}});
      let motion;
      Object.defineProperty(window,"PickleMotion",{configurable:true,get:()=>motion,set:value=>{
        motion=value;
        for(const name of ["entrance","count","flip","error"]){
          const original=motion?.[name];
          if(typeof original!=="function")continue;
          motion[name]=(...args)=>{window.__motionCalls.push({name,args:args.map(x=>Array.isArray(x)?x.map(el=>el?.dataset?.motionKey||el?.className):x)});return original(...args)};
        }
      }});
    });
    if(fallback)await page.addInitScript(()=>{delete Document.prototype.startViewTransition});
    if(admin)await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens.admin);
    if(blockGsap)await page.route("**/gsap-3.15.0.min.js",route=>route.abort());
    await page.route("**/api/**",async route=>{
      const req=route.request(),r=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),f.env);
      await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
    });
    if(beforeGoto)await beforeGoto(page);
    if(path.startsWith("/preview/")){
      const state=await (await worker.fetch(new Request(base+"/api/public/state"),f.env)).json();
      state.tournaments.forEach(t=>{t.isFeatured=true;t.posterUrl="/assets/tournaments/pickleup-tour-binh-loi-20261015-original.jpg"});
      await page.addInitScript(state=>localStorage.setItem("pickle-local-state-v1",JSON.stringify(state)),state);
    }
    await page.goto(base+path,{waitUntil:"domcontentloaded"});
    await page.locator(admin?".club-home-hero":".public-header").first().waitFor();
    await page.evaluate(()=>document.fonts.ready);
    await page.waitForTimeout(350);
    await fn(page);
    assert.deepEqual(errors,[],"browser runtime errors");
  }finally{await context.close()}
}
async function showInstall(page){
  await page.evaluate(()=>{
    const event=new Event("beforeinstallprompt",{cancelable:true});
    event.prompt=async()=>{};event.userChoice=Promise.resolve({outcome:"dismissed"});
    dispatchEvent(event);
  });
  await page.locator("[data-pwa-install]").waitFor({state:"visible"});
  await page.waitForTimeout(60);
}

async function checkHeader(page){
  const state=await page.evaluate(()=>{
    const header=document.querySelector(".public-header").getBoundingClientRect();
    const elements=[...document.querySelectorAll(".public-nav a,.public-nav button")].filter(el=>el.getClientRects().length);
    return {width:innerWidth,header:header.toJSON(),controls:elements.map(el=>{
      const range=document.createRange();range.selectNodeContents(el);
      const rect=el.getBoundingClientRect();
      return {label:el.textContent.trim()||el.getAttribute("aria-label"),rect:rect.toJSON(),lines:[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).length,hit:el.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2)),text:!el.querySelector("img")};
    })};
  });
  for(const c of state.controls){
    assert.ok(c.rect.x>=-1&&c.rect.right<=state.width+1,`${c.label} fits viewport`);
    assert.ok(c.rect.top>=state.header.top-1&&c.rect.bottom<=state.header.bottom+1,`${c.label} fits header`);
    assert.ok(c.hit,`${c.label} can be clicked without overlap`);
    if(c.text)assert.equal(c.lines,1,`${c.label} stays on one line`);
  }
}

for(const width of [375,680,761,768,844,1024,1101,1280,1440]){
  test(`header controls remain readable at ${width}px, including app install`,async()=>{
    await withPage({width},async page=>{await checkHeader(page);await showInstall(page);await checkHeader(page)});
  });
}

test("desktop menu follows the selected section and keeps it below the sticky header",async()=>{
  await withPage({width:844},async page=>{
    await page.waitForFunction(sel=>document.querySelector(sel)?.getAttribute("aria-current")==="location",'.public-nav nav a[href="#tournaments"]',{timeout:3000}).catch(()=>{});
      assert.equal(await page.locator('.public-nav nav a[href="#tournaments"]').getAttribute("aria-current"),"location");
    await page.locator('.public-nav nav a[href="#live"]').click();
    await page.waitForFunction(()=>location.hash==="#live");
    await page.waitForFunction(sel=>document.querySelector(sel)?.getAttribute("aria-current")==="location",'.public-nav nav a[href="#live"]',{timeout:3000}).catch(()=>{});
      assert.equal(await page.locator('.public-nav nav a[href="#live"]').getAttribute("aria-current"),"location");
    assert.equal(await page.locator(".public-nav nav [aria-current]").count(),1);
    await page.waitForTimeout(900);
    const position=await page.evaluate(()=>({header:document.querySelector(".public-header").getBoundingClientRect().bottom,target:document.querySelector("#live").getBoundingClientRect().top}));
    assert.ok(position.target>=position.header-1,"section title remains visible below header");
  });
});

test("landscape scrolling and keyboard return keep the header visible",async()=>{
  await withPage({width:844,viewport:{width:844,height:390}},async page=>{
    await page.evaluate(()=>scrollTo({top:700,behavior:"instant"}));
    await checkHeader(page);
    await page.locator(".site-skip-link").focus();await page.locator(".site-skip-link").press("Enter");
    await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:"instant"})});
    await page.waitForTimeout(150);
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).opacity),"1");
    await checkHeader(page);
    if(process.env.MOTION_SCREENSHOT_DIR){
      await mkdir(process.env.MOTION_SCREENSHOT_DIR,{recursive:true});
      await page.screenshot({path:resolve(process.env.MOTION_SCREENSHOT_DIR,"tablet-landscape.png")});
    }
  });
});

test("desktop menu identifies the current page",async()=>{
  await withPage({path:"/about.html"},async page=>{
    const current=page.locator('.public-nav nav a[href="/about.html"]');
    assert.equal(await current.getAttribute("aria-current"),"page");
    await page.locator(".site-skip-link").focus();await page.locator(".site-skip-link").press("Enter");
    await page.waitForFunction(()=>location.hash==="#site-main");
    assert.equal(await current.getAttribute("aria-current"),"page","keyboard skip preserves current page");
  });
});

for(const [path,link] of [["/tournament.html?id=tour","/#tournaments"],["/player.html?id=missing","/ranking.html"]]){
  test(`detail page ${path} retains its parent navigation section`,async()=>{
    await withPage({path},async page=>assert.equal(await page.locator(`.public-nav nav a[href="${link}"]`).getAttribute("aria-current"),"page"));
  });
}

for(const motion of ["no-preference","reduce"]){
  test(`press feedback preserves button content with motion ${motion}`,async()=>{
    await withPage({motion},async page=>{
      const button=page.locator(".public-nav>.btn"),before=await button.innerHTML(),rect=await button.boundingBox();
      await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
      await page.mouse.down();
      try{
        assert.equal(await button.innerHTML(),before,"press feedback does not insert layout children");
        if(motion==="no-preference"){
          const feedback=page.locator("body > .motion-ripple");
          await feedback.waitFor({state:"attached"});
          assert.equal(await button.evaluate((el,ripple)=>el.contains(ripple),await feedback.elementHandle()),false,"ripple stays outside control layout");
          assert.ok(await feedback.evaluate(el=>el.getAnimations().length>0),"press creates visible animated feedback");
        }
      }
      finally{await page.mouse.move(0,850);await page.mouse.up()}
      if(motion==="reduce"){
        assert.equal(await button.evaluate(el=>getComputedStyle(el).transitionDuration),"0s");
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),"auto","reduced motion disables smooth page scrolling");
        assert.equal(await button.evaluate(el=>getComputedStyle(el).transform),"none","reduced press leaves no computed transform");
        assert.equal(await page.locator(".motion-ripple").count(),0,"reduced press does not add ripple motion");
      }
    });
  });
}

test("fallback route exit navigates to a controlled local target within 220ms",async()=>{
  await withPage({fallback:true},async page=>{
    await page.route("**/__motion-target",route=>route.fulfill({contentType:"text/html",body:"<!doctype html><title>Motion target</title>"}));
    await page.evaluate(()=>{
      const link=document.createElement("a");
      link.id="motion-target-link";
      link.href="/__motion-target";
      link.textContent="Motion target";
      document.body.appendChild(link);
    });
    const started=Date.now();
    await Promise.all([page.waitForURL(/\/__motion-target$/),page.locator("#motion-target-link").click()]);
    assert.ok(Date.now()-started<=220,"route exit respects the hard navigation maximum");
  });
});

test("mixed-case blank targets bypass shared route exits",async()=>{
  await withPage({fallback:true},async page=>{
    await page.evaluate(()=>{
      const link=document.createElement("a");
      link.id="mixed-blank-link";
      link.href="/about.html";
      link.target="_BLANK";
      link.textContent="Open separately";
      document.body.appendChild(link);
      document.addEventListener("click",event=>{
        if(event.target!==link)return;
        window.__mixedBlankPrevented=event.defaultPrevented;
        event.preventDefault();
      },{once:true});
    });
    await page.locator("#mixed-blank-link").click();
    assert.equal(await page.evaluate(()=>window.__mixedBlankPrevented),false,"route handler leaves mixed-case blank targets untouched");
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("motion-route-leaving")),false);
  });
});

test("sibling cards committed into an existing host receive one grouped entrance",async()=>{
  await withPage({},async page=>{
    await page.evaluate(()=>{
      const host=document.createElement("section");
      host.id="dynamic-motion-host";
      host.style.cssText="position:fixed;left:0;top:0;width:120px;z-index:-1";
      document.body.appendChild(host);
    });
    await page.waitForTimeout(50);
    await page.evaluate(()=>{
      const original=window.PickleMotion.entrance;
      window.__uiEntranceCalls=[];
      window.PickleMotion.entrance=(targets,options)=>{
        window.__uiEntranceCalls.push({targets:[...targets].map(el=>el.id),options});
        return original(targets,options);
      };
      document.querySelector("#dynamic-motion-host").innerHTML='<article id="dynamic-motion-a" class="tour-card">A</article><article id="dynamic-motion-b" class="tour-card">B</article>';
    });
    await page.waitForFunction(()=>window.__uiEntranceCalls.some(call=>call.targets.includes("dynamic-motion-a")&&call.targets.includes("dynamic-motion-b")));
    const calls=await page.evaluate(()=>window.__uiEntranceCalls.filter(item=>item.targets.some(id=>id.startsWith("dynamic-motion-"))));
    assert.equal(calls.length,1,"one parent commit produces one entrance call");
    const [call]=calls;
    assert.deepEqual(call.targets,["dynamic-motion-a","dynamic-motion-b"]);
    assert.equal(call.options.y,28);
    assert.equal(call.options.stagger,.055);
    assert.match(call.options.key,/^ui-entrance:/);
    assert.equal(await page.locator("#dynamic-motion-a").getAttribute("data-motion-entered"),"1");
    assert.equal(await page.locator("#dynamic-motion-b").getAttribute("data-motion-entered"),"1");
  });
});

test("nested entrance targets animate only the outer committed hierarchy level",async()=>{
  await withPage({},async page=>{
    await page.evaluate(()=>{
      const host=document.createElement("section");
      host.id="nested-motion-host";
      host.style.cssText="position:fixed;left:140px;top:0;width:120px;z-index:-1";
      document.body.appendChild(host);
    });
    await page.waitForTimeout(50);
    await page.evaluate(()=>{
      const original=window.PickleMotion.entrance;
      window.__nestedEntranceCalls=[];
      window.PickleMotion.entrance=(targets,options)=>{
        window.__nestedEntranceCalls.push([...targets].map(el=>el.id));
        return original(targets,options);
      };
      document.querySelector("#nested-motion-host").innerHTML='<section id="nested-panel" class="panel"><article id="nested-card-a" class="match-card">A</article><article id="nested-card-b" class="match-card">B</article></section>';
    });
    await page.waitForFunction(()=>window.__nestedEntranceCalls.length>0);
    assert.deepEqual(await page.evaluate(()=>window.__nestedEntranceCalls.flat()),["nested-panel"]);
  });
});

test("offscreen siblings wait for their own intersection before entering",async()=>{
  await withPage({},async page=>{
    await page.evaluate(()=>{
      const host=document.createElement("section");
      host.id="visibility-motion-host";
      host.style.cssText="position:relative;height:1900px";
      document.body.prepend(host);
    });
    await page.waitForTimeout(50);
    await page.evaluate(()=>{
      const original=window.PickleMotion.entrance;
      window.__visibilityEntranceCalls=[];
      window.PickleMotion.entrance=(targets,options)=>{
        window.__visibilityEntranceCalls.push([...targets].map(el=>el.id));
        return original(targets,options);
      };
      document.querySelector("#visibility-motion-host").innerHTML='<article id="visible-motion-card" class="tour-card">Visible</article><article id="offscreen-motion-card" class="tour-card" style="margin-top:1450px">Offscreen</article>';
    });
    await page.waitForFunction(()=>document.querySelector("#visible-motion-card")?.dataset.motionEntered==="1");
    assert.equal(await page.locator("#offscreen-motion-card").getAttribute("data-motion-entered"),null,"far sibling is not entered with the visible row");
    assert.equal(await page.evaluate(()=>window.__visibilityEntranceCalls.some(call=>call.includes("offscreen-motion-card"))),false);
    await page.locator("#offscreen-motion-card").scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>document.querySelector("#offscreen-motion-card")?.dataset.motionEntered==="1");
    assert.ok(await page.evaluate(()=>window.__visibilityEntranceCalls.some(call=>call.includes("offscreen-motion-card"))));
  });
});

test("fallback entry finishes without retaining a whole-page animation",async()=>{
  await withPage({fallback:true},async page=>assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("route-entering")),false));
});

test("motion core keeps navigation usable when GSAP is unavailable",async()=>{
  await withPage({blockGsap:true},async page=>{
    assert.equal(page.__gsapRequests,1,"the fallback page makes only the normal initial GSAP request");
    assert.equal(await page.evaluate(()=>Boolean(window.gsap)),false,"GSAP stays absent for the entire page lifetime");
    assert.equal(await page.evaluate(()=>window.PickleMotion?.ready),false);
    const fallback=await page.evaluate(()=>{
      const target=document.createElement("div");
      target.style.cssText="opacity:0;visibility:hidden;transform:translateY(20px);filter:blur(4px)";
      document.body.appendChild(target);
      const result=window.PickleMotion.entrance(target);
      return {operation:typeof window.PickleMotion.entrance,result,opacity:target.style.opacity,visibility:target.style.visibility,transform:target.style.transform,filter:target.style.filter};
    });
    assert.deepEqual(fallback,{operation:"function",result:null,opacity:"1",visibility:"visible",transform:"none",filter:"none"});
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).opacity),"1");
    await page.locator(".public-nav>.btn").click();
    await page.waitForFunction(()=>location.hash==="#tournaments");
  });
});

test("ranking update flips reordered rows, counts confirmed decimals, and celebrates only a new leader",async()=>{
  const records=[
    {id:"player-a",full_name:"Player A",rating:5,active:true},
    {id:"player-b",full_name:"Player B",rating:4,active:true},
    {id:"player-c",full_name:"Player C",rating:3,active:true}
  ];
  let calls=0;
  await withPage({path:"/ranking.html",motionSpy:true,beforeGoto:async page=>page.route("**/api/public/players**",async route=>route.fulfill({contentType:"application/json",body:JSON.stringify(calls++?records:[...records])}))},async page=>{
    await page.waitForFunction(()=>document.querySelectorAll("#rankingRows .ranking-app-row").length===3);
    const initialLeader=await page.locator("#rankingRows [data-motion-key]").first().getAttribute("data-motion-key");
    assert.equal(initialLeader,"player:player-a");
    assert.equal(await page.locator("#rankingRows [data-motion-key='player:player-a']").getAttribute("data-motion-state"),null,"initial leader is not celebrated as a promotion");
    await page.evaluate(()=>{
      window.__leaderTransitions=0;
      new MutationObserver(records=>{window.__leaderTransitions+=records.filter(r=>r.attributeName==="data-motion-state"&&r.target.dataset.motionState==="leader").length}).observe(document.querySelector(".ranking-app-shell"),{subtree:true,attributes:true,attributeFilter:["data-motion-state"]});
    });
    records[1].rating=6.25;
    await page.evaluate(()=>window.__testSocketHandlers["public:state"]?.({}));
    await page.waitForFunction(()=>document.querySelector("#rankingRows [data-motion-key]")?.dataset.motionKey==="player:player-b");
    const promotedRow=page.locator("#rankingRows [data-motion-key='player:player-b']"),promotedPodium=page.locator("#rankingPodium [data-motion-key='player:player-b']");
    assert.equal(await promotedPodium.getAttribute("data-motion-state"),"leader","podium is the canonical promotion sweep when present");
    assert.equal(await promotedRow.getAttribute("data-motion-state"),null,"the ranking row does not replay the same promotion sweep");
    await page.waitForTimeout(30);
    assert.equal(await page.evaluate(()=>window.__leaderTransitions),1,"new leader is swept once after update");
    assert.equal(await page.locator(".ranking-app-shell [data-motion-state='leader']").count(),1,"a single canonical podium or row receives the promotion state");
    await page.evaluate(async()=>{window.__activeRatingNode=document.querySelector("#rankingRows [data-motion-key='player:player-b'] .ranking-app-rating");await window.__testSocketHandlers["public:state"]?.({})});
    assert.equal(calls,3,"duplicate socket reload's publicPlayers response completed before checking the active count");
    assert.equal(await page.evaluate(()=>window.__motionCalls.filter(c=>c.name==="count").length),1,"identical realtime state during the active count does not restart it");
    assert.equal(await page.locator("#rankingRows [data-motion-key='player:player-b'] .ranking-app-rating").evaluate(el=>el===window.__activeRatingNode),true,"duplicate confirmed state preserves the active count node");
    await page.waitForTimeout(600);
    const callsAfterUpdate=await page.evaluate(()=>window.__motionCalls.map(c=>c.name));
    assert.deepEqual(await page.locator("#rankingRows [data-motion-key]").evaluateAll(els=>els.map(el=>el.dataset.motionKey)),["player:player-b","player:player-a","player:player-c"]);
    assert.equal(callsAfterUpdate.filter(name=>name==="flip").length,1);
    assert.ok(callsAfterUpdate.includes("count"),"confirmed decimal rating animates with count");
    assert.equal(await page.locator("#rankingRows [data-motion-key='player:player-b'] .ranking-app-rating").textContent(),"6.25");
    await page.evaluate(()=>window.__testSocketHandlers["public:state"]?.({}));
    await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>window.__motionCalls.filter(c=>c.name==="flip").length),1,"identical state does not replay reorder motion");
    assert.equal(await page.evaluate(()=>window.__leaderTransitions),1,"promotion sweep is emitted once");
    await page.locator("#rankSearch").fill("Player A");await page.locator("#rankSearch").fill("");
    assert.equal(await page.evaluate(()=>window.__motionCalls.filter(c=>c.name==="flip").length),1,"typing filters without a confirmed reorder does not invoke FLIP");
    assert.equal(await page.evaluate(()=>window.__motionCalls.filter(c=>c.name==="count").length),1,"typing filters do not animate unchanged ratings");
  });
});

test("public tournament cards use stable IDs and enter once when confirmed state adds one",async()=>{
  const response=await worker.fetch(new Request("http://localhost/api/public/state"),f.env),initialState=await response.json();
  await withPage({motionSpy:true},async page=>{
    await page.waitForSelector("#publicTours .tour-card");
    await page.waitForTimeout(700);
    const firstKey=await page.locator("#publicTours .tour-card").first().getAttribute("data-motion-key");
    assert.match(firstKey,/^tournament:.+$/);
    const next={...initialState,tournaments:[...initialState.tournaments,{id:"added-tour",name:"Added Tournament",status:"open",startAt:"2030-01-01T00:00:00.000Z",format:"Open",venue:"Court"}]};
    await page.evaluate(state=>window.__testSocketHandlers["public:state"]?.(state),next);
    await page.waitForSelector('#publicTours [data-motion-key="tournament:added-tour"]');
    await page.waitForTimeout(100);
    let entrances=await page.evaluate(()=>window.__motionCalls.filter(call=>call.name==="entrance"&&call.args[0]?.includes("tournament:added-tour")).length);
    assert.equal(entrances,1,`new confirmed card receives one entrance call: ${JSON.stringify(await page.evaluate(()=>window.__motionCalls.filter(call=>call.name==="entrance")))}`);
    await page.evaluate(state=>window.__testSocketHandlers["public:state"]?.(state),next);
    await page.waitForTimeout(100);
    entrances=await page.evaluate(()=>window.__motionCalls.filter(call=>call.name==="entrance"&&call.args[0]?.includes("tournament:added-tour")).length);
    assert.equal(entrances,1,"duplicate state render does not replay card entrance");
  });
});

test("preview tournament cards mirror the public stable-key convention",async()=>{
  await withPage({path:"/preview/index.html"},async page=>{
    const card=page.locator("#publicTours .tour-card").first();await card.waitFor();
    const expected=await card.evaluate(el=>new URL(el.href).searchParams.get("id"));
    assert.equal(await card.getAttribute("data-motion-key"),"tournament:"+expected);
  });
});

for(const width of [375,844,1440])for(const mode of [{motion:"no-preference"},{motion:"reduce"},{motion:"no-preference",blockGsap:true}]){
  test(`public cards remain visible at ${width}px with ${mode.blockGsap?"missing GSAP":mode.motion+" motion"}`,async()=>{
    await withPage({width,...mode},async page=>{
      const card=page.locator("#publicTours .tour-card").first();await card.waitFor();
      if(mode.blockGsap){
        assert.equal(page.__gsapRequests,1,"no test helper retry loads GSAP");
        assert.equal(await page.evaluate(()=>Boolean(window.gsap)),false);
        assert.equal(await page.evaluate(()=>window.PickleMotion?.ready),false);
      }
      await page.waitForTimeout(1050);
      assert.equal(await card.evaluate(el=>getComputedStyle(el).opacity),"1");
      assert.equal(await card.evaluate(el=>getComputedStyle(el).visibility),"visible");
    });
  });
}

test("browser Back restores an admin page after a fallback route fade",async()=>{
  await withPage({fallback:true,admin:true,path:"/admin.html"},async page=>{
    await page.evaluate(()=>{document.body.classList.add("route-leaving");dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))});
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("route-leaving")),false);
    await page.waitForTimeout(200);
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).opacity),"1");
  });
});

test("admin dialog motion preserves focus and validation while toasts enter once",async()=>{
  await withPage({admin:true,path:"/admin.html",motionSpy:true},async page=>{
    await page.evaluate(()=>{
      window.__motionCalls=[];
      const trigger=document.createElement("button");
      trigger.id="motionDialogTrigger";trigger.type="button";trigger.textContent="Mở kiểm tra";
      trigger.onclick=()=>{
        document.querySelector("#genericBody").innerHTML='<label>Tên<input id="motionRequired" required></label>';
        document.querySelector("#genericDialog").showModal();
      };
      document.body.append(trigger);
    });
    await page.locator("#motionDialogTrigger").click();
    await page.waitForFunction(()=>document.querySelector("#genericDialog")?.open);
    assert.equal(await page.evaluate(()=>document.querySelector("#genericDialog").contains(document.activeElement)),true,"opening motion does not move focus outside the dialog");
    await page.locator("#motionRequired").evaluate(input=>input.reportValidity());
    await page.waitForFunction(()=>window.__motionCalls.some(call=>call.name==="error"));
    await page.locator('#genericDialog button[aria-label="Đóng hộp thoại"]').click();
    await page.waitForFunction(()=>!document.querySelector("#genericDialog").open);
    await page.waitForFunction(()=>document.activeElement?.id==="motionDialogTrigger");
    await page.evaluate(()=>{const toast=document.createElement("div");toast.className="toast";toast.textContent="Đã lưu";document.body.append(toast)});
    await page.waitForFunction(()=>window.__motionCalls.filter(call=>call.name==="entrance"&&Array.isArray(call.args[0])&&call.args[0].includes("toast")).length===1);
  });
});

for(const width of [375,844,1440]){
  test(`tournament section navigation marks its destination at ${width}px`,async()=>{
    await withPage({width,path:"/tournament.html?id=tour"},async page=>{
      await page.locator("#tourDivisions > *").first().waitFor();
      await page.locator('.tournament-tabs a[href="#participants"]').click();
      await page.waitForFunction(()=>location.hash==="#participants");
      await page.waitForFunction(sel=>document.querySelector(sel)?.getAttribute("aria-current")==="location",'.tournament-tabs a[href="#participants"]',{timeout:3000}).catch(()=>{});
      assert.equal(await page.locator('.tournament-tabs a[href="#participants"]').getAttribute("aria-current"),"location");
      assert.equal(await page.locator(".tournament-tabs [aria-current]").count(),1);
      await page.waitForTimeout(900);
      assert.ok(await page.evaluate(()=>document.querySelector("#participants").getBoundingClientRect().top>=document.querySelector(".tournament-tabs").getBoundingClientRect().bottom-1),"section heading stays below both navigation bars");
    });
  });
}

test("unavailable tournaments hide section navigation",async()=>{
  await withPage({path:"/tournament.html?id=missing"},async page=>{
    await page.locator("#tourUnavailable h1").waitFor();
    assert.ok(await page.locator(".tournament-tabs").isHidden(),"no dead section links on an unavailable tournament");
  });
});

for(const width of [375,844,1440])for(const path of ["/","/preview/index.html"]){
  test(`home ${path} tournament labels leave the original poster unobstructed at ${width}px`,async()=>{
    await withPage({width,path},async page=>{
      const card=page.locator("#publicTours .tour-card").first();
      await card.waitFor();
      const media=await card.locator(".tour-media").boundingBox();
      for(const label of await card.locator(".badge,.tour-card-feature,.tour-featured-badge").all()){
        const box=await label.boundingBox();
        if(!box)continue;
        const overlap=Math.min(media.x+media.width,box.x+box.width)>Math.max(media.x,box.x)&&Math.min(media.y+media.height,box.y+box.height)>Math.max(media.y,box.y);
        assert.equal(overlap,false,"status and sponsorship labels must not cover poster content");
      }
      if(width===375){
        const title=await card.locator("h3").boundingBox(),dock=await page.locator(".public-mobile-dock").boundingBox();
        assert.ok(title.y+title.height<=dock.y,"the first tournament name is readable before scrolling past a tall poster");
      }
    });
  });
}


test("mobile competition discovery opens without pushing the first tournament behind the dock",async()=>{
  await withPage({width:375,path:"/"},async page=>{
    const toggle=page.locator("#eventMobileFilter");
    await toggle.waitFor({state:"visible"});
    assert.equal(await toggle.getAttribute("aria-expanded"),"false");
    const title=await page.locator("#publicTours .tour-card h3").first().boundingBox();
    const dock=await page.locator(".public-mobile-dock").boundingBox();
    assert.ok(title&&dock&&title.y+title.height<=dock.y,"first tournament title remains visible");
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"),"true");
    const input=page.locator("#eventSearch");
    await input.fill("unmatched-competition-test-query");
    assert.equal(await page.locator("#publicTours .tour-card:visible").count(),0);
    await input.fill("");
    assert.ok(await page.locator("#publicTours .tour-card:visible").count()>0,"clearing query restores tournament cards");
    await input.press("Escape");
    assert.equal(await toggle.getAttribute("aria-expanded"),"false");
  });
});

test("desktop competition filters change results without another API roundtrip",async()=>{
  await withPage({width:844,path:"/"},async page=>{
    const cards=page.locator("#publicTours .tour-card");
    await cards.first().waitFor();
    const total=await cards.count();
    const input=page.locator("#eventSearch");
    await input.fill("never-matches-any-tournament-uuid");
    assert.equal(await page.locator("#publicTours .tour-card:visible").count(),0);
    await input.fill("");
    assert.equal(await page.locator("#publicTours .tour-card:visible").count(),total);
    const filter=page.locator('#eventFilters button[data-filter="done"]');
    await filter.click();
    assert.equal(await filter.getAttribute("aria-pressed"),"true");
    await page.locator('#eventFilters button[data-filter="all"]').click();
    assert.equal(await page.locator("#publicTours .tour-card:visible").count(),total);
  });
});

test("competition command palette only exposes role-visible internal navigation",async()=>{
  await withPage({width:844,path:"/admin.html",admin:true},async page=>{
    await page.keyboard.press("Control+k");
    const dialog=page.locator("#opsLauncher");
    await dialog.waitFor({state:"visible"});
    const search=page.locator("#opsLauncherSearch");
    await search.fill("Bảng xếp hạng");
    assert.ok(await page.locator('#opsLauncherResults button').count()>0,"admin has a ranking navigation result");
    await search.press("Escape");
    assert.equal(await dialog.isVisible(),false,"Escape dismisses the command palette");
  });
});
