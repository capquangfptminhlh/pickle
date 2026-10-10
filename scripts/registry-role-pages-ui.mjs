import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {accountFixture} from '../cloudflare/tests/helpers/accounts-fixture.mjs';
import {signSession} from '../cloudflare/src/auth.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
 const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
 res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch(),failures=[],results=[];
await mkdir(resolve(root,'ui-artifacts/roles'),{recursive:true});
try{
 for(const actor of ['admin','organizer','local','manager','finance'])for(const width of [1440,375]){
  const f=await accountFixture(),errors=[],apiFailures=[];
  f.db.exec("INSERT INTO clubs(id,name,slug) VALUES('club','QA club','qa-club'); INSERT INTO app_users(id,email,display_name,role,club_id,password_hash) VALUES('manager','manager@test.vn','QA manager','club_manager','club','unused'),('finance','finance@test.vn','QA finance','finance','club','unused')");
  for(const id of ['manager','finance'])f.tokens[id]=await signSession(f.env,f.db.prepare('SELECT * FROM app_users WHERE id=?').get(id));
  const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.stack||e.message));
  await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens[actor]);
  await page.route('**/api/**',async route=>{
   const r=route.request(),response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
   const body=await response.text();if(response.status>=400)apiFailures.push({path:new URL(r.url()).pathname,status:response.status,body});
   await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
  });
  try{
   await page.goto(base+'/admin.html');await page.locator('#content .panel, #content .club-home-hero').first().waitFor();
   const pages=await page.locator('[data-page]').evaluateAll(nodes=>nodes.map(n=>n.dataset.page));
   for(const id of pages){
    if(width<=760&&!await page.locator('#sidebar').evaluate(el=>el.classList.contains('open')))await page.locator('#mobileMenu').click();
    await page.locator(`[data-page="${id}"]`).click();
    await page.waitForFunction(id=>document.querySelector('#nav .nav-btn.active')?.dataset.page===id,id);
    // Pages rendered from existing state make no request; networkidle from the
    // initial navigation cannot tell us whether their view transition finished.
    await page.waitForFunction(()=>!document.documentElement.dataset.navDirection);
    assert.ok((await page.locator('#content').innerText()).trim(),`${id}: empty page`);
    assert.deepEqual(apiFailures,[],`${id}: UI must not silently turn an API failure into an empty list`);
    assert.deepEqual(errors,[],`${id}: browser errors`);
    results.push({actor,width,page:id,title:await page.locator('#pageTitle').innerText(),status:'pass'});
    console.log('PASS',actor,width,id);
   }
  }catch(e){failures.push(`${actor} ${width}: ${e.message}`);console.error('FAIL',failures.at(-1));await page.screenshot({path:resolve(root,`ui-artifacts/roles/${actor}-${width}.png`)})}
  finally{await page.close();f.db.close()}
 }
}finally{await browser.close();await new Promise(r=>server.close(r))}
await writeFile(resolve(root,'ui-artifacts/roles/report.json'),JSON.stringify({results,failures},null,2));
assert.deepEqual(failures,[]);console.log('ROLE_PAGES_UI_OK',results.length);
