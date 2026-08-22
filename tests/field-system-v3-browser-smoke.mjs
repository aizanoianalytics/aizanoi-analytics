import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import axeCore from 'axe-core';

const { source: axeSource } = axeCore;
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

async function openPage(viewport) {
  const context = await browser.newContext({ viewport, serviceWorkers:'block' });
  const page = await context.newPage();
  const errors=[];
  const requests=[];
  page.on('pageerror',(error)=>errors.push(String(error)));
  page.on('console',(message)=>{ if(message.type()==='error') errors.push(message.text()); });
  page.on('request',(request)=>requests.push(new URL(request.url()).pathname));
  await page.goto(`${base}/`,{waitUntil:'networkidle'});
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

// Desktop: sparse wallpaper desktop, public catalog only, freeform window lifecycle.
{
  const {context,page,errors,requests}=await openPage({width:1440,height:900});
  assert.equal(await page.locator('.az-desktop-shortcut').count(),5,'desktop: expected five core Aizanoi shortcuts');
  for(const id of ['news','videos','analytics','worlds','forge']) {
    assert.equal(await page.locator(`.az-desktop-shortcut[data-app="${id}"]`).count(),1,`desktop: missing core shortcut ${id}`);
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
  assert.equal(await page.locator('#az-switcher-overlay .az-launchpad-item[data-app]').count(),8,'desktop: launcher public-app count changed unexpectedly');
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

  const searchButton=page.locator('[data-shell-action="search"]').first();
  await searchButton.focus(); await searchButton.click();
  await page.waitForSelector('#az-command-overlay.is-open');
  assert.equal(await page.locator('.az-stage').evaluate((el)=>el.inert),true,'desktop: command dialog did not inert app stage');
  await page.waitForFunction(()=>document.activeElement?.id==='az-command-input');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#az-command-overlay',{state:'hidden'});
  assert.equal(await searchButton.evaluate((el)=>el===document.activeElement),true,'desktop: command dialog did not restore opener focus');

  await page.evaluate(()=>window.AIZANOI_OS.openApp('forge'));
  await page.waitForSelector('.az-window[data-app-id="forge"].is-active');
  await page.evaluate(()=>window.AIZANOI_OS.openApp('games'));
  await page.waitForSelector('.az-window[data-app-id="games"].is-active');
  assert.match(page.url(),/[?&]app=games(?:&|$)/);
  await page.goBack();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='forge');
  await page.waitForFunction(()=>document.querySelector('.az-window[data-app-id="forge"]')?.classList.contains('is-active'));
  assert.equal(await page.locator('.az-window[data-app-id="games"]').count(),1,'desktop: Back incorrectly destroyed another open app');

  const retiredRuntime=await page.evaluate((ids)=>ids.map((id)=>({id,known:Boolean(window.AIZANOI_OS.appById?.(id))})),retiredIds);
  assert.deepEqual(retiredRuntime.map((item)=>item.known),retiredRuntime.map(()=>false),'desktop: retired app ids remain runtime-addressable');

  assert.deepEqual(errors,[],`desktop console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Tablet: dedicated two-pane home and focused large-window workspace.
{
  const {context,page,errors}=await openPage({width:900,height:1180});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'expanded');
  assert.equal(await page.locator('.az-tablet-home').isVisible(),true,'tablet: dedicated tablet home missing');
  assert.equal(await page.locator('.az-phone-home').isVisible(),false,'tablet: phone home leaked into tablet');
  assert.equal(await page.locator('.az-tablet-app').count(),8,'tablet: expected all eight public apps');
  assert.equal(await page.locator('.az-tablet-feature').count(),2,'tablet: supporting feature cards missing');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'tablet: root horizontal overflow');
  await axe(page,'tablet home');

  await page.locator('.az-tablet-app[data-app="news"]').click();
  await page.waitForSelector('.az-window[data-app-id="news"].is-active');
  const rect=await page.locator('.az-window[data-app-id="news"]').boundingBox();
  assert.ok(rect && rect.x>=0 && rect.y>=0 && rect.x+rect.width<=901 && rect.y+rect.height<=1181,'tablet: focused app window escaped viewport');
  assert.deepEqual(errors,[],`tablet console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Mobile: phone-like home, compact dock, fullscreen public apps.
{
  const {context,page,errors}=await openPage({width:390,height:844});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'compact');
  assert.equal(await page.locator('.az-phone-home').isVisible(),true,'mobile: phone home missing');
  assert.equal(await page.locator('.az-tablet-home').isVisible(),false,'mobile: tablet home leaked into compact layout');
  assert.equal(await page.locator('.az-phone-app').count(),8,'mobile: public app grid incomplete');
  assert.equal(await page.locator('.az-phone-widget').count(),2,'mobile: glanceable widget pair missing');
  assert.equal(await page.locator('.az-task-shelf [data-dock-app="forge"]').isVisible(),false,'mobile: compact dock should not include Forge');
  assert.equal(await page.locator('.az-task-shelf .az-shelf-running').isVisible(),false,'mobile: running-app strip should not expand compact dock');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile: root horizontal overflow');

  const interactive=page.locator('button:visible,a.az-button:visible');
  const count=await interactive.count();
  for(let i=0;i<count;i++){
    const node=interactive.nth(i); const box=await node.boundingBox(); if(!box)continue;
    const name=await node.evaluate((el)=>el.getAttribute('aria-label')||el.textContent?.trim()||el.getAttribute('title')||'');
    assert.ok(name.trim(),`mobile: unnamed visible interactive target at index ${i}`);
    assert.ok(box.height>=43.5,`mobile: target below 44px (${box.height.toFixed(1)}px): ${name}`);
  }
  await axe(page,'mobile home');

  await page.locator('.az-phone-app[data-app="news"]').click();
  await page.waitForSelector('.az-window[data-app-id="news"].is-active');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='news');
  const win=await page.locator('.az-window[data-app-id="news"]').boundingBox();
  const stage=await page.locator('.az-stage').boundingBox();
  assert.ok(win && stage && Math.abs(win.x-stage.x)<=1 && Math.abs(win.y-stage.y)<=1 && Math.abs(win.width-stage.width)<=1 && Math.abs(win.height-stage.height)<=1,`mobile: public app does not fill compact shell stage; window=${JSON.stringify(win)} stage=${JSON.stringify(stage)}`);
  await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.az-task-shelf-wrap')).opacity)<0.1);
  const dockOpacity=Number(await page.locator('.az-task-shelf-wrap').evaluate((el)=>getComputedStyle(el).opacity));
  assert.ok(dockOpacity<0.1,'mobile: home dock should retreat while a fullscreen app is active');

  await page.locator('.az-window[data-app-id="news"] [data-action="close"]').click();
  await page.waitForSelector('.az-window[data-app-id="news"]',{state:'detached'});
  assert.equal(await page.locator('.az-phone-home').isVisible(),true,'mobile: closing fullscreen app did not return to phone home');

  await page.locator('.az-task-shelf [data-os-launcher]').click();
  await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');
  const launchpadRect=await page.locator('.az-launchpad').boundingBox();
  assert.ok(launchpadRect && launchpadRect.width>=389,'mobile: Applications drawer is not full-width');
  for(const id of retiredIds) {
    assert.equal(await page.locator(`#az-switcher-overlay .az-launchpad-item[data-app="${id}"]`).count(),0,`mobile: retired ${id} leaked into app drawer`);
  }
  await page.keyboard.press('Escape');

  assert.deepEqual(errors,[],`mobile console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log('AizanoiOS adaptive desktop/tablet/mobile Chromium smoke passed');
