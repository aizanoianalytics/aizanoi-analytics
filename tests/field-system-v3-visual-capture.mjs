import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';
const out=path.join(process.cwd(),'artifacts/final-visual-review');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true});

async function capture(name,viewport,action){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();
  await page.goto(`${base}/`,{waitUntil:'networkidle'});
  await page.waitForSelector('.az-home');
  await page.evaluate(()=>{try{localStorage.removeItem('aizanoi-field-system-v3');}catch(_){}});
  if(action)await action(page);
  await page.waitForTimeout(250);
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:false});
  await context.close();
}

await capture('v3-00-desktop-home',{width:1440,height:900});
await capture('v3-01-desktop-archive',{width:1440,height:900},async(page)=>{await page.locator('[data-app="archive"]').first().click();await page.waitForSelector('.az-archive-layout');});
await capture('v3-02-desktop-notes',{width:1440,height:900},async(page)=>{await page.locator('[data-app="notes"]').first().click();await page.waitForSelector('.az-notes-layout');});
await capture('v3-03-desktop-terminal',{width:1440,height:900},async(page)=>{await page.evaluate(()=>window.AIZANOI_FIELD_SYSTEM.openApp('terminal'));await page.waitForSelector('.az-terminal');});
await capture('v3-04-desktop-command',{width:1440,height:900},async(page)=>{await page.locator('[data-shell-action="search"]').first().click();await page.waitForSelector('#az-command-overlay.is-open');});
await capture('v3-05-tablet-home',{width:900,height:1180});
await capture('v3-06-tablet-archive',{width:900,height:1180},async(page)=>{await page.locator('[data-app="archive"]').first().click();await page.waitForSelector('.az-archive-layout');});
await capture('v3-07-mobile-home',{width:390,height:844});
await capture('v3-08-mobile-archive',{width:390,height:844},async(page)=>{await page.locator('[data-app="archive"]').first().click();await page.waitForSelector('.az-archive-layout');});
await capture('v3-09-mobile-command',{width:390,height:844},async(page)=>{await page.locator('[data-shell-action="search"]').first().click();await page.waitForSelector('#az-command-overlay.is-open');});

await browser.close();
console.log('Field System v3 desktop/tablet/mobile visual review captures complete');
