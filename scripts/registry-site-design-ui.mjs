import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile,mkdir} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,extname,dirname} from "node:path";
import {createRequire} from "node:module";
import worker from "../cloudflare/src/index.js";
import {scoringFixture} from "../cloudflare/tests/helpers/scoring-fixture.mjs";

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const theme=process.env.SITE_THEME==="light"?"light":"dark";
const root=fileURLToPath(new URL("../",import.meta.url)),artifacts=resolve(root,"ui-artifacts/site-sport");
await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const requestedPath=new URL(req.url,"http://localhost").pathname;
    const path=requestedPath==="/login"?"/login.html":requestedPath;
    if(["/socket.io/socket.io.js","/assets/pwa.js","/preview/preview-pwa.js"].includes(path)){res.end("");return}
    const full=resolve(root,"."+path);
    if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader("Content-Type",({".js":"application/javascript",".html":"text/html",".css":"text/css",".svg":"image/svg+xml",".jpg":"image/jpeg",".webp":"image/webp"})[extname(full)]||"application/octet-stream");
    res.end(await readFile(full));
  }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),failures=[];
const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const luminance=s=>rgb(s).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((a,n,i)=>a+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
async function expectPoster(locator){
  await locator.waitFor({state:"visible"});
  await locator.evaluate(el=>el.complete&&el.naturalWidth>0?Promise.resolve():new Promise((resolve,reject)=>{el.addEventListener("load",resolve,{once:true});el.addEventListener("error",()=>reject(new Error("poster failed to load")),{once:true})}));
  assert.equal(await locator.evaluate(el=>getComputedStyle(el).objectFit),"contain","original poster uncropped");
  assert.equal(await locator.evaluate(el=>getComputedStyle(el).filter),"none","original poster colors");
}
const checks=(label,fn)=>{try{fn()}catch(e){failures.push(label+": "+e.message);console.error("FAIL",failures.at(-1))}};
const production=[
  ["index.html","#publicTours .tour-card"], ["ranking.html","#rankingRows a"],
  ["player.html?id=p1","#playerName"], ["tournament.html?id=tour","#tourName"],
  ["about.html","h1"], ["login.html","#loginForm"], ["submit-tournament.html","#submitForm"],
  ["checkin.html?token=site-fixture","#confirmCheckin"], ["referee.html?match=match","#scoreSurface","ref"],
  ["court-board.html",".tv-court"], ["match.html?id=match",".live-match-card"],
  ["offline.html","h1"], ["legacy-migrate.html","#backupFile"], ["admin.html",".club-home-hero","admin"],
  ["player.html?id=missing","#playerRoot"], ["tournament.html?id=missing","#tourUnavailable"],
  ["checkin.html","#checkinTeam"], ["match.html?id=missing","#matchNotFound"]
];
const previews=["index","ranking","player","tournament","about","login","submit-tournament","checkin","offline","admin"].map(name=>[
  `preview/${name}.html${name==="player"?"?id=p1":name==="tournament"?"?id=tour":""}`,
  name==="login"?"#loginForm":name==="admin"?"#content .club-home-hero":name==="ranking"?"#rankingRows a":name==="player"?"#playerName":name==="tournament"?"#tourName":"main"
]);
const defaultViewports=[{width:1440,height:1000},{width:375,height:812},{width:844,height:390}];
const viewports=process.env.SITE_WIDTH?[defaultViewports.find(v=>String(v.width)===process.env.SITE_WIDTH)||{width:Number(process.env.SITE_WIDTH),height:812}]:defaultViewports;
const selectedPages=process.env.SITE_PAGES?.split(",");
try{
  for(const viewport of viewports){
    const f=await scoringFixture();
    f.db.exec(`UPDATE tournaments SET name='Giải kiểm thử Lime',venue_name='Cụm sân kiểm thử',public_visible=1,status='live',start_at='2026-10-10T08:00:00Z',poster_url='/assets/tournaments/pickleup-tour-binh-loi-20261015-original.jpg' WHERE id='tour';
      INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Sân 01');
      UPDATE teams SET name='Nguyễn Minh / Trần Anh',group_code='A' WHERE id='a';
      UPDATE teams SET name='Hoàng Nam / Lê Hà',group_code='A' WHERE id='b';
      INSERT INTO players(id,full_name,nickname,gender,rating) VALUES('p1','Nguyễn Minh','Minh','male',3.25),('p2','Trần Anh','Anh','female',3.5);
      INSERT INTO team_players(team_id,player_id) VALUES('a','p1'),('b','p2');
      INSERT INTO registrations(id,division_id,team_id,status,checkin_token) VALUES('registration','division','a','approved','site-fixture');
      UPDATE matches SET status='live',court_id='court',stage='Bảng A' WHERE id='match';`);
    const previewState={bookings:[],clubEvents:[],clubAttendance:{},clubTransactions:[],ratingHistory:{},ratingProcessedKeys:[],...(await (await worker.fetch(new Request(base+"/api/public/state"),f.env)).json())};
    for(const [path,ready,actor] of [...production,...previews].filter(s=>(!process.env.SITE_PAGE||s[0].startsWith(process.env.SITE_PAGE))&&(!selectedPages||selectedPages.some(name=>s[0].split("?")[0]===name)))){
      const context=await browser.newContext({viewport,reducedMotion:process.env.SITE_MOTION||"reduce"}),page=await context.newPage(),errors=[];
      await page.addInitScript(theme=>localStorage.setItem("pickleup-theme-v2",theme),theme);
      page.setDefaultTimeout(7000);page.on("pageerror",e=>errors.push(e.message));
      if(path.startsWith("preview/"))await page.addInitScript(state=>localStorage.setItem("pickle-local-state-v1",JSON.stringify(state)),previewState);
      if(actor)await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens[actor]);
      if(path==="preview/admin.html")await page.addInitScript(()=>localStorage.setItem("pickle-preview-auth-v1",JSON.stringify({user:{id:"local-admin",email:"test@pickle.test",name:"Admin kiểm thử",role:"super_admin"},createdAt:new Date().toISOString()})));
      await page.route("**/api/**",async route=>{
        const req=route.request();
        const r=await worker.fetch(new Request(req.url(),{method:req.method(),headers:req.headers(),...(req.postData()?{body:req.postData()}:{})}),f.env);
        await route.fulfill({status:r.status,headers:Object.fromEntries(r.headers),body:await r.text()});
      });
      await page.route(/^https:\/\//,route=>route.request().resourceType()==="image"?route.fulfill({contentType:"image/svg+xml",body:'<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#243b2d"/></svg>'}):route.abort());
      const label=`${viewport.width} ${path}`,previousFailures=failures.length;
      try{
        await page.goto(base+"/"+path,{waitUntil:"domcontentloaded"});await page.locator(ready).first().waitFor({state:"visible"});
        if(path==="court-board.html")await page.locator('#boardTournament').evaluate(el=>{el.textContent='Giải Đồng Đội Pickleup Mở Rộng 2026 — Chung kết toàn quốc'});
        await page.waitForTimeout(180);
        assert.ok(await page.locator("#themeToggle").isVisible(),"theme choice available on every page");
        const publicHeader=page.locator(".public-header .public-nav"),login=publicHeader.getByRole("link",{name:"Đăng nhập",exact:true});
        if(await publicHeader.count()){
          assert.equal(await login.count(),1,"public header must offer a visible login entry");
          assert.ok(await login.isVisible(),"login entry stays visible on mobile");
          const loginBox=await login.boundingBox(),brandBox=await publicHeader.locator(".public-brand").boundingBox(),themeBox=await publicHeader.locator("#themeToggle").boundingBox();
          assert.ok(loginBox.height>=44&&loginBox.width>=44,"login touch target is at least 44px");
          assert.ok(loginBox.x>=0&&loginBox.x+loginBox.width<=viewport.width&&loginBox.y>=0&&loginBox.y+loginBox.height<=viewport.height,"login fits the initial viewport");
          for(const box of [brandBox,themeBox])assert.ok(loginBox.x+loginBox.width<=box.x+.1||box.x+box.width<=loginBox.x+.1||loginBox.y+loginBox.height<=box.y+.1||box.y+box.height<=loginBox.y+.1,"login does not overlap branding or theme control");
          const loginStyle=await login.evaluate(el=>{const s=getComputedStyle(el);return {fg:s.color,bg:s.backgroundColor}});
          assert.ok(contrast(loginStyle.fg,loginStyle.bg)>=4.5,"login text contrast in selected theme");
        }
        const style=await page.locator("body").evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,fg:s.color,scheme:s.colorScheme,theme:el.classList.contains("site-sport")}});
        checks(label+" "+theme+" theme",()=>{assert.ok(style.theme,"site theme missing");assert.ok(theme==="light"?luminance(style.bg)>.8:luminance(style.bg)<.03,"selected canvas brightness");assert.ok(style.scheme.includes(theme));assert.ok(contrast(style.fg,style.bg)>=7,"body text contrast")});
        const samples=await page.locator('.bracket-plan-note,.bracket-plan-empty,.bracket-plan-match .bracket-team,.division-rule-pills b,.public-section>.public-container,.panel,.tour-body,.top-player-card,.news-card,.community-post-card,.connect-player-card,.ranking-tabs,.ranking-list-card,.ranking-search-panel,.podium-player,.tournament-event-summary,.tournament-event-facts article,.tournament-prize-card,.tournament-contact-card,.player-stat,.player-match,.login-card,.checkin-card,.ref-team-card,.ref-control-card,.live-match-card,.card,.package-card').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const s=getComputedStyle(el);let p=el;while(p.parentElement&&getComputedStyle(p).backgroundColor==="rgba(0, 0, 0, 0)")p=p.parentElement;return {cls:el.className,bg:getComputedStyle(p).backgroundColor,fg:s.color}}));
        for(const s of samples)checks(label+" surface "+s.cls,()=>{const scoreboard=s.cls.includes('ref-team-card');assert.ok(scoreboard?luminance(s.bg)<.08:theme==="light"?luminance(s.bg)>.5:luminance(s.bg)<.08,"selected surface brightness");assert.ok(contrast(s.fg,s.bg)>=4.5,"surface text contrast")});
        const coreCards=await page.locator('.login-card,.top-player-card,.tour-card,.club-home-actions button').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderRightColor})));
        for(const card of coreCards)checks(label+" clear card separation",()=>assert.ok(theme==="light"?contrast(card.bg,card.border)>=1.5:contrast(card.bg,style.bg)>=1.5,"cards must stand apart from their surroundings"));
        const inputs=await page.locator('input:not([type="checkbox"]):not([type="radio"]):not([type="file"]),select,textarea').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const s=getComputedStyle(el),r=el.getBoundingClientRect();return {id:el.id,bg:s.backgroundColor,fg:s.color,font:parseFloat(s.fontSize),height:r.height,x:r.x,right:r.right}}));
        for(const s of inputs)checks(label+" field "+s.id,()=>{assert.ok(theme==="light"?luminance(s.bg)>.5:luminance(s.bg)<.08,"selected field brightness");assert.ok(contrast(s.fg,s.bg)>=4.5,"field text contrast");assert.ok(s.height>=44,"field touch height");assert.ok(s.font>=14,"field text size");assert.ok(s.x>=-1&&s.right<=viewport.width+1,"field must fit viewport")});
        const captions=await page.locator('.tour-meta-premium small,.tour-meta-premium b,.tour-venue-line b,.tour-card-footer>span:first-child b,.division-rule-pills b,.bracket-plan-note,.bracket-plan-match .bracket-team span,.ranking-app-player small,.top-player-copy small,.tournament-event-facts small,.tournament-contact-card p,.player-stat>span,.tournament-hero-stats small,.ref-summary small,.login-card>p').evaluateAll(els=>els.filter(el=>el.getClientRects().length).map(el=>{const s=getComputedStyle(el);let parent=el;while(parent&&getComputedStyle(parent).backgroundColor==="rgba(0, 0, 0, 0)")parent=parent.parentElement;return {name:el.textContent.trim().slice(0,45),fg:s.color,bg:getComputedStyle(parent||document.body).backgroundColor,font:parseFloat(s.fontSize)}}));
        for(const caption of captions)checks(label+" caption "+caption.name,()=>{assert.ok(caption.font>=12,"caption text size");assert.ok(contrast(caption.fg,caption.bg)>=6,"caption contrast")});
        const controls=await page.locator('button,a.btn,.public-mobile-dock a,.public-nav nav a,.tournament-tabs a').evaluateAll(els=>els.filter(el=>el.getClientRects().length&&getComputedStyle(el).visibility!=="hidden").map(el=>({name:el.getAttribute("aria-label")||el.textContent.trim().slice(0,45),h:el.getBoundingClientRect().height})));
        for(const control of controls)checks(label+" touch "+control.name,()=>assert.ok(control.h>=43.9,"control must be at least44px high"));
        await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2,{},{timeout:3000}).catch(async()=>{
          failures.push(label+": horizontal page overflow");
          console.error('OVERFLOW',JSON.stringify(await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,elements:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+2}).map(el=>({tag:el.tagName,id:el.id,cls:el.className,right:Math.round(el.getBoundingClientRect().right)})).slice(0,12)}))));
        });
        const primary=page.locator('.btn.primary,.tournament-register-cta,.ref-btn.primary,.rally-hit').filter({visible:true}).first();
        if(await primary.count()){
          const s=await primary.evaluate(el=>{const c=getComputedStyle(el);return {bg:c.backgroundColor,fg:c.color,h:el.getBoundingClientRect().height}});
          checks(label+" primary",()=>{assert.ok(s.h>=44);assert.ok(contrast(s.fg,s.bg)>=4.5,"primary contrast")});
          if(await primary.evaluate(el=>el.matches('.btn.primary,.tournament-register-cta')))checks(label+" lime action",()=>assert.equal(s.bg,"rgb(217, 255, 99)"));
        }
        if(path==="index.html"&&!process.env.SITE_BASELINE){
          const poster=page.locator("#publicTours .tour-poster-image").first();
          await poster.scrollIntoViewIfNeeded();await expectPoster(poster);
          const ratio=await page.locator("#publicTours .tour-media").first().evaluate(el=>el.clientWidth/el.clientHeight);assert.ok(Math.abs(ratio-2/3)<.02,"portrait home poster ratio");
        }
        if(!process.env.SITE_BASELINE&&path==="ranking.html"){
          await page.locator("#rankSearch").fill("Nguyễn Minh");await page.waitForFunction(()=>document.querySelectorAll("#rankingRows a").length===1);assert.match(await page.locator("#rankingRows").innerText(),/Nguyễn Minh/);
          await page.locator("#rankSearch").fill("không tồn tại");await page.waitForFunction(()=>document.querySelectorAll("#rankingRows a").length===0);await page.locator("#rankSearch").fill("");
          for(const [mode,title] of [["club","CLB"],["area","Khu vực"],["player","VĐV"]]){
            await page.locator(`[data-rank-mode="${mode}"]`).click();
            assert.equal(await page.locator(`[data-rank-mode="${mode}"]`).getAttribute("aria-pressed"),"true","selected ranking mode is announced");
            assert.match(await page.locator(".ranking-list-head").innerText(),new RegExp(title));
            assert.equal(await page.locator("#rankGender").isVisible(),mode==="player","player filters follow the ranking mode");
            assert.equal(await page.locator("#rankClub").isVisible(),mode==="player");
          }
        }
        if(path==="preview/tournament.html?id=tour"){await expectPoster(page.locator("#tourBannerImage"));const ratio=await page.locator(".tournament-event-banner-wrap").evaluate(el=>el.clientWidth/el.clientHeight);assert.ok(Math.abs(ratio-2/3)<.02,"preview portrait poster ratio")}
        if(!process.env.SITE_BASELINE&&path==="tournament.html?id=tour"){
          f.db.exec("UPDATE tournaments SET public_visible=0 WHERE id='tour'");await page.evaluate(()=>load());await page.locator("#tourUnavailable h1").waitFor({state:"visible"});
          assert.match(await page.locator("#tourUnavailable").innerText(),/chưa được công khai/);assert.ok(await page.locator("#tourDivisions").isHidden());
          f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='tour'");await page.evaluate(()=>load());await page.locator("#tourName").waitFor({state:"visible"});assert.equal(await page.locator("#tourUnavailable").count(),0);
          await expectPoster(page.locator("#tourBannerImage"));
          assert.ok(await page.locator("#tourDivisions").isVisible());assert.equal(await page.locator("#tourBannerImage").evaluate(el=>getComputedStyle(el).filter),"none","poster colors retained");
          assert.equal(await page.locator("#tourBannerImage").evaluate(el=>getComputedStyle(el).objectFit),"contain","full original poster remains uncropped");
        }
        if(!process.env.SITE_BASELINE&&path==="login.html"){
          await page.locator("#email").fill("invalid@test.invalid");await page.locator("#password").fill("incorrect-password");await page.locator("button[type=submit]").click();await page.locator("#error").filter({hasText:"không đúng"}).waitFor();
        }
        if(!process.env.SITE_BASELINE&&path==="submit-tournament.html"){
          for(const [id,value] of [["tourName","Giải giao diện kiểm thử"],["tourVenue","Sân dữ liệu mẫu"],["contactName","BTC kiểm thử"],["contactPhone","0900000000"]])await page.locator("#"+id).fill(value);
          await page.locator("#submitBtn").click();await page.locator("#submitSuccess").waitFor({state:"visible"});assert.ok(await page.locator("#submitForm").isHidden());
          assert.match(await page.locator("#successTourName").innerText(),/Giải giao diện kiểm thử/);
        }
        if(!process.env.SITE_BASELINE&&path.startsWith("referee.html")){
          const score=Number(await page.locator("#refScoreA").innerText());await page.locator('[data-correct="A"][data-delta="1"]').click();await page.waitForFunction(n=>Number(document.querySelector("#refScoreA").textContent)===n,score+1);
          await page.locator("#undoBtn").click();await page.waitForFunction(n=>Number(document.querySelector("#refScoreA").textContent)===n,score);
          assert.ok(await page.locator("#finishMatchBtn").isDisabled());
        }
        if(!process.env.SITE_BASELINE&&path==="checkin.html?token=site-fixture"){
          await page.locator("#confirmCheckin").click();await page.locator("#checkinStatus").filter({hasText:"ĐÃ CHECK-IN"}).waitFor();
          f.db.exec("UPDATE registrations SET checked_in_at=NULL WHERE id='registration'");
        }
        assert.deepEqual(errors,[],"browser runtime errors");
        if(!process.env.SITE_BASELINE){
          const skip=page.locator(".site-skip-link");
          if(await skip.count()){
            await skip.focus();assert.ok((await skip.boundingBox()).y>=0,"skip link becomes visible on focus");
            const target=(await skip.getAttribute("href")).slice(1);await skip.press("Enter");assert.equal(await page.evaluate(()=>document.activeElement.id),target,"keyboard skip reaches main content");
          }
          await page.evaluate(()=>{document.activeElement?.blur();scrollTo({top:0,behavior:"instant"})});
        }
        await page.evaluate(()=>document.fonts.ready);
        // Verify the real downloaded faces, including Vietnamese accents, rather than fallback fonts.
        assert.match(await page.locator('body').evaluate(el=>getComputedStyle(el).fontFamily),/^Barlow(?:,|$)/,'shared UI font');
        const loadedFonts=await page.evaluate(async()=>{
          const sample='Nguyễn Trọng Tài — ĐƯỜNG ĐẾN CHỨC VÔ ĐỊCH 0123456789';
          const ui=await document.fonts.load('400 16px Barlow',sample);
          const display=await document.fonts.load('800 32px "Barlow Condensed"',sample);
          return [...ui,...display].every(face=>face.status==='loaded')&&ui.length>=2&&display.length>=2;
        });
        assert.ok(loadedFonts,'Latin and Vietnamese font subsets load without fallback');
        const headings=await page.locator('h1,h2,h3,h4').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height).map(el=>getComputedStyle(el).fontFamily));
        assert.ok(headings.every(family=>family.startsWith('"Barlow Condensed"')),'sports display font on visible headings');
        await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
        const suffix=path.includes("=missing")?"-missing":path.includes("site-fixture")?"-valid":"";
        if(path==="index.html")await page.screenshot({path:resolve(artifacts,`${theme}-${viewport.width}-home-viewport.png`)});
        await page.screenshot({path:resolve(artifacts,`${process.env.SITE_BASELINE?"baseline-":""}${theme}-${viewport.width}-${path.split("?")[0].replace(/[/.]/g,"-")}${suffix}.png`),fullPage:!path.startsWith("referee")});
        if(await publicHeader.count()){
          await Promise.all([page.waitForURL(/\/(?:preview\/)?login(?:\.html)?$/),login.click()]);
          await page.locator("#loginForm").waitFor({state:"visible"});
          assert.ok(await page.locator("#email").isVisible()&&await page.locator("#password").isVisible(),"header login opens the real login form");
        }
        console.log(failures.length===previousFailures?"PASS site UI":"CHECKED site UI",label);
      }catch(e){failures.push(label+": "+e.message);console.error("FAIL",failures.at(-1));console.error("DIAGNOSTIC",JSON.stringify(await page.evaluate(()=>({url:location.href,main:[...document.querySelectorAll("main")].map(el=>({cls:el.className,display:getComputedStyle(el).display,visibility:getComputedStyle(el).visibility,rect:el.getBoundingClientRect().toJSON()}))}))))}
      finally{await context.close()}
    }
    f.db.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exitCode=1}else console.log("SITE_DESIGN_UI_OK");
