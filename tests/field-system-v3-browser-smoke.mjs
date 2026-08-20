import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { source as axeSource } from 'axe-core';

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
  await page.waitForSelector('.az-home');
  return {context,page,errors,requests};
}

async function axe(page,label) {
  await page.addScriptTag({content:axeSource});
  const result=await page.evaluate(async()=>await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}}));
  const blocking=result.violations.filter((item)=>['serious','critical'].includes(item.impact));
  assert.deepEqual(blocking.map((item)=>({id:item.id,impact:item.impact,nodes:item.nodes.length})),[],`${label}: serious/critical axe violations`);
}

function appModuleRequests(requests){return requests.filter((path)=>path.includes('/js/v3/apps/'));}

// Desktop: Worlds-first home, lazy apps, canonical route/window lifecycle and dialogs.
{
  const {context,page,errors,requests}=await openPage({width:1440,height:900});
  assert.equal(await page.locator('.az-world-card').count(),3,'desktop: expected three Historical World cards');
  assert.equal(await page.locator('.az-app-card').count(),10,'desktop: expected ten home app cards plus separate world index');
  assert.equal(await page.getByText(/Aizanoi AI|HR AI/i).count(),0,'desktop: retired AI visible');
  assert.equal(appModuleRequests(requests).length,0,'desktop: app modules must not load before app open');
  assert.equal(requests.some((path)=>path.endsWith('/styles/apps.css')),false,'desktop: app styles must remain lazy');
  await axe(page,'desktop home');

  await page.locator('[data-app="archive"]').first().click();
  await page.waitForSelector('.az-archive-layout');
  assert.match(page.url(),/[?&]app=archive(?:&|$)/,'desktop: Archive route intent missing');
  assert.ok(appModuleRequests(requests).some((path)=>path.endsWith('/apps/research.js')),'desktop: Archive did not lazy-load research module');
  assert.ok(requests.some((path)=>path.endsWith('/styles/apps.css')),'desktop: app styles did not lazy-load');
  assert.equal(await page.getByText('Temple of Zeus — sample field record',{exact:false}).count()>0,true,'desktop: sample Archive record missing');
  await axe(page,'desktop archive');

  // Dialog semantics: opener -> focus, background inert, Esc -> opener restore.
  const searchButton=page.locator('[data-shell-action="search"]').first();
  await searchButton.focus();
  await searchButton.click();
  await page.waitForSelector('#az-command-overlay.is-open');
  assert.equal(await page.locator('.az-stage').evaluate((el)=>el.inert),true,'desktop: dialog did not inert app stage');
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'az-command-input','desktop: command did not receive initial focus');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#az-command-overlay:not(.is-open)');
  assert.equal(await searchButton.evaluate((el)=>el===document.activeElement),true,'desktop: dialog did not restore opener focus');

  // Route is active intent: Projects and Games may both remain open; Back changes focus intent.
  await page.evaluate(()=>window.AIZANOI_FIELD_SYSTEM.openApp('projects'));
  await page.waitForSelector('.az-window[data-app-id="projects"] .az-project-grid');
  await page.evaluate(()=>window.AIZANOI_FIELD_SYSTEM.openApp('games'));
  await page.waitForSelector('.az-window[data-app-id="games"] .az-games');
  assert.match(page.url(),/[?&]app=games(?:&|$)/);
  await page.goBack();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')==='projects');
  await page.waitForFunction(()=>document.querySelector('.az-window[data-app-id="projects"]')?.classList.contains('is-active'));
  assert.equal(await page.locator('.az-window[data-app-id="games"]').count(),1,'desktop: Back incorrectly destroyed another open app');

  // Closing active routable app must update URL to another active app or Home.
  await page.locator('.az-window[data-app-id="projects"] [data-action="close"]').click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('app')!=='projects');

  // Honest local terminal. No API/network command surface.
  let terminalApiRequests=0;
  page.on('request',(request)=>{if(new URL(request.url()).pathname==='/api/terminal/exec')terminalApiRequests++;});
  await page.evaluate(()=>window.AIZANOI_FIELD_SYSTEM.openApp('terminal'));
  await page.waitForSelector('.az-terminal-input');
  await page.locator('.az-terminal-input').fill('evidence');
  await page.locator('[data-terminal-form]').press('Enter');
  await page.waitForFunction(()=>document.querySelector('.az-terminal-output')?.textContent.includes('documented = explicit source record'));
  assert.equal(terminalApiRequests,0,'desktop: Field Terminal attempted a server API');

  assert.deepEqual(errors,[],`desktop console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Tablet: focus workspace geometry and Archive remain coherent.
{
  const {context,page,errors}=await openPage({width:900,height:1180});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'expanded');
  await page.locator('[data-app="notes"]').click();
  await page.waitForSelector('.az-notes-layout');
  const rect=await page.locator('.az-window[data-app-id="notes"]').boundingBox();
  assert.ok(rect && rect.x>=0 && rect.y>=0 && rect.x+rect.width<=901 && rect.y+rect.height<=1181,'tablet: app window escaped viewport');
  assert.deepEqual(errors,[],`tablet console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

// Mobile: real app-shell behavior, no horizontal overflow, named/touchable chrome.
{
  const {context,page,errors}=await openPage({width:390,height:844});
  assert.equal(await page.locator('.az-shell').getAttribute('data-layout'),'compact');
  assert.equal(await page.locator('.az-world-card').count(),3,'mobile: worlds missing');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile: root horizontal overflow');

  const interactive=page.locator('button:visible,a.az-button:visible');
  const count=await interactive.count();
  for(let i=0;i<count;i++){
    const node=interactive.nth(i);const box=await node.boundingBox();if(!box)continue;
    const name=await node.evaluate((el)=>el.getAttribute('aria-label')||el.textContent?.trim()||el.getAttribute('title')||'');
    assert.ok(name.trim(),`mobile: unnamed visible interactive target at index ${i}`);
    assert.ok(box.height>=43.5,`mobile: target below 44px (${box.height.toFixed(1)}px): ${name}`);
  }
  await axe(page,'mobile home');

  await page.locator('[data-app="archive"]').first().click();
  await page.waitForSelector('.az-archive-layout');
  const win=await page.locator('.az-window[data-app-id="archive"]').boundingBox();
  assert.ok(win && win.x<=1 && win.y<=1 && win.width>=389 && win.height>=700,'mobile: Archive is not fullscreen-equivalent');
  assert.equal(await page.locator('.az-collection-nav').isVisible(),true,'mobile: collection rail hidden');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile: Archive horizontal overflow');

  assert.deepEqual(errors,[],`mobile console/page errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log('Field System v3 desktop/tablet/mobile Chromium smoke passed');
