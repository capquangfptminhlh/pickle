import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {accountFixture} from '../cloudflare/tests/helpers/accounts-fixture.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
let browser,server,base;
before(async()=>{
  server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
    const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
  }catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${server.address().port}`;browser=await chromium.launch();
});
after(async()=>{await browser?.close();if(server)await new Promise(r=>server.close(r))});
async function harness(width,mode){
  const f=await accountFixture(),page=await browser.newPage({viewport:{width,height:900}}),errors=[];
  page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.organizer);
  let failed=false,posts=0;
  await page.route('**/api/**',async route=>{
    const r=route.request(),url=new URL(r.url());
    if(r.method()==='POST'&&url.pathname==='/api/tournaments'){
      posts++;if(mode==='double-click')await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(mode==='court-failure'&&!failed&&r.method()==='POST'&&url.pathname.endsWith('/courts')){failed=true;await route.abort('failed');return}
    const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
    if(mode==='lost-court-response'&&!failed&&r.method()==='POST'&&url.pathname.endsWith('/courts')){failed=true;await route.abort('failed');return}
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
  });
  await page.goto(base+'/admin.html');await page.locator('[data-page="tournaments"]').waitFor({state:'attached'});
  if(width<=760)await page.locator('#mobileMenu').click();await page.locator('[data-page="tournaments"]').click();
  await page.locator('[data-action="newTournament"]').click();await page.locator('#fName').fill('Recovery QA');await page.locator('#fCourtCount').fill('2');
  return {...f,page,errors,posts:()=>posts,close:async()=>{await page.close();f.db.close()}};
}
for(const width of [1440,375]){
  test(`organizer can set rules for an existing division from its center at ${width}px`,async()=>{
    const h=await harness(width,'none');try{
      h.db.exec("INSERT INTO divisions(id,tournament_id,name,event_type) VALUES('rule-division','own','Đôi QA','doubles')");
      await h.page.locator('#genericDialog [value="cancel"]').click();await h.page.reload();
      await h.page.locator('[data-page="tournaments"]').waitFor({state:'attached'});
      if(width<=760)await h.page.locator('#mobileMenu').click();await h.page.locator('[data-page="tournaments"]').click();
      await h.page.locator('[data-open-tournament="own"]').click();
      await h.page.locator('[data-center-rules="rule-division"]').click();
      await h.page.locator('#crudDPoints').selectOption('15');await h.page.locator('#crudDBest').selectOption('1');
      await h.page.locator('#crudDScoring').selectOption('rally');await h.page.locator('#crudSaveD').click();
      await h.page.locator('#genericDialog').waitFor({state:'hidden'});
      const d=h.db.prepare("SELECT * FROM divisions WHERE id='rule-division'").get();assert.equal(d.points_to_win,15);assert.equal(d.best_of,1);assert.equal(d.scoring_mode,'rally');assert.equal(d.win_by_two,1);
      assert.deepEqual(h.errors,[]);
    }finally{await h.close()}
  });
 for(const mode of ['court-failure','lost-court-response']){
  test(`retry after ${mode} does not duplicate the tournament at ${width}px`,async()=>{
    const h=await harness(width,mode);try{
      await h.page.locator('#saveTournament').click();await h.page.locator('.toast').filter({hasText:'Không thể tạo giải'}).waitFor();
      assert.equal(h.db.prepare("SELECT count(*) n FROM tournaments WHERE name='Recovery QA'").get().n,1);
      await h.page.locator('#saveTournament').click();await h.page.locator('#genericDialog').waitFor({state:'hidden'});
      assert.equal(h.db.prepare("SELECT count(*) n FROM tournaments WHERE name='Recovery QA'").get().n,1,'retry must finish the existing tournament');
      assert.equal(h.posts(),1,'retry must not send CREATE again');
      const tid=h.db.prepare("SELECT id FROM tournaments WHERE name='Recovery QA'").get().id;
      assert.equal(h.db.prepare('SELECT count(*) n FROM courts WHERE tournament_id=?').get(tid).n,2);assert.deepEqual(h.errors,[]);
    }finally{await h.close()}
  });
 }
  test(`double click during tournament creation sends one request at ${width}px`,async()=>{
    const h=await harness(width,'double-click');try{
      await h.page.locator('#saveTournament').dblclick();await h.page.locator('#genericDialog').waitFor({state:'hidden'});
      assert.equal(h.posts(),1);assert.equal(h.db.prepare("SELECT count(*) n FROM tournaments WHERE name='Recovery QA'").get().n,1);assert.deepEqual(h.errors,[]);
    }finally{await h.close()}
  });
}
