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
  await page.waitForSelector('.az-desktop');
  await page.waitForFunction(()=>Boolean(window.AIZANOI_OS));
  await page.evaluate(()=>{try{localStorage.removeItem('aizanoi-field-system-v3');}catch(_){}}); 
  if(action)await action(page);
  await page.waitForTimeout(300);
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:false});
  await context.close();
}

await capture('aizanoi-os-00-desktop',{width:1440,height:900});
await capture('aizanoi-os-01-launchpad',{width:1440,height:900},async(page)=>{await page.locator('.az-task-shelf [data-os-launcher]').click();await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');});
await capture('aizanoi-os-02-context-menu',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop').click({button:'right',position:{x:520,y:320}});await page.waitForSelector('.az-desktop-context.is-open');});
await capture('aizanoi-os-03-news',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="news"]').click();await page.waitForSelector('.az-window[data-app-id="news"]');});
await capture('aizanoi-os-04-tv',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="videos"]').click();await page.waitForSelector('.az-window[data-app-id="videos"]');});
await capture('aizanoi-os-05-analytics',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="analytics"]').click();await page.waitForSelector('.az-window[data-app-id="analytics"]');});
await capture('aizanoi-os-06-forge',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="forge"]').click();await page.waitForSelector('.az-window[data-app-id="forge"]');});
await capture('aizanoi-os-07-command',{width:1440,height:900},async(page)=>{await page.locator('[data-shell-action="search"]').first().click();await page.waitForSelector('#az-command-overlay.is-open');});
await capture('aizanoi-os-08-labs',{width:1440,height:900},async(page)=>{await page.evaluate(()=>window.AIZANOI_OS.openApp('labs'));await page.waitForSelector('.az-window[data-app-id="labs"]');});

await capture('aizanoi-os-09-tablet-home',{width:900,height:1180});
await capture('aizanoi-os-10-tablet-news',{width:900,height:1180},async(page)=>{await page.locator('.az-tablet-app[data-app="news"]').click();await page.waitForSelector('.az-window[data-app-id="news"]');});
await capture('aizanoi-os-11-tablet-landscape',{width:1180,height:820});

await capture('aizanoi-os-12-mobile-home',{width:390,height:844});
await capture('aizanoi-os-13-mobile-news',{width:390,height:844},async(page)=>{await page.locator('.az-phone-app[data-app="news"]').click();await page.waitForSelector('.az-window[data-app-id="news"]');});
await capture('aizanoi-os-14-mobile-app-drawer',{width:390,height:844},async(page)=>{await page.locator('.az-task-shelf [data-os-launcher]').click();await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');});
await capture('aizanoi-os-15-mobile-small',{width:320,height:568});

await browser.close();
console.log('AizanoiOS adaptive desktop/tablet/mobile visual review captures complete');
