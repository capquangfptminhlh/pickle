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
