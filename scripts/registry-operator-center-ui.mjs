import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname} from 'node:path';
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
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true}),failures=[];
await mkdir(resolve(root,'ui-artifacts/operator-center'),{recursive:true});
try{
  for(const actor of ['admin','organizer'])for(const width of [1440,375]){
    const f=await accountFixture();
    const broadcasts=[];
    f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async(url,opts)=>{broadcasts.push(JSON.parse(opts.body));return new Response(null,{status:204})}})};
    f.db.exec("INSERT INTO divisions(id,tournament_id,name,event_type) VALUES('division','own','MLP 3 nữ','team')");
    for(let i=0;i<16;i++)f.db.prepare('INSERT INTO teams(id,division_id,name) VALUES(?,?,?)').run('team-'+i,'division','Đội '+(i+1));
    const page=await browser.newPage({viewport:{width,height:900}}),errors=[];
    page.setDefaultTimeout(4000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
    await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens[actor]);
    let failCreation=false,creationRequests=0;
    await page.route('**/api/**',async route=>{
      const r=route.request();
      if(r.method()==='POST'&&r.url().endsWith('/api/users/referees')){
        creationRequests++;
        if(failCreation){failCreation=false;await route.abort('failed');return}
      }
      const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers:r.headers(),...(r.postData()?{body:r.postData()}:{})}),f.env);
      await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    });
    const center=async()=>{
      await page.goto(base+'/admin.html');
      if(width<=760)await page.locator('#mobileMenu').click();
      await page.locator('[data-page="tournaments"]').click();
      await page.locator('.tour-card[data-open-tournament="own"]').click();
      await page.locator('[data-center-draw]').waitFor();
    };
    const check=async(name,fn)=>{
      try{await fn();console.log('PASS',actor,width,name)}catch(e){failures.push(`${actor} ${width} ${name}: ${e.message}`);console.error('FAIL',failures.at(-1));await page.screenshot({path:resolve(root,`ui-artifacts/operator-center/${actor}-${width}-${name}.png`)});}
    };
    try{
      await check('dashboard-entry',async()=>{
        await page.goto(base+'/admin.html');
        await page.locator('button[data-open-tournament="own"]').click();
        await page.locator('[data-center-draw]').waitFor();
        assert.match(await page.locator('#genericTitle').innerText(),/Giải của tôi/);
      });
      await check('zero-courts-draw',async()=>{
        await center();await page.locator('[data-center-draw]').click();
        await page.locator('#courtCountValue').waitFor();
        assert.equal(await page.locator('#courtCountTournament').inputValue(),'own');
        await page.locator('#courtCountValue').fill('4');await page.locator('#saveCourtCount').click();
        await page.locator('[data-flex-run]').waitFor();
        assert.equal(f.db.prepare("SELECT COUNT(*) n FROM courts WHERE tournament_id='own' AND active=1").get().n,4);
        await Promise.all([page.waitForResponse(r=>r.url().includes('/draw-config')&&r.request().method()==='PUT'),page.locator('[data-flex-save]').click()]);
        const toast=page.locator('.toast').filter({hasText:'Đã lưu thiết lập'});
        await toast.waitFor();
        assert.equal(await toast.evaluate(el=>{
          // Probe visual stacking without turning a passive notification into a permanent click target.
          const previous=el.style.pointerEvents;el.style.pointerEvents='auto';
          try{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}finally{el.style.pointerEvents=previous}
        }),true,'draw feedback must be above both dialogs');
        assert.equal(await toast.evaluate(el=>getComputedStyle(el).pointerEvents),'none','feedback must not block the draw button');
        await page.locator('[data-flex-run]').click();
        await page.waitForFunction(()=>document.querySelector('[data-center-draw]')&&!document.querySelector('.draw-setup-overlay'),null,{timeout:12000});
        assert.equal(f.db.prepare("SELECT COUNT(*) n FROM matches WHERE division_id='division'").get().n,24);
        assert.equal(f.db.prepare("SELECT COUNT(DISTINCT group_code) n FROM teams WHERE division_id='division'").get().n,4);
        assert.ok(broadcasts.some(x=>x.event==='draw:complete'));
      });
      await check('referee-create',async()=>{
        await center();await page.locator('[data-center-referees]').click();
        await page.locator('#rName').waitFor();
        assert.equal(await page.locator('#refereeError').isVisible(),false,'the form must not show an empty error panel');
        assert.equal(await page.locator('#rTournament').inputValue(),'own','center creation must retain this tournament even for super admin');
        await page.locator('#genericDialog [value="cancel"]').click();
        assert.equal(await page.locator('#genericDialog').evaluate(el=>el.open),false,'empty required fields must not block closing');
        await center();await page.locator('[data-center-referees]').click();
        await page.locator('#saveReferee').click();
        assert.match(await page.locator('#refereeError').innerText(),/Nhập tên/);
        await page.locator('#rName').fill('Trọng tài thử nghiệm');
        await page.locator('#rEmail').fill('invalid');await page.locator('#saveReferee').click();
        assert.match(await page.locator('#refereeError').innerText(),/Email không hợp lệ/);
        await page.locator('#rEmail').fill('local@test.vn');await page.locator('#rPassword').fill('short');await page.locator('#saveReferee').click();
        assert.match(await page.locator('#refereeError').innerText(),/12–64/);
        assert.equal(creationRequests,0,'invalid input must not submit');
        await page.locator('#rEmail').fill('local@test.vn');await page.locator('#rPassword').fill('LocalReferee123!');
        await page.locator('#rTournament').selectOption('own');await page.locator('#saveReferee').click();
        const error=page.locator('[role="alert"]').filter({hasText:/Email.*(sử dụng|tồn tại)/});
        await error.waitFor();
        assert.equal(await error.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,'validation must be above the modal');
        const email=`center-${actor}-${width}@test.vn`;
        await page.locator('#rEmail').fill(email);failCreation=true;await page.locator('#saveReferee').click();
        await page.locator('#refereeError').filter({hasText:/Mất kết nối/}).waitFor();
        assert.equal(await page.locator('#rEmail').inputValue(),email,'a failed request must preserve inputs');
        await page.locator('#rPassword').press('Enter');
        await page.waitForFunction(()=>!document.querySelector('#genericDialog').open);
        const saved=f.db.prepare('SELECT * FROM app_users WHERE email=?').get(email);
        assert.equal(saved.role,'referee');assert.equal(saved.tournament_id_scope,'own');
        const login=await f.api('/api/auth/login',{email,password:'LocalReferee123!'},'POST');
        assert.equal(login.status,200);
        await page.screenshot({path:resolve(root,`ui-artifacts/operator-center/${actor}-${width}-success.png`)});
        assert.deepEqual(errors,[]);
      });
    }finally{await page.close();f.db.close()}
  }
}finally{await browser.close();await new Promise(r=>server.close(r))}
assert.deepEqual(failures,[]);
console.log('OPERATOR_CENTER_UI_OK');
