import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import axeCore from 'axe-core';

const { source: axeSource } = axeCore;
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

async function openPage(viewport,{url='/',storage=null,beforePage=null}={}) {
  const context = await browser.newContext({ viewport, serviceWorkers:'block' });
  if(storage)await context.addInitScript((value)=>localStorage.setItem('aizanoi-field-system-v3',JSON.stringify(value)),storage);
  const page = await context.newPage();
  if(beforePage)await beforePage(page);
  const errors=[];
  const requests=[];
  page.on('pageerror',(error)=>errors.push(String(error)));
  page.on('console',(message)=>{ if(message.type()==='error') errors.push(message.text()); });
  page.on('request',(request)=>requests.push(new URL(request.url()).pathname));
  await page.goto(`${base}${url}`,{waitUntil:'networkidle'});
  await page.waitForSelector('.az-desktop');
  await page.waitForFunction(()=>Boolean(window.AIZANOI_OS));
  return {context,page,errors,requests};
}

async function axe(page,label) {
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
  const blocking=result.violations.filter((item)=>['serious','critical'].includes(item.impact));
  const summary=blocking.map((item)=>({id:item.id,impact:item.impact,nodes:item.nodes.map((node)=>({target:node.target,html:node.html,failureSummary:node.failureSummary}))}));
  if(summary.length) console.error(`${label} axe blocking violations:\n${JSON.stringify(summary,null,2)}`);
  assert.deepEqual(summary,[],`${label}: serious/critical axe violations`);
}

function appModuleRequests(requests){return requests.filter((path)=>path.includes('/js/v3/apps/'));}

const retiredIds=['workbench','archive','notes','data-lab','source-reader','artifact-viewer','projects','terminal','monitor'];
const publicAppIds=['news','videos','analytics','worlds','forge','journal','labs','games','workspace','notepad','calculator','browser','camera','winamp','recycle-bin'];
const desktopAppIds=['news','videos','analytics','worlds','forge','browser','notepad','calculator','camera','winamp','games','recycle-bin'];

