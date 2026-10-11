import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {accountFixture} from '../cloudflare/tests/helpers/accounts-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{
  try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(path)){res.end('');return}
    const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
  }catch{res.writeHead(404).end()}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
try{
  for(const actor of ['admin','organizer'])for(const width of [1440,375])for(const mode of ['new-pools','existing-knockout']){
    const f=await accountFixture(),errors=[],writes=[];
    f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
    f.db.exec("UPDATE tournaments SET start_at='2026-10-11T01:00:00.000Z' WHERE id='own'; INSERT INTO divisions(id,tournament_id,name,format) VALUES('division','own','Đôi','round_robin'); INSERT INTO courts(id,tournament_id,name) VALUES('court','own','Sân 1')");
    for(let i=0;i<4;i++)f.db.prepare('INSERT INTO teams(id,division_id,name,group_code) VALUES(?,?,?,?)').run('t'+i,'division','Đội '+i,'A');
    if(mode==='existing-knockout')f.db.exec("UPDATE divisions SET format='single_elimination' WHERE id='division'; INSERT INTO matches(id,division_id,team_a_id,team_b_id,stage,bracket_slot) VALUES('final','division','t0','t1','Chung kết','SE-R1-M1')");
    const page=await browser.newPage({viewport:{width,height:900}});page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens[actor]);
    await page.route('**/api/**',async route=>{
      const r=route.request();if(r.method()==='POST')writes.push(new URL(r.url()).pathname);
      const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    try{
      await page.goto(`http://127.0.0.1:${server.address().port}/admin.html`);
      if(width<=760)await page.locator('#mobileMenu').click();
      await page.locator('[data-page="matches"]').click();
      await page.locator('[data-action="autoSchedule"]').click();
      await page.locator('#autoDivision').selectOption('division');await page.locator('#autoSubmit').click();
      await page.locator('.toast').filter({hasText:/Đã xếp .* sân/}).waitFor();
      const matches=f.db.prepare("SELECT * FROM matches WHERE division_id='division' ORDER BY scheduled_at").all();
      assert.equal(matches.length,mode==='new-pools'?6:1);
      assert.ok(matches.every(m=>m.court_id==='court'&&m.scheduled_at),'each match must actually get a court and time');
      assert.equal(writes.filter(x=>x.endsWith('/generate-round-robin')).length,mode==='new-pools'?1:0,'an existing knockout must never generate pool matches');
      assert.equal(writes.filter(x=>x.endsWith('/auto-schedule-courts')).length,1);
      for(let i=1;i<matches.length;i++)assert.ok(Date.parse(matches[i].scheduled_at)-Date.parse(matches[i-1].scheduled_at)>=20*60000);
      assert.deepEqual(errors,[]);console.log('PASS',actor,width,mode,'real Worker scheduling');
    }finally{await page.close();f.db.close()}
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
console.log('COURT_SCHEDULING_UI_OK');
