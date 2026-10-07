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
const theme=process.env.DESIGN_THEME==="light"?"light":"dark";
const root=fileURLToPath(new URL("../",import.meta.url));
const artifacts=resolve(root,"ui-artifacts/admin-sport");
await mkdir(artifacts,{recursive:true});
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,"http://localhost").pathname;
    if(path==="/socket.io/socket.io.js"||path==="/assets/pwa.js"){res.end("");return}
    const full=resolve(root,"."+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader("Content-Type",({".js":"application/javascript",".html":"text/html",".css":"text/css",".svg":"image/svg+xml"})[extname(full)]||"application/octet-stream");
    res.end(await readFile(full));
  }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),failures=[];
const rgb=s=>(s.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
const luminance=s=>rgb(s).map(n=>{const v=n/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}).reduce((sum,n,i)=>sum+n*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
const check=(label,fn)=>{try{fn()}catch(error){failures.push(`${label}: ${error.message}`);console.error("FAIL",failures.at(-1))}};
try{
  for(const viewport of [{width:1440,height:1000},{width:375,height:812},{width:844,height:390}].filter(v=>!process.env.DESIGN_WIDTH||String(v.width)===process.env.DESIGN_WIDTH)){
    for(const actor of ["admin","organizer"]){
      const motion=process.env.DESIGN_MOTION||"reduce";
      const f=await scoringFixture(),context=await browser.newContext({viewport,reducedMotion:motion}),page=await context.newPage(),errors=[];
      await page.addInitScript(theme=>localStorage.setItem("pickleup-theme-v1",theme),theme);
      page.setDefaultTimeout(7000);page.on("pageerror",e=>errors.push(e.message));
      f.db.exec(`UPDATE tournaments SET name='Pickleup • Giải mùa thu',venue_name='Sân kiểm thử',start_at='2026-10-10T08:00:00Z',status='live' WHERE id='tour';
        UPDATE divisions SET name='Đôi phong trào' WHERE id='division';
        INSERT INTO teams(id,division_id,name) VALUES('d','division','Đội Lime');
        UPDATE teams SET name='Nguyễn Minh / Trần Anh',group_code='A' WHERE id='a';
        UPDATE teams SET name='Hoàng Nam / Lê Hà',group_code='A' WHERE id='b';
        INSERT INTO courts(id,tournament_id,name) VALUES('court','tour','Sân 01');
        UPDATE matches SET status='live',court_id='court',stage='Bảng A',scheduled_at='2026-10-10T08:30:00Z' WHERE id='match';
        INSERT INTO matches(id,division_id,team_a_id,team_b_id,status,stage) VALUES('done','division','c','d','completed','Bảng B'),('cancelled','division','a','c','cancelled','Đã hủy');
        INSERT INTO players(id,full_name,nickname,gender,rating,created_by_user_id) VALUES
          ('p1','Nguyễn Minh','Minh sân 1','male',3.25,'organizer'),('p2','Trần Anh','Anh','female',3.5,'organizer'),
          ('p3','Hoàng Nam','Nam','male',3.75,'organizer'),('p4','Lê Hà','Hà','female',3.0,'organizer'),
          ('unsafe','VĐV <b>an toàn</b>','Biệt danh <em>an toàn</em>','other',3.0,'organizer');`);
      f.db.exec("UPDATE players SET skill_level='A+' WHERE id='p1'; UPDATE players SET skill_level='C' WHERE id='p2';");
      await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens[actor]);
      await page.route("**/api/**",async route=>{
        const source=route.request();
        const response=await worker.fetch(new Request(source.url(),{method:source.method(),headers:source.headers(),...(source.postData()?{body:source.postData()}:{})}),f.env);
        await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      });
      const label=`${actor} ${viewport.width}`;
      const capture=async name=>{if(actor==="admin")await page.screenshot({path:resolve(artifacts,`${process.env.DESIGN_BASELINE?"baseline-":""}${theme}-${viewport.width}-${name}.png`),fullPage:true})};
      const inViewport=async selector=>{
        const rect=await page.locator(selector).boundingBox();
        assert.ok(rect&&rect.x>=-1&&rect.y>=-1&&rect.x+rect.width<=viewport.width+1&&rect.y+rect.height<=viewport.height+1,`${selector} must be reachable inside the viewport`);
      };
      const noOverflow=async()=>{
        await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+2);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),"page must fit viewport; tables scroll inside their wrapper");
      };
      const navigate=async id=>{await page.evaluate(id=>switchAdminPage(id),id);await page.waitForTimeout(100)};
      try{
        await page.goto(base+"/admin.html");
        await page.waitForFunction(()=>document.querySelector("#content .club-home-hero"));
        await capture("dashboard");
        if(actor==="admin"&&!process.env.DESIGN_BASELINE)await page.screenshot({path:resolve(artifacts,`${theme}-${viewport.width}-dashboard-viewport.png`)});
        const bodyStyle=await page.locator("body").evaluate(el=>{const s=getComputedStyle(el);return {bg:s.backgroundColor,color:s.color}});
        check(label+" "+theme+" theme",()=>assert.ok(theme==="light"?luminance(bodyStyle.bg)>.8:luminance(bodyStyle.bg)<.03,"selected canvas brightness"));
        check(label+" readable main text",()=>assert.ok(contrast(bodyStyle.color,bodyStyle.bg)>=7));
        const metrics=await page.locator("[data-sport-metric]").evaluateAll(els=>Object.fromEntries(els.map(el=>[el.dataset.sportMetric,el.querySelector("strong").textContent])));
        check(label+" real manager metrics",()=>assert.deepEqual(metrics,{tournaments:actor==="admin"?"2":"1",teams:"4",live:"1",completed:"1"}));
        const shortcuts=await page.locator(".club-home-actions [data-goto]").evaluateAll(els=>els.map(el=>el.dataset.goto));
        check(label+" management shortcuts",()=>assert.deepEqual(shortcuts,["tournaments","players","scores","referees"]));
        const actions=await page.locator(".club-home-actions button").evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,font:parseFloat(getComputedStyle(el.querySelector("b")).fontSize)})));
        check(label+" readable touch targets",()=>assert.ok(actions.every(a=>a.height>=44&&a.font>=14)));
        const surfaces=await page.locator('.club-home-actions button,.organizer-step').evaluateAll(els=>els.map(el=>({bg:getComputedStyle(el).backgroundColor,border:getComputedStyle(el).borderTopColor})));
        for(const surface of surfaces){
          check(label+" distinct card surface",()=>assert.ok(theme==="light"?luminance(surface.bg)>.5:contrast(surface.bg,bodyStyle.bg)>=1.5,"selected card separation"));
          check(label+" readable card boundary",()=>assert.ok(contrast(surface.border,surface.bg)>=1.5,"card borders must remain visible"));
        }
        await noOverflow();
        if(process.env.DESIGN_BASELINE)continue;
        const muted=await page.locator(".club-home-actions small").first().evaluate(el=>({fg:getComputedStyle(el).color,bg:getComputedStyle(el.closest("button")).backgroundColor,font:parseFloat(getComputedStyle(el).fontSize)}));
        assert.ok(contrast(muted.fg,muted.bg)>=6,"secondary text contrast");assert.ok(muted.font>=12);
        if(motion==="reduce")assert.ok(await page.locator("#nav button").first().evaluate(el=>getComputedStyle(el).transitionDuration.split(",").every(t=>parseFloat(t)<=.01)),"reduced motion suppresses navigation animation");
        if(viewport.width<=760){
          await page.locator(".mobile-dock").waitFor();
          assert.deepEqual(await page.locator(".mobile-dock [data-dock-page]").evaluateAll(els=>els.map(el=>el.dataset.dockPage)),["dashboard","tournaments","players","scores","more"]);
        }
        await navigate("players");await page.locator('[data-player-row="p1"]').waitFor();
        const unsafe=page.locator('[data-player-row="unsafe"]');
        assert.match(await unsafe.innerText(),/VĐV <b>an toàn<\/b>/);assert.equal(await unsafe.locator("em").count(),0);assert.equal(await unsafe.locator(".athlete-meta b").count(),1);
        assert.match(await page.locator('[data-player-row="p1"]').innerText(),/Nam/);assert.match(await page.locator('[data-player-row="p2"]').innerText(),/Nữ/);
        assert.match(await page.locator('[data-player-row="p1"]').innerText(),/A\+/);assert.match(await page.locator('[data-player-row="p2"]').innerText(),/\bC\b/);
        assert.equal(await page.locator('[data-player-row="p1"] .athlete-avatar').textContent(),"NM");
        await noOverflow();await capture("players");
        await page.locator('[data-action="newTeam"]').click();await page.locator("#teamPlayerPicker input").first().fill("Nguyễn");
        await page.locator(".player-picker-result").filter({hasText:"Nguyễn Minh"}).click();
        assert.match(await page.locator('.player-picker-selected:not([hidden])').innerText(),/Nguyễn Minh/);
        await capture("picker");await noOverflow();await page.locator('#genericDialog .score-head button').click();
        await navigate("tournaments");await page.locator('[data-manage-tournament="tour"]').click();
        await page.locator('[data-add-participants="division"]').waitFor();await noOverflow();await capture("operator");
        await page.locator('[data-skill-team-draw="division"]').click();
        const skill=page.locator('.draw-setup-overlay');await skill.waitFor();
        assert.equal(await skill.evaluate(el=>el.tagName),"DIALOG","skill pairing must open in the native modal layer");
        assert.equal(await skill.evaluate(el=>el.matches(":modal")),true,"skill pairing dialog must be modal");
        const poolStyle=await page.locator('[data-skill-pool] label').first().evaluate(el=>({bg:getComputedStyle(el).backgroundColor,fg:getComputedStyle(el.querySelector('b')).color}));
        assert.ok(contrast(poolStyle.fg,poolStyle.bg)>=4.5,"skill pool text must have readable contrast");
        await page.locator('[data-skill-toggle]').click();assert.equal(await page.locator('[data-skill-player]:checked').count(),0);
        await page.locator('[data-skill-toggle]').click();assert.equal(await page.locator('[data-skill-player]:checked').count(),5);
        await noOverflow();await capture("skill-pairing");await page.locator('[data-skill-close]').click();
        assert.equal(await page.locator('#genericDialog').evaluate(el=>el.matches(':modal')),true,"operator must remain modal after closing skill pairing");
        await page.locator('[data-auto-draw="division"]').click();await page.locator(".draw-setup-card").waitFor();
        await page.locator('[data-flex-save]').scrollIntoViewIfNeeded();assert.ok(await page.locator('[data-flex-save]').isVisible());
        await inViewport('[data-flex-save]');
        await page.locator('[data-flex-save]').click();await page.locator('.toast').filter({hasText:"Đã lưu thiết lập chia bảng."}).waitFor();
        await noOverflow();await capture("draw");await page.locator('[data-flex-close]').click();await page.locator('#genericDialog .score-head button').click();
        await navigate("scores");await page.locator('[data-score-match="match"]').click();
        await page.locator("#scoreDialog").waitFor();await page.locator("#saveQuickScore").scrollIntoViewIfNeeded();await noOverflow();await inViewport("#saveQuickScore");
        const control=await page.locator('[data-score="a"][data-delta="1"]').boundingBox();assert.ok(control.height>=44);
        await capture("scoring");await page.locator("#scoreDialog .score-head button").click();
        assert.deepEqual(errors,[]);console.log("PASS sport UI real Worker",label);
      }catch(error){failures.push(`${label}: ${error.message}`);console.error("FAIL",failures.at(-1));console.error("UI errors",JSON.stringify(errors))}
      finally{await context.close();f.db.close()}
    }
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
assert.deepEqual(failures,[]);
console.log("DESIGN_UI_OK");
