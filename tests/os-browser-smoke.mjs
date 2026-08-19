import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

const LEGACY_PRE_SHELL_SVG_WARNING = /<g> attribute transform: Expected '\)', "translate\(50%, 100%\)"/;

async function open(context,path='/'){
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',message=>{
    if(message.type()!=='error') return;
    const text=message.text();
    if(LEGACY_PRE_SHELL_SVG_WARNING.test(text)) return;
    errors.push(text);
  });
  await page.goto(base+path,{waitUntil:'networkidle'});
  if(path==='/'){
    await page.waitForFunction(()=>!document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'),null,{timeout:5000});
    await page.waitForFunction(()=>Boolean(window.AIZANOI_OS && window.AIZANOI_OS_STATE && window.AIZANOI_OS_SANITIZER && document.body.classList.contains('aizanoi-next')),null,{timeout:5000});
  }
  return {page,errors};
}

{
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const {page,errors}=await open(context);
  let chatRequests=0;
  page.on('request', request => {
    if(new URL(request.url()).pathname==='/api/chat') chatRequests++;
  });

  assert.ok(await page.locator('#az-field-card').count(),'Field System identity card missing');
  assert.ok(await page.locator('#az-search-button').count(),'System Bar search missing');
  assert.match(await page.locator('#start-btn').innerText(),/Aizanoi/,'Start control was not rebranded as Aizanoi Index');
  assert.equal(await page.locator('#start-menu:visible').count(),0,'legacy XP Start menu should not be the primary shell');
  assert.equal(await page.evaluate(()=>/%/.test(document.querySelector('#az-stars g[transform]')?.getAttribute('transform')||'')),false,'legacy screensaver transform was not repaired by Field System sanitizer');
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'),/local-first digital archaeology/i,'security metadata was not aligned');
  assert.equal(await page.evaluate(()=>window.AIZANOI_AI_DISABLED),true,'AI security flag missing');
  assert.equal(await page.locator('[data-app="chatbot"]:visible').count(),0,'AI launcher must be hidden');

  await page.locator('#start-btn').click();
  await page.waitForSelector('#az-index.open');
  assert.match(await page.locator('#az-index').innerText(),/Historical Worlds/);
  assert.match(await page.locator('#az-index').innerText(),/Aizanoi/);
  assert.match(await page.locator('#az-index').innerText(),/Rome/);
  assert.match(await page.locator('#az-index').innerText(),/Athens/);
  assert.equal(await page.locator('#az-index [data-app="chatbot"]:visible').count(),0,'AI must stay hidden in Aizanoi Index');
  await page.locator('[data-az-close="az-index"]').click();

  await page.keyboard.press('Control+K');
  await page.waitForSelector('#az-command.open');
  const commandInput=page.locator('#az-command-input');
  await commandInput.fill('rome');
  assert.ok(await page.locator('.az-command-result').filter({hasText:'Rome'}).count(),'Rome search result missing');
  assert.equal(await page.evaluate(()=>window.AIZANOI_OS_INTENT.shouldAskAI('Explain the evidence visible in my current workspace')),false,'natural-language AI routing must be disabled');
  assert.equal(await page.locator('.az-command-result').filter({hasText:'AI'}).locator(':visible').count(),0,'AI command results should be hidden');
  await page.keyboard.press('Escape');

  await page.evaluate(()=>window.AIZANOI_OS.openSystemPanel());
  await page.waitForSelector('#az-system-panel.open');
  await page.locator('.az-theme-choice[data-theme="archive"]').click();
  assert.equal(await page.locator('body').getAttribute('data-aizanoi-theme'),'archive','Archive theme did not apply');
  await page.locator('.az-theme-choice[data-theme="field"]').click();
  await page.locator('[data-az-close="az-system-panel"]').click();

  await page.evaluate(()=>window.AIZANOI_OS.launchApp('games'));
  const win=page.locator('.win.active');
  await win.waitFor();
  const titlebar=win.locator('.win-titlebar');
  await titlebar.dblclick();
  assert.ok(await win.evaluate(el=>el.classList.contains('maximized')),'titlebar double click should maximize once');
  await titlebar.dblclick();
  assert.ok(!await win.evaluate(el=>el.classList.contains('maximized')),'second titlebar double click should restore once');

  await page.evaluate(()=>window.AIZANOI_OS.snapActive('left'));
  assert.ok(await win.evaluate(el=>el.classList.contains('aizanoi-snap-left')),'left workspace snap missing');
  await page.evaluate(()=>window.AIZANOI_OS.snapActive('right'));
  assert.ok(await win.evaluate(el=>el.classList.contains('aizanoi-snap-right')),'right workspace snap missing');

  await page.evaluate(()=>window.AIZANOI_OS.showDesktopHome());
  assert.equal(await page.locator('.win:visible').count(),0,'Field System home did not hide desktop windows');
  await page.evaluate(()=>window.AIZANOI_OS.launchApp('games'));
  assert.ok(await page.locator('.win:visible').count(),'app launch did not restore a workspace window');

  await page.locator('#taskbar').click({button:'right'});
  await page.waitForSelector('#az-context-menu.open');
  assert.match(await page.locator('#az-context-menu').innerText(),/Search workspace/,'Field context menu missing useful actions');
  await page.keyboard.press('Escape');

  await page.evaluate(()=>showBalloon({title:'Smoke',body:'Accessible notification',duration:2000}));
  await page.waitForSelector('.balloon[role="status"]');
  assert.equal(await page.locator('.balloon .b-close').getAttribute('role'),'button','notification close control lacks button semantics');

  // Load the lazy Workbench platform before testing the exact notification boundary.
  await page.evaluate(()=>window.AIZANOI_DISTRIBUTION.ensureReady());
  await page.waitForFunction(()=>Boolean(window.AIZANOI_PLATFORM && window.AIZANOI_WORKSPACE),null,{timeout:8000});

  // Platform notifications must render attacker-like text as text, not markup.
  await page.evaluate(()=>window.AIZANOI_PLATFORM.notify('Security','<img src=x onerror="window.__xss=1">','warning'));
  await page.waitForSelector('.balloon');
  assert.equal(await page.evaluate(()=>Boolean(window.__xss)),false,'notification body executed injected markup');
  assert.match(await page.locator('.balloon .b-body').innerText(),/<img src=x/,'escaped notification payload should remain visible text');

  assert.equal(chatRequests,0,'security build must never issue /api/chat requests');
  assert.deepEqual(errors,[],'desktop browser errors: '+errors.join(' | '));
  await context.close();
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const {page,errors}=await open(context);
  await page.waitForSelector('#az-mobile-home:not(.hidden)');
  assert.equal(await page.locator('[data-mobile-nav="ai"]:visible').count(),0,'mobile AI navigation must be hidden');
  assert.equal(await page.locator('#icon-layer:visible').count(),0,'mobile shell should not shrink desktop icons into the phone');
  assert.ok(await page.locator('#az-mobile-worlds [data-world="aizanoi"]').count(),'mobile world launcher missing Aizanoi');
  assert.ok(await page.locator('#az-mobile-worlds [data-world="rome"]').count(),'mobile world launcher missing Rome');
  assert.ok(await page.locator('#az-mobile-worlds [data-world="athens"]').count(),'mobile world launcher missing Athens');

  await page.locator('#az-mobile-apps [data-app="games"]').click();
  const win=page.locator('.win.active');
  await win.waitFor();
  const box=await win.boundingBox();
  assert.ok(box && box.width<=390 && box.height<=844,'mobile window exceeds viewport');
  assert.ok(await page.locator('.win-titlebar').first().evaluate(el=>el.getBoundingClientRect().height>=40),'mobile Field System titlebar too small');
  assert.equal(await page.locator('#az-mobile-home:not(.hidden)').count(),0,'mobile home should recede while an app is active');

  await win.locator('[data-act="close"]').click();
  await page.waitForSelector('#az-mobile-home:not(.hidden)');
  await page.locator('[data-mobile-nav="search"]').click();
  await page.waitForSelector('#az-command.open');
  assert.ok(await page.locator('#az-command-input').isVisible(),'mobile command surface missing');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors,[],'mobile browser errors: '+errors.join(' | '));
  await context.close();
}

for(const path of ['/404.html','/500.html','/503.html']){
  const context=await browser.newContext({viewport:{width:900,height:700}});
  const {page,errors}=await open(context,path);
  assert.ok(await page.locator('main').count(),`${path} error document missing main content`);
  assert.ok((await page.locator('body').innerText()).includes(path.slice(1,4)),`${path} missing status code copy`);
  assert.deepEqual(errors,[],`${path} browser errors: `+errors.join(' | '));
  await context.close();
}

await browser.close();
console.log('Aizanoi Field System security desktop/mobile/error-page smoke passed');