// Desktop: sparse wallpaper desktop, curated product + utility shortcuts, freeform window lifecycle.
{
  const {context,page,errors,requests}=await openPage({width:1440,height:900});
  assert.equal(await page.locator('.az-desktop-shortcut').count(),desktopAppIds.length,'desktop: curated shortcut count changed unexpectedly');
  for(const id of desktopAppIds) {
    assert.equal(await page.locator(`.az-desktop-shortcut[data-app="${id}"]`).count(),1,`desktop: missing shortcut ${id}`);
  }
  assert.equal(await page.locator('.az-phone-home:visible,.az-tablet-home:visible').count(),0,'desktop: device-specific home leaked into large layout');
  assert.equal(appModuleRequests(requests).length,0,'desktop: app modules must not load before app open');
  assert.equal(requests.some((path)=>path.endsWith('/styles/apps.css')),false,'desktop: app styles must remain lazy');
  assert.equal(await page.locator('.az-task-shelf').isVisible(),true,'desktop: floating dock missing');
  assert.equal((await page.locator('[data-active-app-title]').textContent())?.trim(),'Desktop','desktop: active app title should begin on Desktop');
  await axe(page,'desktop');

  await page.locator('.az-desktop').click({button:'right',position:{x:520,y:320}});
  await page.waitForSelector('.az-desktop-context.is-open');
  assert.ok(await page.locator('.az-desktop-context [role="menuitem"]').count()>=4,'desktop: context menu actions missing');
  await page.keyboard.press('Escape');

  const applicationsButton=page.locator('.az-task-shelf [data-os-launcher]');
  await applicationsButton.click();
  await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');
  assert.equal(await page.locator('.az-stage').evaluate((el)=>el.inert),true,'desktop: launcher did not use canonical inert lifecycle');
  assert.equal(await page.locator('#az-switcher-overlay .az-launchpad-item[data-app]').count(),publicAppIds.length,'desktop: launcher public-app count changed unexpectedly');
  for(const id of publicAppIds) {
    assert.equal(await page.locator(`#az-switcher-overlay .az-launchpad-item[data-app="${id}"]`).count(),1,`desktop: launcher missing public app ${id}`);
  }
  for(const id of retiredIds) {
    assert.equal(await page.locator(`#az-switcher-overlay .az-launchpad-item[data-app="${id}"]`).count(),0,`desktop: retired ${id} leaked into Applications`);
  }
  const launcherSearch=page.locator('[data-launcher-search]');
  await launcherSearch.fill('analytics');
  assert.equal(await page.locator('#az-switcher-overlay .az-launchpad-item:not([hidden])').count(),1,'desktop: launcher search did not filter to Analytics');
  await page.keyboard.press('Escape');

  await page.locator('.az-desktop-shortcut[data-app="news"]').click();
  await page.waitForSelector('.az-window[data-app-id="news"].is-active');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='news');
  assert.ok(appModuleRequests(requests).length>0,'desktop: public app did not lazy-load');
  assert.ok(requests.some((path)=>path.endsWith('/styles/apps.css')),'desktop: app styles did not lazy-load');
  assert.match((await page.locator('[data-active-app-title]').textContent())||'',/News/i,'desktop: top bar did not follow active News window');

  await page.locator('.az-desktop-shortcut[data-app="analytics"]').click();
  await page.waitForSelector('.az-window[data-app-id="analytics"].is-active');
  await page.keyboard.press('Alt+Tab');
  await page.waitForSelector('#az-switcher-overlay.is-open');
  assert.equal((await page.locator('#az-switcher-title').textContent())?.trim(),'Open Apps','desktop: Alt+Tab did not open the window switcher');
  assert.ok(await page.locator('#az-switcher-overlay [data-switch-app]').count()>=2,'desktop: open-app switcher did not list public windows');
  await page.keyboard.press('Escape');

  const analyticsBar=page.locator('.az-window[data-app-id="analytics"] .az-window-bar');
  const barBox=await analyticsBar.boundingBox();
  assert.ok(barBox,'desktop: Analytics titlebar missing for snap test');
  await page.mouse.move(barBox.x+barBox.width/2,barBox.y+barBox.height/2);
  await page.mouse.down();
  await page.mouse.move(2,barBox.y+barBox.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForTimeout(220);
  const snapped=await page.locator('.az-window[data-app-id="analytics"]').boundingBox();
  const snapStage=await page.locator('.az-stage').boundingBox();
  assert.ok(snapped&&snapStage&&snapped.x<=10,'desktop: left-edge snap did not align the window');

  await page.locator('.az-window[data-app-id="analytics"] [data-action="minimize"]').click();
  await page.waitForSelector('.az-window[data-app-id="analytics"]',{state:'hidden'});
  await page.locator('[data-dock-app="analytics"]').click();
  await page.waitForSelector('.az-window[data-app-id="analytics"].is-active');

  const searchButton=page.locator('.az-task-shelf [data-shell-action="search"]');
  await searchButton.focus(); await searchButton.click();
  await page.waitForSelector('#az-command-overlay.is-open');
  assert.equal(await page.locator('#az-command-input').getAttribute('aria-label'),'Search Aizanoi apps, worlds and commands','desktop: global search input has an ambiguous accessible name');
  assert.equal(await page.locator('.az-command-results').getAttribute('aria-label'),'Search results','desktop: global search results lack an accessible name');
  await page.keyboard.press('Escape');

  await page.locator('.az-window[data-app-id="analytics"] [data-action="close"]').click();
  await page.locator('.az-window[data-app-id="news"] [data-action="close"]').click();
  assert.equal(await page.locator('.az-window').count(),0,'desktop: close did not tear down open windows');
  assert.deepEqual(errors,[],'desktop: console/page errors');
  await context.close();
}

// Tablet: product home and launcher remain complete and touch-friendly.
{
  const {context,page,errors}=await openPage({width:900,height:1180});
  assert.equal(await page.locator('.az-tablet-home:visible').count(),1,'tablet: tablet home missing');
  assert.equal(await page.locator('.az-phone-home:visible').count(),0,'tablet: phone home leaked into tablet layout');
  assert.equal(await page.locator('.az-tablet-app[data-app]').count(),publicAppIds.length,'tablet: public app count changed unexpectedly');
  for(const id of publicAppIds)assert.equal(await page.locator(`.az-tablet-app[data-app="${id}"]`).count(),1,`tablet: missing public app ${id}`);
  assert.equal(await page.locator('[data-home-action="continue-world"],.az-device-session').count(),0,'tablet: Historical Worlds continue card returned');
  await axe(page,'tablet');
  assert.deepEqual(errors,[],'tablet: console/page errors');
  await context.close();
}

// Mobile: product home, complete app grid and no session-return card.
{
  const {context,page,errors}=await openPage({width:390,height:844});
  assert.equal(await page.locator('.az-phone-home:visible').count(),1,'mobile: phone home missing');
  assert.equal(await page.locator('.az-tablet-home:visible').count(),0,'mobile: tablet home leaked into phone layout');
  assert.equal(await page.locator('.az-phone-app[data-app]').count(),publicAppIds.length,'mobile: public app count changed unexpectedly');
  for(const id of publicAppIds)assert.equal(await page.locator(`.az-phone-app[data-app="${id}"]`).count(),1,`mobile: missing public app ${id}`);
  assert.equal(await page.locator('[data-home-action="continue-world"],.az-device-session').count(),0,'mobile: Historical Worlds continue card returned');
  await axe(page,'mobile');
  assert.deepEqual(errors,[],'mobile: console/page errors');
  await context.close();
}

await browser.close();
console.log('AizanoiOS desktop/tablet/mobile browser smoke passed');
