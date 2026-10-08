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
  const {width=1440,motion="no-preference",fallback=false,admin=false,path="/",...rest}=options;
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:motion,serviceWorkers:"block",...rest});
  try{
    const page=await context.newPage(),errors=[];
    page.setDefaultTimeout(7000);
    page.on("pageerror",e=>errors.push(e.message));
    await page.addInitScript(()=>localStorage.setItem("pickleup-theme-v2","light"));
    if(fallback)await page.addInitScript(()=>{delete Document.prototype.startViewTransition});
    if(admin)await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens.admin);
    await page.route("**/api/**",async route=>{
      const req=route.request(),r=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),f.env);
      await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
    });
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
      try{assert.equal(await button.innerHTML(),before,"press feedback does not insert layout children")}
      finally{await page.mouse.move(0,850);await page.mouse.up()}
      if(motion==="reduce"){
        assert.equal(await button.evaluate(el=>getComputedStyle(el).transitionDuration),"0s");
        assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollBehavior),"auto","reduced motion disables smooth page scrolling");
      }
    });
  });
}

test("fallback entry finishes without retaining a whole-page animation",async()=>{
  await withPage({fallback:true},async page=>assert.equal(await page.locator("body").evaluate(el=>el.classList.contains("route-entering")),false));
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
      await page.locator(".tournament-division-card").first().waitFor();
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
