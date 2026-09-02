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
const publicAppIds=['news','videos','analytics','worlds','forge','journal','labs','games','workspace','notepad','web-editor','calculator','browser','camera','winamp','recycle-bin'];
const desktopAppIds=['news','videos','analytics','worlds','forge','browser','notepad','web-editor','calculator','camera','winamp','games','recycle-bin','workspace'];

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
  assert.equal(await page.locator('.az-tablet-app').count(),publicAppIds.length,'tablet: public app grid does not match the canonical catalog');
  assert.equal(await page.locator('.az-tablet-feature').count(),2,'tablet: supporting feature cards missing');
  assert.equal(await page.locator('[data-home-action="continue-world"],.az-device-session').count(),0,'tablet: Historical Worlds continue card returned');
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
  assert.equal(await page.locator('.az-phone-app').count(),publicAppIds.length,'mobile: public app grid incomplete');
  assert.equal(await page.locator('.az-phone-widget').count(),1,'mobile: only the News glanceable widget should remain');
  assert.equal(await page.locator('[data-home-action="continue-world"],.az-device-session').count(),0,'mobile: Historical Worlds continue card returned');
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
  assert.equal(await page.locator('.az-task-shelf-wrap').evaluate((el)=>el.inert),true,'mobile: fullscreen app did not isolate focus from the background dock');
  assert.equal(await page.locator('.az-home-scroll').evaluate((el)=>el.inert),true,'mobile: fullscreen app did not isolate focus from the home surface');
  await axe(page,'mobile News empty state');

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

// Short landscape phones use the compact presentation rather than a clipped tablet workspace.
{
  const {context,page,errors}=await openPage({width:844,height:390});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'compact','landscape phone: shell did not select compact mode');
  assert.equal(await page.locator('.az-phone-home').isVisible(),true,'landscape phone: phone home missing');
  assert.equal(await page.locator('.az-tablet-home').isVisible(),false,'landscape phone: clipped tablet home remained visible');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'landscape phone: root horizontal overflow');
  assert.deepEqual(errors,[],`landscape phone console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Deep-link aliases canonicalize without changing the stable persisted app IDs.
for(const [alias,canonical] of [['tv','videos'],['arcade','games']]){
  const {context,page,errors}=await openPage({width:1440,height:900},{url:`/?app=${alias}`});
  await page.waitForSelector(`.az-window[data-app-id="${canonical}"].is-active`);
  await page.waitForFunction((id)=>new URL(location.href).searchParams.get('app')===id,canonical);
  assert.deepEqual(await page.evaluate(()=>window.AIZANOI_OS.store.getState().openApps),[canonical],`${alias}: alias leaked into persisted app IDs`);
  assert.deepEqual(errors,[],`${alias}: console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Concurrent opens share one lifecycle, and a stylesheet failure remains retryable.
{
  let failStyles=true;
  const {context,page,errors}=await openPage({width:1440,height:900},{beforePage:async(page)=>{
    await page.route('**/styles/apps.css',async(route)=>{
      if(failStyles){failStyles=false;await route.abort('failed');}
      else await route.continue();
    });
  }});
  const first=await page.evaluate(async()=>{try{await window.AIZANOI_OS.openApp('games');return 'resolved';}catch(_){return 'rejected';}});
  assert.equal(first,'rejected','lifecycle: initial stylesheet failure did not reject');
  await page.evaluate(()=>Promise.all([window.AIZANOI_OS.openApp('games'),window.AIZANOI_OS.openApp('games'),window.AIZANOI_OS.openApp('games')]));
  assert.equal(await page.locator('.az-window[data-app-id="games"]').count(),1,'lifecycle: concurrent opens created duplicate windows');
  assert.equal(await page.locator('link[data-az-app-styles]').count(),1,'lifecycle: failed stylesheet element was not replaced cleanly');
  assert.deepEqual(errors.filter((message)=>!message.includes('ERR_FAILED')),[],`lifecycle console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Persisted windows are recreated, then the persisted active app is presented.
{
  const storage={version:3,theme:'field',reduceMotion:true,openApps:['games','news'],activeApp:'games',windowRects:{},recents:[],activity:[],fieldSession:null};
  const {context,page,errors}=await openPage({width:1440,height:900},{storage});
  await page.waitForFunction(()=>document.querySelectorAll('.az-window').length===2);
  assert.equal(await page.locator('.az-window[data-app-id="games"]').getAttribute('class').then((value)=>value.includes('is-active')),true,'restore: persisted active app was not presented');
  assert.equal(new URL(page.url()).searchParams.get('app'),'games','restore: route did not represent the presented app');
  assert.deepEqual(errors,[],`restore console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log('AizanoiOS adaptive desktop/tablet/mobile Chromium smoke passed');
