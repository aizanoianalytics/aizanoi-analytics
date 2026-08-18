import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

async function open(context){
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>!document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'),null,{timeout:5000});
  return {page,errors};
}

{
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const {page,errors}=await open(context);
  await page.evaluate(()=>openApp('chatbot'));
  await page.waitForSelector('.win.active[role="dialog"]');
  assert.equal(await page.locator('.os-v2-chat-toolbar').count(),1,'chat toolbar missing');
  assert.ok(await page.locator('.os-v2-show-desktop').count(),'show desktop missing');
  await page.locator('.os-v2-show-desktop').click();
  assert.equal(await page.locator('.win.active:visible').count(),0,'show desktop did not hide windows');
  await page.locator('.os-v2-show-desktop').click();
  assert.ok(await page.locator('.win:visible').count(),'show desktop did not restore windows');
  await page.evaluate(()=>window.__AIZANOI_CHAT__?.clear());
  assert.deepEqual(errors,[],'desktop browser errors: '+errors.join(' | '));
  await context.close();
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const {page,errors}=await open(context);
  await page.evaluate(()=>openApp('games'));
  const win=page.locator('.win.active');
  await win.waitFor();
  const box=await win.boundingBox();
  assert.ok(box && box.width<=390 && box.height<=844,'mobile window exceeds viewport');
  assert.ok(await page.locator('.win-titlebar').first().evaluate(el=>el.getBoundingClientRect().height>=30),'mobile titlebar too small');
  assert.deepEqual(errors,[],'mobile browser errors: '+errors.join(' | '));
  await context.close();
}
await browser.close();
console.log('Aizanoi OS desktop/mobile smoke passed');
