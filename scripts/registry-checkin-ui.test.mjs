import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const html=await readFile(new URL('../checkin.html',import.meta.url),'utf8');
const script=await readFile(new URL('../assets/checkin.js',import.meta.url),'utf8');
for(const width of [375,1440])for(const checked_in_at of [null,'2026-10-01T12:00:00Z']){
 test(`cancelled QR hides attendance controls at ${width}px (checked in: ${!!checked_in_at})`,async()=>{
  const browser=await chromium.launch();try{
   const page=await browser.newPage({viewport:{width,height:900}});
   await page.route('https://test.invalid/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
   await page.goto('https://test.invalid/checkin.html?token=cancelled');
   await page.evaluate(checked=>{window.PickleAPI={publicCheckin:async()=>({status:'cancelled',team_name:'Đội đã hủy',checked_in_at:checked}),confirmCheckin:async()=>{throw new Error('Cancelled QR must never submit')}}},checked_in_at);
   await page.addScriptTag({content:script});
   await page.locator('#checkinStatus').filter({hasText:'ĐÃ HỦY'}).waitFor({timeout:1500});
   assert.equal(await page.locator('#confirmCheckin').isHidden(),true);
   assert.ok((await page.locator('#checkinNote').innerText()).includes('đã hủy'));
  }finally{await browser.close()}
 });
}
test('cancellation after opening QR refreshes the status and removes the confirm button',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.route('https://test.invalid/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
  await page.goto('https://test.invalid/checkin.html?token=race');
  await page.evaluate(()=>{let cancelled=false;window.PickleAPI={publicCheckin:async()=>({status:cancelled?'cancelled':'approved',team_name:'Đội',checked_in_at:null}),confirmCheckin:async()=>{cancelled=true;throw Object.assign(new Error('REGISTRATION_CANCELLED'),{status:409})}}});
  await page.addScriptTag({content:script});await page.locator('#confirmCheckin').click();
  await page.locator('#checkinStatus').filter({hasText:'ĐÃ HỦY'}).waitFor({timeout:1500});
  assert.equal(await page.locator('#confirmCheckin').isHidden(),true);
 }finally{await browser.close()}
});
test('confirmed check-in renders checked state and sweeps the identity once',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.route('https://test.invalid/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
  await page.addInitScript(()=>{window.__sweeps=[];window.PickleMotion={matchWin:target=>window.__sweeps.push(target)}});
  await page.goto('https://test.invalid/checkin.html?token=ok');
  await page.evaluate(()=>{let checked=null;window.PickleAPI={publicCheckin:async()=>({id:'registration<&',status:'approved',team_name:'Đội A',checked_in_at:checked}),confirmCheckin:async()=>{checked='2026-10-01T12:00:00Z';return {checked_in_at:checked}}}});
  await page.addScriptTag({content:script});
  const control=page.locator('#confirmCheckin');await control.waitFor({state:'visible'});await control.click();
  await page.locator('#checkinStatus').filter({hasText:'ĐÃ CHECK-IN'}).waitFor();
  assert.equal(await page.locator('#checkinTeam').getAttribute('data-motion-state'),'checked-in');
  assert.equal(await page.locator('#checkinTeam').getAttribute('data-motion-success'),'1');
  assert.equal(await page.evaluate(()=>window.__sweeps.length),1);
  assert.equal(await page.locator('#checkinTeam').getAttribute('data-motion-key'),'registration:registration<&');
  assert.equal(await page.evaluate(()=>window.__sweeps[0]===document.querySelector('#checkinTeam')),true);
 }finally{await browser.close()}
});
test('a registration already checked in on page load does not replay the success sweep',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.route('https://test.invalid/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
  await page.goto('https://test.invalid/checkin.html?token=already-checked');
  await page.evaluate(()=>{window.PickleAPI={publicCheckin:async()=>({id:'registration-1',status:'approved',team_name:'Đội A',checked_in_at:'2026-10-01T12:00:00Z'}),confirmCheckin:async()=>{throw new Error('Already checked in')}}});
  await page.addScriptTag({content:script});
  await page.locator('#checkinStatus').filter({hasText:'ĐÃ CHECK-IN'}).waitFor();
  assert.equal(await page.locator('#checkinTeam').getAttribute('data-motion-state'),'checked-in');
  assert.equal(await page.locator('#checkinTeam').getAttribute('data-motion-success'),null);
 }finally{await browser.close()}
});
test('rejected check-in keeps the pending controls and reports an error motion',async()=>{
 const browser=await chromium.launch();try{
  const page=await browser.newPage();
  await page.route('https://test.invalid/**',route=>route.fulfill({contentType:'text/html',body:html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'')}));
  await page.addInitScript(()=>{window.__errors=[];window.PickleMotion={error:target=>window.__errors.push(target)}});
  await page.goto('https://test.invalid/checkin.html?token=bad');
  await page.evaluate(()=>{window.PickleAPI={publicCheckin:async()=>({status:'approved',team_name:'Đội A',checked_in_at:null}),confirmCheckin:async()=>{throw new Error('network down')}}});
  await page.addScriptTag({content:script});
  const control=page.locator('#confirmCheckin');await control.waitFor({state:'visible'});await control.click();
  await page.locator('#checkinNote').filter({hasText:'Không thể xác nhận: network down'}).waitFor();
  assert.equal(await page.locator('#checkinStatus').innerText(),'CHƯA CHECK-IN');
  assert.equal(await control.isVisible(),true);
  assert.equal(await page.evaluate(()=>window.__errors.length),1);
  assert.equal(await page.evaluate(()=>window.__errors[0]===document.querySelector('#confirmCheckin')),true);
 }finally{await browser.close()}
});
