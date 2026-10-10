import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {resolve,extname,dirname} from "node:path";
import {createRequire} from "node:module";
import worker from "../cloudflare/src/index.js";
import {accountFixture} from "../cloudflare/tests/helpers/accounts-fixture.mjs";

const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require("playwright"))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),"../node_modules"),"playwright")))}
const root=fileURLToPath(new URL("../",import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,"http://localhost").pathname;
    if(path==="/socket.io/socket.io.js"||path==="/assets/pwa.js"){res.end("");return}
    const full=resolve(root,"."+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader("Content-Type",({".js":"application/javascript",".html":"text/html",".css":"text/css"})[extname(full)]||"application/octet-stream");res.end(await readFile(full));
  }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),failures=[];
try{
  for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
    for(const actor of ["admin","organizer"]){
      const f=await accountFixture(),page=await browser.newPage({viewport});
      page.setDefaultTimeout(5000);
      const errors=[];page.on("pageerror",e=>errors.push(e.message));
      f.db.exec("UPDATE app_users SET display_name='Trọng tài <b>an toàn</b>' WHERE id='foreign'; INSERT INTO divisions(id,tournament_id,name) VALUES('ui-division','own','Đôi');");
      await page.addInitScript(token=>localStorage.setItem("pickle-api-token-v1",token),f.tokens[actor]);
      await page.route("**/api/**",async route=>{
        const source=route.request();
        const response=await worker.fetch(new Request(source.url(),{method:source.method(),headers:source.headers(),...(source.postData()?{body:source.postData()}:{})}),f.env);
        await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
      });
      const navigate=async pageName=>{
        if(viewport.width<=760&&!await page.locator("#sidebar").evaluate(el=>el.classList.contains("open")))await page.locator("#mobileMenu").click();
        await page.locator(`[data-page="${pageName}"]`).click();
      };
      const refId=actor==="admin"?"foreign":"local",scope=actor==="admin"?"other":"own";
      try{
        await page.goto(base+"/admin.html");
        await navigate("accounts");
        const accountRow=page.locator("tr").filter({has:page.locator(`[data-edit-user="${refId}"]`)});
        assert.match(await accountRow.innerText(),actor==="admin"?/Giải khác/:/Giải của tôi/);
        await page.locator(`[data-edit-user="${refId}"]`).click();
        assert.equal(await page.locator("#euTournament").inputValue(),scope);
        assert.ok(await page.locator("#euName").inputValue());
        await page.locator("#euName").fill("Trọng tài đã sửa");
        await page.locator("#saveUserEdit").click();
        await page.waitForFunction(()=>!document.querySelector("#genericDialog").open);
        assert.equal(f.db.prepare("SELECT tournament_id_scope FROM app_users WHERE id=?").get(refId).tournament_id_scope,scope);
        await navigate("referees");
        assert.match(await page.locator("#content").innerText(),/Trọng tài đã sửa/);
        if(actor==="organizer"){
          assert.equal(await page.locator('[data-edit-referee="foreign"]').count(),0);
          assert.equal(await page.locator('[data-edit-referee="global"]').count(),0);
        }
        await page.locator(`[data-edit-referee="${refId}"]`).click();
        assert.equal(await page.locator("#erTournament").inputValue(),scope);
        const email=`updated-${actor}-${viewport.width}`;
        await page.locator("#erEmail").fill(email);await page.locator("#saveRefereeEdit").click();
        await page.waitForFunction(()=>!document.querySelector("#genericDialog").open);
        const saved=f.db.prepare("SELECT email,tournament_id_scope FROM app_users WHERE id=?").get(refId);
        assert.equal(saved.email,email);assert.equal(saved.tournament_id_scope,scope);
        assert.ok(f.db.prepare("SELECT id FROM audit_logs WHERE action='UPDATE_REFEREE' AND entity_id=?").get(refId));
        await navigate('accounts');await page.locator('[data-action="newUser"]').click();
        if(actor==='admin')await page.locator('#uRole').selectOption('referee');
        assert.equal(await page.locator('#uEmail').getAttribute('type'),'text');
        const username=`new-${actor}-${viewport.width}`;
        await page.locator('#uName').fill('Trọng tài không email');await page.locator('#uEmail').fill(username);
        await page.locator('#uTournament').selectOption(scope);await page.locator('#uPassword').fill('NoEmailReferee123!');
        await page.locator('#saveUser').click();await page.waitForFunction(()=>!document.querySelector('#genericDialog').open);
        const created=f.db.prepare('SELECT role,tournament_id_scope FROM app_users WHERE email=?').get(username);
        assert.equal(created.role,'referee');assert.equal(created.tournament_id_scope,scope);
        if(actor==="admin"){
          f.db.exec("UPDATE app_users SET display_name='Trọng tài <b>an toàn</b>' WHERE id='foreign';");
          await navigate("matches");await page.locator('[data-action="newMatch"]').click();
          assert.equal(await page.locator('#mRef option[value="foreign"]').textContent(),"Trọng tài <b>an toàn</b>");
          assert.equal(await page.locator("#genericBody b").count(),0);
        }
        assert.deepEqual(errors,[]);
        console.log("PASS account/referee real Worker UI",actor,viewport.width);
      }catch(error){failures.push(`${actor} ${viewport.width}: ${error.message}`);console.error("FAIL",failures.at(-1))}
      finally{await page.close();f.db.close()}
    }
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
assert.deepEqual(failures,[]);
console.log("ACCOUNT_UI_OK");
