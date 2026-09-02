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

async function openUtility(page,id,selector=`.az-window[data-app-id="${id}"]`){
  await page.evaluate((appId)=>window.AIZANOI_OS.openApp(appId),id);
  await page.waitForSelector(selector);
}

async function captureStandalone(name,route,viewport){
  const context=await browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block'});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',(error)=>errors.push(String(error)));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(message.text());});
  const response=await page.goto(`${base}${route}`,{waitUntil:'networkidle'});
  if(!response?.ok())throw new Error(`${route} returned ${response?.status()}`);
  await page.waitForSelector('#overview-kpis .kpi');
  await page.waitForSelector('#trend-chart svg');
  await page.waitForSelector('#composition-chart svg');
  if(errors.length)throw new Error(`${route} browser errors: ${errors.join(' | ')}`);
  await page.screenshot({path:path.join(out,`${name}.png`),fullPage:true});
  await context.close();
}

await capture('aizanoi-os-00-desktop',{width:1440,height:900});
await capture('aizanoi-os-01-launchpad',{width:1440,height:900},async(page)=>{await page.locator('.az-task-shelf [data-os-launcher]').click();await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');});
await capture('aizanoi-os-02-context-menu',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop').click({button:'right',position:{x:520,y:320}});await page.waitForSelector('.az-desktop-context.is-open');});
await capture('aizanoi-os-03-news',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="news"]').click();await page.waitForSelector('.az-window[data-app-id="news"]');});
await capture('aizanoi-os-04-tv',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="videos"]').click();await page.waitForSelector('.az-window[data-app-id="videos"]');});
await capture('aizanoi-os-05-analytics',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="analytics"]').click();await page.waitForSelector('.az-window[data-app-id="analytics"]');});
await capture('aizanoi-os-06-forge',{width:1440,height:900},async(page)=>{await page.locator('.az-desktop-shortcut[data-app="forge"]').click();await page.waitForSelector('.az-window[data-app-id="forge"]');});
await capture('aizanoi-os-07-command',{width:1440,height:900},async(page)=>{await page.locator('.az-task-shelf [data-shell-action="search"]').click();await page.waitForSelector('#az-command-overlay.is-open');});
await capture('aizanoi-os-08-labs',{width:1440,height:900},async(page)=>{await openUtility(page,'labs');});
await capture('aizanoi-os-08a-calculator',{width:1440,height:900},async(page)=>{await openUtility(page,'calculator');});
await capture('aizanoi-os-08b-notepad',{width:1440,height:900},async(page)=>{await openUtility(page,'notepad');});
await capture('aizanoi-os-08c-workspace',{width:1440,height:900},async(page)=>{await openUtility(page,'workspace');});
await capture('aizanoi-os-08d-camera',{width:1440,height:900},async(page)=>{await openUtility(page,'camera');});
await capture('aizanoi-os-08e-winamp',{width:1440,height:900},async(page)=>{await openUtility(page,'winamp');});
await capture('aizanoi-os-08f-recycle-bin',{width:1440,height:900},async(page)=>{await openUtility(page,'recycle-bin');});
await capture('aizanoi-os-08g-arcade',{width:1440,height:900},async(page)=>{await openUtility(page,'games');});
await capture('aizanoi-os-08h-blockfall',{width:1440,height:900},async(page)=>{await openUtility(page,'games');await page.click('[data-play-game="blockfall"]');await page.waitForSelector('[data-bf-canvas]');});
await capture('aizanoi-os-08i-web-editor',{width:1440,height:900},async(page)=>{await openUtility(page,'web-editor');await page.waitForSelector('.az-web-editor-layout');});
await capture('aizanoi-os-08j-open-apps',{width:1440,height:900},async(page)=>{await openUtility(page,'web-editor');await page.locator('[data-os-switcher]').click();await page.waitForSelector('#az-switcher-overlay.is-open .az-switcher-item');});

await capture('aizanoi-os-09-tablet-home',{width:900,height:1180});
await capture('aizanoi-os-10-tablet-news',{width:900,height:1180},async(page)=>{await page.locator('.az-tablet-app[data-app="news"]').click();await page.waitForSelector('.az-window[data-app-id="news"]');});
await capture('aizanoi-os-11-tablet-landscape',{width:1180,height:820});
await capture('aizanoi-os-12-mobile-home',{width:390,height:844});
await capture('aizanoi-os-13-mobile-news',{width:390,height:844},async(page)=>{await page.locator('.az-phone-app[data-app="news"]').click();await page.waitForSelector('.az-window[data-app-id="news"]');});
await capture('aizanoi-os-14-mobile-app-drawer',{width:390,height:844},async(page)=>{await page.locator('.az-task-shelf [data-os-launcher]').click();await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');});
await capture('aizanoi-os-15-mobile-small',{width:320,height:568});
await captureStandalone('aizanoi-os-16-workforce-turnover','/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',{width:1440,height:900});

await browser.close();
console.log('AizanoiOS adaptive desktop/tablet/mobile and utility visual review captures complete');
