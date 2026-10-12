import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
import worker from '../cloudflare/src/index.js';
import {accountFixture} from '../cloudflare/tests/helpers/accounts-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer(async(req,res)=>{try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(['/socket.io/socket.io.js','/assets/pwa.js'].includes(pathname)){res.end('');return}
  const full=resolve(root,'.'+pathname);if(!full.startsWith(root)){res.writeHead(403).end();return}
  res.setHeader('Content-Type',({'.js':'application/javascript','.html':'text/html','.css':'text/css','.svg':'image/svg+xml'})[extname(full)]||'application/octet-stream');res.end(await readFile(full));
}catch{res.writeHead(404).end()}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{})});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=','base64');
try{
 for(const width of [375,1440]){
  const f=await accountFixture(),objects=new Map();
  f.db.exec("UPDATE tournaments SET public_visible=1 WHERE id='own'");
  f.env.MEDIA={put:async(k,b,o)=>objects.set(k,{bytes:new Uint8Array(b),type:o.httpMetadata.contentType}),delete:async k=>objects.delete(k),get:async k=>{const o=objects.get(k);return o?{body:o.bytes,httpEtag:'test',writeHttpMetadata:h=>h.set('Content-Type',o.type)}:null}};
  f.env.ROOMS={idFromName:x=>x,get:()=>({fetch:async()=>new Response(null,{status:204})})};
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!/favicon|WebSocket connection|status of 400/.test(m.text()))errors.push(m.text())});
  await page.addInitScript(token=>localStorage.setItem('pickle-api-token-v1',token),f.tokens.organizer);
  await page.route('**/api/**',async route=>{const r=route.request(),headers=r.headers();if(!headers.authorization)headers.authorization='Bearer '+f.tokens.organizer;const response=await worker.fetch(new Request(r.url(),{method:r.method(),headers,...(r.postDataBuffer()?{body:r.postDataBuffer()}:{})}),f.env);await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())})});
  await page.goto(base+'/admin.html');await page.locator('#mobileMenu').waitFor({state:'attached',timeout:5000}).catch(async()=>{throw new Error('Admin shell missing at '+page.url()+' title='+await page.title())});if(width<=760)await page.locator('#mobileMenu').click();await page.locator('[data-page="tournaments"]').click();
  await page.locator('[data-gallery-tournament="own"]').first().click();await page.locator('.gallery-manager').waitFor();
  assert.match(await page.locator('.gallery-local-note').count()?await page.locator('.gallery-local-note').textContent():'',/^$/,'production manager must not claim local-only storage');
  await page.locator('.gallery-manager input[type=file]').setInputFiles([
    {name:'memory-1.png',mimeType:'image/png',buffer:png},
    {name:'broken.png',mimeType:'image/png',buffer:Buffer.from('not an image')},
    {name:'memory-2.png',mimeType:'image/png',buffer:png}
  ]);
  await page.locator('.gallery-manager textarea[aria-label="Chú thích ảnh mới"]').fill('<b>Kỷ niệm vui</b>');
  await page.locator('[data-gallery-upload]').click();await page.waitForFunction(()=>document.querySelector('.gallery-status')?.textContent?.includes('Đã tải'));
  assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_photos WHERE removed_at IS NULL').get().n,2);
  assert.equal(await page.locator('.gallery-error').count(),1,'one malformed file reports an isolated error');
  const first=f.db.prepare('SELECT id FROM tournament_photos WHERE removed_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1').get();
  await page.locator(`[data-gallery-caption="${first.id}"]`).fill('Đã chỉnh chú thích');await page.locator(`[data-gallery-save="${first.id}"]`).click();
  await page.waitForFunction(id=>document.querySelector(`[data-gallery-caption="${id}"]`)?.value==='Đã chỉnh chú thích',first.id);
  assert.equal(await page.locator('.gallery-manager').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  await page.locator('[data-gallery-close]').first().click();
  await page.goto(base+'/tournament.html?id=own');await page.locator('[data-gallery-view]').first().waitFor();
  assert.equal(await page.locator('#tourGallery').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true);
  assert.equal(await page.locator('[data-gallery-view]').count(),2);assert.ok((await page.locator('.gallery-caption').allTextContents()).includes('Đã chỉnh chú thích'));
  await page.locator('[data-gallery-view]').first().click();await page.locator('.gallery-viewer').waitFor();await page.keyboard.press('ArrowRight');await page.locator('.gallery-viewer-nav span').filter({hasText:'2 / 2'}).waitFor();await page.keyboard.press('Escape');
  await page.locator('.gallery-viewer').waitFor({state:'detached'});
  await page.goto(base+'/admin.html');if(width<=760)await page.locator('#mobileMenu').click();await page.locator('[data-page="tournaments"]').click();await page.locator('[data-gallery-tournament="own"]').first().click();
  await page.locator(`[data-gallery-remove="${first.id}"]`).click();await page.locator(`[data-gallery-confirm-remove="${first.id}"]`).click();
  await page.waitForFunction(()=>document.querySelectorAll('.gallery-photo-card').length===1);assert.equal(f.db.prepare('SELECT count(*) n FROM tournament_photos WHERE removed_at IS NULL').get().n,1);
  assert.deepEqual(errors,[]);
  await context.close();f.db.close();
 }
 console.log('GALLERY_UI_OK admin upload and public viewer at 375/1440');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
