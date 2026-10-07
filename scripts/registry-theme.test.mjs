import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let chromium;
try{({chromium}=require('playwright'))}catch{({chromium}=require(resolve(process.env.CODEX_NODE_MODULES||resolve(dirname(process.execPath),'../node_modules'),'playwright')))}
const root=fileURLToPath(new URL('../',import.meta.url));
test('theme preference defaults to white, survives navigation, and synchronizes tabs',async()=>{
  const server=createServer(async(req,res)=>{try{
    const path=new URL(req.url,'http://localhost').pathname;
    if(path.endsWith('/theme-sw-setup.html')){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>SW fixture</title>');return}
    if(path.startsWith('/api/')){res.setHeader('Content-Type','application/json');res.end('{"user":null}');return}
    if(path==='/assets/pwa.js'){res.end('');return}
    const full=resolve(root,'.'+path);if(!full.startsWith(root)){res.writeHead(403).end();return}
    res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(full)]||'application/octet-stream');
    res.end(await readFile(full));
  }catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const base=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:375,height:812},colorScheme:'dark'}),page=await context.newPage(),other=await context.newPage();
    await page.goto(base+'/offline.html');await other.goto(base+'/offline.html');
    assert.equal(await page.locator('html').getAttribute('data-theme'),'light','first visit defaults to light');
    const toggle=page.locator('#themeToggle');assert.ok(await toggle.isVisible());assert.ok((await toggle.boundingBox()).height>=44);
    await toggle.click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
    assert.equal(await page.evaluate(()=>localStorage.getItem('pickleup-theme-v2')),'dark');
    await other.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
    await page.goto(base+'/login.html');assert.equal(await page.locator('html').getAttribute('data-theme'),'dark','navigation retains preference');
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#101914');
    await page.locator('#themeToggle').click();await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'),'#f4f7f4');
    await page.goto(base+'/preview/offline.html');assert.equal(await page.locator('html').getAttribute('data-theme'),'light');
    await context.close();
    const blocked=await browser.newContext(),blockedPage=await blocked.newPage(),errors=[];
    blockedPage.on('pageerror',e=>errors.push(e.message));
    await blockedPage.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage unavailable','SecurityError')}}));
    await blockedPage.goto(base+'/offline.html');assert.equal(await blockedPage.locator('html').getAttribute('data-theme'),'light');
    await blockedPage.locator('#themeToggle').click();assert.equal(await blockedPage.locator('html').getAttribute('data-theme'),'dark');assert.deepEqual(errors,[]);
    await blocked.close();
    for(const scope of ['/','/preview/']){
      const offline=await browser.newContext(),offlinePage=await offline.newPage();
      const offlineEvents=[];
      offlinePage.on('pageerror',error=>offlineEvents.push({type:'pageerror',message:error.message}));
      offlinePage.on('console',message=>{if(message.type()==='error')offlineEvents.push({type:'console',message:message.text()})});
      offlinePage.on('requestfailed',request=>offlineEvents.push({type:'requestfailed',url:request.url(),failure:request.failure()}));
      offlinePage.on('response',response=>{if(response.url().includes('theme.')||response.request().isNavigationRequest())offlineEvents.push({type:'response',url:response.url(),status:response.status(),fromServiceWorker:response.fromServiceWorker(),headers:response.headers()})});
      await offlinePage.goto(base+scope+'theme-sw-setup.html');
      await offlinePage.evaluate(async script=>{
        await navigator.serviceWorker.register(script);await navigator.serviceWorker.ready;
        if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      },scope+'service-worker.js');
      await offline.setOffline(true);await offlinePage.goto(base+scope+'never-cached.html');
      if(await offlinePage.locator('html').getAttribute('data-theme')!=='light')console.error('THEME_OFFLINE_DIAGNOSTIC',JSON.stringify({scope,browser:browser.version(),events:offlineEvents,state:await offlinePage.evaluate(async()=>({url:location.href,title:document.title,html:document.documentElement.outerHTML.slice(0,4000),controller:navigator.serviceWorker.controller?.scriptURL,caches:await Promise.all((await caches.keys()).map(async name=>{const cache=await caches.open(name);return {name,keys:(await cache.keys()).map(request=>request.url),theme:await (await cache.match(new URL('/assets/theme.js?v=1',location.origin)))?.text()}}))}))}));
      assert.equal(await offlinePage.locator('html').getAttribute('data-theme'),'light',scope+' first offline fallback loads cached theme');
      assert.equal(await offlinePage.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(244, 247, 244)');
      await offlinePage.locator('#themeToggle').click();assert.equal(await offlinePage.locator('html').getAttribute('data-theme'),'dark');
      assert.equal(await offlinePage.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(16, 25, 20)');
      await offline.close();
    }
  }finally{await browser.close();await new Promise(r=>server.close(r))}
});
