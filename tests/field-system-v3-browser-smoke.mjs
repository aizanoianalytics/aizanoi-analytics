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

// Desktop: wallpaper-first desktop, umbrella-brand core apps, keyboard window switching,
// launcher/search, snapping, lazy apps and canonical route/window lifecycle.
{
  const {context,page,errors,requests}=await openPage({width:1440,height:900});
  assert.equal(await page.locator('.az-world-shortcut').count(),0,'desktop: individual world shortcuts should not crowd the brand desktop');
  assert.equal(await page.locator('.az-desktop-shortcut').count(),5,'desktop: expected five core Aizanoi shortcuts');
  for(const id of ['news','videos','analytics','worlds','forge']) assert.equal(await page.locator(`.az-desktop-shortcut[data-app="${id}"]`).count(),1,`desktop: missing core shortcut ${id}`);
  assert.equal(await page.locator('.az-home-hero,.az-world-card,.az-app-card').count(),0,'desktop: old dashboard/card home returned');
  assert.equal(await page.getByText(/Aizanoi AI|HR AI/i).count(),0,'desktop: retired AI visible');
  assert.equal(appModuleRequests(requests).length,0,'desktop: app modules must not load before app open');
  assert.equal(requests.some((path)=>path.endsWith('/styles/apps.css')),false,'desktop: app styles must remain lazy');
  assert.equal(await page.locator('.az-task-shelf').isVisible(),true,'desktop: floating dock missing');
  assert.ok(await page.locator('.az-task-shelf .az-shelf-button').count()>=8,'desktop: dock is missing core navigation');
  assert.equal((await page.locator('[data-active-app-title]').textContent())?.trim(),'Desktop','desktop: active app title should begin on Desktop');
  await axe(page,'desktop');

  // Desktop context actions stay inside the viewport and support menu-key navigation.
  await page.locator('.az-desktop').click({button:'right',position:{x:520,y:320}});
  await page.waitForSelector('.az-desktop-context.is-open');
  assert.equal(await page.locator('.az-desktop-context [role="menuitem"]').count(),5,'desktop: context menu actions missing');
  const firstContext=page.locator('.az-desktop-context [role="menuitem"]').nth(0);
  const secondContext=page.locator('.az-desktop-context [role="menuitem"]').nth(1);
  assert.equal(await firstContext.evaluate((el)=>el===document.activeElement),true,'desktop: context menu did not focus first action');
  await page.keyboard.press('ArrowDown');
  assert.equal(await secondContext.evaluate((el)=>el===document.activeElement),true,'desktop: context menu ArrowDown navigation failed');
  await page.keyboard.press('Escape');

  // Dock Applications opens Launchpad through the canonical shell overlay lifecycle.
  const applicationsButton=page.locator('[data-os-launcher]');
  await applicationsButton.click();
  await page.waitForSelector('#az-switcher-overlay.is-open .az-launchpad-search');
  assert.equal(await page.locator('.az-stage').evaluate((el)=>el.inert),true,'desktop: launcher did not use canonical inert overlay lifecycle');
  const launcherSearch=page.locator('[data-launcher-search]');
  await launcherSearch.fill('analytics');
  assert.equal(await page.locator('#az-switcher-overlay .az-launchpad-item:not([hidden])').count(),1,'desktop: launcher search did not filter to Analytics');
  await launcherSearch.fill('archive');
  await page.waitForTimeout(20);
  assert.equal(await page.locator('#az-switcher-overlay .az-launchpad-item:not([hidden])').count(),0,'desktop: Workbench internals leaked into Applications');
  await launcherSearch.fill('definitely-no-such-aizanoi-app');
  assert.equal(await page.locator('[data-launcher-empty]').isVisible(),true,'desktop: launcher missing empty-search state');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#az-switcher-overlay',{state:'hidden'});

  await page.evaluate(()=>window.AIZANOI_OS.openApp('archive'));
  await page.waitForSelector('.az-archive-layout');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='archive');
  assert.match(page.url(),/[?&]app=archive(?:&|$)/,'desktop: Archive route intent missing');
  assert.ok(appModuleRequests(requests).some((path)=>path.endsWith('/apps/archive.js')),'desktop: Archive did not lazy-load archive module');
  assert.ok(requests.some((path)=>path.endsWith('/styles/apps.css')),'desktop: app styles did not lazy-load');
  assert.equal(await page.getByText('Temple of Zeus — sample field record',{exact:false}).count()>0,true,'desktop: sample Archive record missing');
  assert.match((await page.locator('[data-active-app-title]').textContent())||'',/Archive/i,'desktop: top bar did not follow active Archive window');

  // AizanoiOS traffic lights keep accessible hitboxes but use the product accent palette.
  const closeRect=await page.locator('.az-window[data-app-id="archive"] [data-action="close"]').boundingBox();
  const titleRect=await page.locator('.az-window[data-app-id="archive"] .az-window-title').boundingBox();
  assert.ok(closeRect&&titleRect&&closeRect.x<titleRect.x,'desktop: traffic-light controls are not left of the title');
  const closeColor=await page.locator('.az-window[data-app-id="archive"] [data-action="close"]').evaluate((el)=>getComputedStyle(el,'::before').backgroundColor);
  assert.equal(closeColor,'rgb(197, 109, 81)','desktop: close control is not using AizanoiOS rust accent');
  await axe(page,'desktop archive');

  // Open a second app: Alt+Tab must show only open windows, never the full Applications launcher.
  await page.evaluate(()=>window.AIZANOI_OS.openApp('notes'));
  await page.waitForSelector('.az-window[data-app-id="notes"].is-active');
  await page.keyboard.press('Alt+Tab');
  await page.waitForSelector('#az-switcher-overlay.is-open');
  assert.equal((await page.locator('#az-switcher-title').textContent())?.trim(),'Open Apps','desktop: Alt+Tab did not open the window switcher');
  assert.equal(await page.locator('#az-switcher-overlay .az-launchpad-search').count(),0,'desktop: Alt+Tab incorrectly opened Applications');
  assert.ok(await page.locator('#az-switcher-overlay [data-switch-app]').count()>=2,'desktop: Alt+Tab switcher did not list open windows');
  await page.keyboard.press('Escape');

  // Edge snap is intentionally simple: drag a normal large-screen window to the left edge -> half stage.
  const notesBar=page.locator('.az-window[data-app-id="notes"] .az-window-bar');
  const notesBarBox=await notesBar.boundingBox();
  assert.ok(notesBarBox,'desktop: Notes titlebar missing for snap test');
  await page.mouse.move(notesBarBox.x+notesBarBox.width/2,notesBarBox.y+notesBarBox.height/2);
  await page.mouse.down();
  await page.mouse.move(2,notesBarBox.y+notesBarBox.height/2,{steps:8});
  await page.mouse.up();
  await page.waitForTimeout(220);
  const snapped=await page.locator('.az-window[data-app-id="notes"]').boundingBox();
  const snapStage=await page.locator('.az-stage').boundingBox();
  assert.ok(snapped&&snapStage&&snapped.x<=10,'desktop: left-edge snap did not align the window');
  assert.ok(snapped&&snapStage&&Math.abs(snapped.width-(snapStage.width-24)/2)<8,'desktop: left-edge snap did not produce a half-width window');

  // Minimize/restore keeps the OS state intact and restores from the running-app area.
  await page.locator('.az-window[data-app-id="notes"] [data-action="minimize"]').click();
  await page.waitForSelector('.az-window[data-app-id="notes"]',{state:'hidden'});
  await page.locator('[data-running-apps] [data-task-app="notes"]').click();
  await page.waitForSelector('.az-window[data-app-id="notes"].is-active');

  const normalized=await page.evaluate(async()=>{
    const Archive=await import('/js/v3/archive-store.js');
    const id='qa-malformed-meta';
    await Archive.restoreBundle({format:'aizanoi-field-archive',version:1,records:[{id,name:'QA malformed metadata.md',kind:'markdown',mime:'text/markdown',size:2,text:'qa',collection:'Sources',meta:{title:{bad:true},tags:'not-an-array',source:['local'],evidence:{bad:true},linkedRecord:{bad:true},lastModified:'not-a-number'}}]});
    const item=await Archive.get(id); await Archive.remove(id);
    return {title:item?.meta?.title,tags:item?.meta?.tags,source:item?.meta?.source,evidence:item?.meta?.evidence,linkedRecord:item?.meta?.linkedRecord??null,lastModified:item?.meta?.lastModified??null};
  });
  assert.equal(typeof normalized.title,'string','desktop: restored title was not normalized to text');
  assert.deepEqual(normalized.tags,[],'desktop: malformed restored tags were not normalized');
  assert.equal(typeof normalized.source,'string','desktop: restored source was not normalized to text');
  assert.equal(normalized.evidence,'documented','desktop: invalid evidence label survived normalization');
  assert.equal(typeof normalized.linkedRecord,'string','desktop: restored linked record was not normalized to text');
  assert.equal(normalized.lastModified,null,'desktop: invalid restored lastModified survived normalization');

  const restoreSafety=await page.evaluate(async()=>{
    const Archive=await import('/js/v3/archive-store.js');
    const before=await Archive.get('sample-temple-zeus');
    let rejected=false;
    try { await Archive.restoreBundle({format:'aizanoi-field-archive',version:1,records:[{id:'qa-invalid-binary',name:'QA invalid binary.bin',kind:'file',mime:'application/octet-stream',size:1,collection:'Uploads',meta:{title:'QA invalid binary',evidence:'documented'},binary:{type:'application/octet-stream',base64:'%%%'}}]},{replace:true}); } catch (_) { rejected=true; }
    const after=await Archive.get('sample-temple-zeus'); const invalid=await Archive.get('qa-invalid-binary');
    return {rejected,before:Boolean(before),after:Boolean(after),invalid:Boolean(invalid)};
  });
  assert.equal(restoreSafety.rejected,true,'desktop: invalid binary restore did not reject');
  assert.equal(restoreSafety.before,true,'desktop: baseline Archive seed missing before replace safety test');
  assert.equal(restoreSafety.after,true,'desktop: failed replace restore cleared existing Archive data');
  assert.equal(restoreSafety.invalid,false,'desktop: invalid restore record was partially written');

  const searchButton=page.locator('[data-shell-action="search"]').first();
  await searchButton.focus(); await searchButton.click();
  await page.waitForSelector('#az-command-overlay.is-open');
  assert.equal(await page.locator('.az-stage').evaluate((el)=>el.inert),true,'desktop: dialog did not inert app stage');
  await page.waitForFunction(()=>document.activeElement?.id==='az-command-input');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#az-command-overlay',{state:'hidden'});
  await page.waitForFunction(()=>document.activeElement?.getAttribute('data-shell-action')==='search');
  assert.equal(await searchButton.evaluate((el)=>el===document.activeElement),true,'desktop: dialog did not restore opener focus');

  await page.evaluate(()=>window.AIZANOI_OS.openApp('projects'));
  await page.waitForSelector('.az-window[data-app-id="projects"] .az-project-grid');
  await page.evaluate(()=>window.AIZANOI_OS.openApp('games'));
  await page.waitForSelector('.az-window[data-app-id="games"] .az-games');
  assert.match(page.url(),/[?&]app=games(?:&|$)/);
  await page.goBack();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='projects');
  await page.waitForFunction(()=>document.querySelector('.az-window[data-app-id="projects"]')?.classList.contains('is-active'));
  assert.equal(await page.locator('.az-window[data-app-id="games"]').count(),1,'desktop: Back incorrectly destroyed another open app');
  await page.locator('.az-window[data-app-id="projects"] [data-action="close"]').click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')!=='projects');

  let terminalApiRequests=0;
  page.on('request',(request)=>{if(new URL(request.url()).pathname==='/api/terminal/exec')terminalApiRequests++;});
  await page.evaluate(()=>window.AIZANOI_OS.openApp('terminal'));
  await page.waitForSelector('.az-terminal-input');
  await page.locator('.az-terminal-input').fill('evidence');
  await page.locator('[data-terminal-form]').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.az-terminal-output')?.textContent.includes('documented = explicit source record'));
  assert.equal(terminalApiRequests,0,'desktop: Field Terminal attempted a server API');

  assert.deepEqual(errors,[],`desktop console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Tablet: adaptive desktop remains coherent.
{
  const {context,page,errors}=await openPage({width:900,height:1180});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'expanded');
  await page.evaluate(()=>window.AIZANOI_OS.openApp('notes'));
  await page.waitForSelector('.az-notes-layout');
  const rect=await page.locator('.az-window[data-app-id="notes"]').boundingBox();
  assert.ok(rect && rect.x>=0 && rect.y>=0 && rect.x+rect.width<=901 && rect.y+rect.height<=1181,'tablet: app window escaped viewport');
  assert.deepEqual(errors,[],`tablet console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Mobile: adaptive app-shell behavior, no horizontal overflow and touchable chrome.
{
  const {context,page,errors}=await openPage({width:390,height:844});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'compact');
  assert.equal(await page.locator('.az-world-shortcut').count(),0,'mobile: individual world shortcuts should stay inside Historical Worlds');
  assert.equal(await page.locator('.az-desktop-shortcut').count(),5,'mobile: core Aizanoi shortcuts missing');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile: root horizontal overflow');

  const interactive=page.locator('button:visible,a.az-button:visible');
  const count=await interactive.count();
  for(let i=0;i<count;i++){
    const node=interactive.nth(i); const box=await node.boundingBox(); if(!box)continue;
    const name=await node.evaluate((el)=>el.getAttribute('aria-label')||el.textContent?.trim()||el.getAttribute('title')||'');
    assert.ok(name.trim(),`mobile: unnamed visible interactive target at index ${i}`);
    assert.ok(box.height>=43.5,`mobile: target below 44px (${box.height.toFixed(1)}px): ${name}`);
  }
  await axe(page,'mobile desktop');

  await page.evaluate(()=>window.AIZANOI_OS.openApp('archive'));
  await page.waitForSelector('.az-archive-layout');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='archive' && document.querySelector('.az-window[data-app-id="archive"]')?.classList.contains('is-active'));
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.az-window[data-app-id="archive"]')).transform==='none');
  const win=await page.locator('.az-window[data-app-id="archive"]').boundingBox();
  const stage=await page.locator('.az-stage').boundingBox();
  assert.ok(win && stage && Math.abs(win.x-stage.x)<=1 && Math.abs(win.y-stage.y)<=1 && Math.abs(win.width-stage.width)<=1 && Math.abs(win.height-stage.height)<=1,`mobile: Archive does not fill the compact shell stage; window=${JSON.stringify(win)} stage=${JSON.stringify(stage)}`);
  assert.equal(await page.locator('.az-collection-nav').isVisible(),true,'mobile: collection rail hidden');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile: Archive horizontal overflow');

  assert.deepEqual(errors,[],`mobile console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log('AizanoiOS desktop/tablet/mobile Chromium smoke passed');
