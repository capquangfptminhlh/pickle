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
  const {width=1440,motion="no-preference",fallback=false,blockGsap=false,admin=false,path="/",...rest}=options;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion,serviceWorkers:"block",...rest});
  try{
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(7000);
    page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem("pickleup-theme-v2","light"));
    if(fallback)await page.addInitScript(()=>{delete Document.prototype.startViewTransition});
    if(admin)await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens.admin);
    if(blockGsap)await page.route("**/gsap-3.15.0.min.js",route=>route.abort());
    await page.route("**/api/**",async route=>{
      const req=route.request(),r=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),f.env);
      await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
    });
    if(path.startsWith("/preview/")){
      const state=await (await worker.fetch(new Request(base+"/api/public/state"),f.env)).json();
      state.tournaments.forEach(t=>{t.isFeatured=true;t.posterUrl="/assets/tournaments/pickleup-tour-binh-loi-20261015-original.jpg"});
      await page.addInitScript(state=>localStorage.setItem("pickle-local-state-v1",JSON.stringify(state)),state);
    }
    await page.goto(base+path,{waitUntil:"domcontentloaded"});
    if(blockGsap)await page.evaluate(async()=>{
      const load=src=>new Promise(resolve=>{const script=document.createElement("script");script.src=src;script.onload=resolve;script.onerror=resolve;document.head.appendChild(script)});
      await load("/assets/vendor/gsap-3.15.0.min.js");
      await load("/assets/motion-system.js");
    });
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

test("fallback entry finishes without retaining a whole-page animation",async()=>{
  await withPage({fallback:true},async page=>assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("route-entering")),false));
});

test("motion core keeps navigation usable when GSAP is unavailable",async()=>{
  await withPage({blockGsap:true},async page=>{
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

test("browser Back restores an admin page after a fallback route fade",async()=>{
  await withPage({fallback:true,admin:true,path:"/admin.html"},async page=>{
    await page.evaluate(()=>{document.body.classList.add("route-leaving");dispatchEvent(new PageTransitionEvent("pageshow",{persisted:true}))});
    assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("route-leaving")),false);
    await page.waitForTimeout(200);
    assert.equal(await page.locator("body").evaluate(el=>getComputedStyle(el).opacity),"1");
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
