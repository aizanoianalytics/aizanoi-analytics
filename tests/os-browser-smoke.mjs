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
    // The legacy monolithic HTML is parsed before the modular Field System can
    // repair this obsolete percentage transform. We tolerate only this exact
    // parser-time warning and assert the runtime DOM is sanitized below.
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
  await page.route('**/api/chat', async route => {
    chatRequests++;
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({reply:`Mock reply ${chatRequests}`})});
  });

  assert.ok(await page.locator('#az-field-card').count(),'Field System identity card missing');
  assert.ok(await page.locator('#az-search-button').count(),'System Bar search missing');
  assert.match(await page.locator('#start-btn').innerText(),/Aizanoi/,'Start control was not rebranded as Aizanoi Index');
  assert.equal(await page.locator('#start-menu:visible').count(),0,'legacy XP Start menu should not be the primary shell');
  assert.equal(await page.evaluate(()=>/%/.test(document.querySelector('#az-stars g[transform]')?.getAttribute('transform')||'')),false,'legacy screensaver transform was not repaired by Field System sanitizer');
  assert.match(await page.locator('meta[name="description"]').getAttribute('content'),/AI-native digital archaeology/i,'Field System product metadata was not aligned');

  await page.locator('#start-btn').click();
  await page.waitForSelector('#az-index.open');
  assert.match(await page.locator('#az-index').innerText(),/Historical Worlds/);
  assert.match(await page.locator('#az-index').innerText(),/Aizanoi/);
  assert.match(await page.locator('#az-index').innerText(),/Rome/);
  assert.match(await page.locator('#az-index').innerText(),/Athens/);
  await page.locator('[data-az-close="az-index"]').click();

  await page.keyboard.press('Control+K');
  await page.waitForSelector('#az-command.open');
  const commandInput=page.locator('#az-command-input');
  await commandInput.fill('rome');
  assert.ok(await page.locator('.az-command-result').filter({hasText:'Rome'}).count(),'Rome search result missing');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#az-command.open').count(),0,'Escape did not close command palette');

  await page.evaluate(()=>window.AIZANOI_OS.openSystemPanel());
  await page.waitForSelector('#az-system-panel.open');
  await page.locator('.az-theme-choice[data-theme="archive"]').click();
  assert.equal(await page.locator('body').getAttribute('data-aizanoi-theme'),'archive','Archive theme did not apply');
  await page.locator('.az-theme-choice[data-theme="field"]').click();
  await page.locator('[data-az-close="az-system-panel"]').click();

  // Conversational language must route to AI even when an app keyword appears
  // as a substring (e.g. the “ai” letters inside “explain”).
  await page.keyboard.press('Control+K');
  await commandInput.fill('Explain the evidence visible in my current workspace');
  assert.equal(await page.evaluate(()=>window.AIZANOI_OS_INTENT.shouldAskAI('Explain the evidence visible in my current workspace')),true,'natural-language intent guard misclassified a conversational query');
  await commandInput.press('Enter');
  await page.waitForFunction(()=>document.getElementById('chat-input')?.tagName==='TEXTAREA');
  await page.waitForFunction(()=>document.querySelectorAll('.chat-msg.bot:not(.typing)').length>=2);
  assert.equal(chatRequests,1,'command palette should submit one contextual AI request');
  assert.match(await page.locator('.chat-msg.user').last().innerText(),/Explain the evidence visible/);

  const input=page.locator('#chat-input');
  assert.equal(await input.evaluate(el=>el.tagName),'TEXTAREA','chat composer must be a native textarea');
  assert.equal(await page.locator('.os-v2-chat-toolbar').count(),1,'chat toolbar missing');
  assert.ok(await page.locator('[data-chat-action="retry"]').count(),'retry action missing');
  assert.ok(await page.evaluate(()=>typeof openWindows.get('chatbot')?.cleanup==='function'),'core window cleanup hook missing');

  await input.fill('Line one');
  await input.press('Shift+Enter');
  await input.type('Line two');
  assert.equal(await input.inputValue(),'Line one\nLine two','Shift+Enter should insert a newline');
  await input.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.chat-msg.bot:not(.typing)').length>=3);
  assert.equal(chatRequests,2,'Enter should submit exactly one additional chat request');
  assert.match(await page.locator('.chat-msg.bot:not(.typing) .bubble').last().innerText(),/Mock reply 2/);

  await page.locator('[data-chat-action="retry"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.chat-msg.bot:not(.typing)').length>=4);
  assert.equal(chatRequests,3,'Retry last should resubmit the previous prompt once');

  const titlebar=page.locator('.win.active .win-titlebar');
  await titlebar.dblclick();
  assert.ok(await page.locator('.win.active').evaluate(el=>el.classList.contains('maximized')),'titlebar double click should maximize once');
  await titlebar.dblclick();
  assert.ok(!await page.locator('.win.active').evaluate(el=>el.classList.contains('maximized')),'second titlebar double click should restore once');

  await page.evaluate(()=>window.AIZANOI_OS.snapActive('left'));
  assert.ok(await page.locator('.win.active').evaluate(el=>el.classList.contains('aizanoi-snap-left')),'left workspace snap missing');
  await page.evaluate(()=>window.AIZANOI_OS.snapActive('right'));
  assert.ok(await page.locator('.win.active').evaluate(el=>el.classList.contains('aizanoi-snap-right')),'right workspace snap missing');
  await page.locator('.win.active .win-titlebar').dispatchEvent('pointerdown',{pointerId:77,pointerType:'mouse',clientX:720,clientY:20});
  assert.ok(!await page.locator('.win.active').evaluate(el=>el.classList.contains('aizanoi-snap-right')),'drag start should release snapped window');

  await page.locator('.win.active').evaluate(el=>{
    el.style.left='5000px'; el.style.top='5000px';
    document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.waitForTimeout(80);
  const clamped=await page.locator('.win.active').boundingBox();
  assert.ok(clamped && clamped.x<1280 && clamped.y<800,'window was not clamped back into the viewport');

  await page.evaluate(()=>window.AIZANOI_OS.showDesktopHome());
  assert.equal(await page.locator('.win:visible').count(),0,'Field System home did not hide desktop windows');
  await page.evaluate(()=>window.AIZANOI_OS.launchApp('chatbot'));
  assert.ok(await page.locator('.win:visible').count(),'app launch did not restore a workspace window');

  await page.locator('#taskbar').click({button:'right'});
  await page.waitForSelector('#az-context-menu.open');
  assert.match(await page.locator('#az-context-menu').innerText(),/Search workspace/,'Field context menu missing useful actions');
  await page.keyboard.press('Escape');

  await page.evaluate(()=>showBalloon({title:'Smoke',body:'Accessible notification',duration:2000}));
  await page.waitForSelector('.balloon[role="status"]');
  assert.equal(await page.locator('.balloon .b-close').getAttribute('role'),'button','notification close control lacks button semantics');

  await page.locator('[data-chat-action="clear"]').click();
  const removedDragListeners=await page.evaluate(()=>{
    let removed=0;
    const original=document.removeEventListener;
    document.removeEventListener=function(type,listener,options){
      if(['mousemove','touchmove','mouseup','touchend'].includes(type)) removed++;
      return original.call(document,type,listener,options);
    };
    try { closeApp('chatbot'); }
    finally { document.removeEventListener=original; }
    return removed;
  });
  assert.ok(removedDragListeners>=4,`expected core drag listeners to be released, got ${removedDragListeners}`);
  assert.deepEqual(errors,[],'desktop browser errors: '+errors.join(' | '));
  await context.close();
}

{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const {page,errors}=await open(context);
  await page.waitForSelector('#az-mobile-home:not(.hidden)');
  assert.equal(await page.locator('#az-mobile-nav .az-mobile-nav-btn').count(),4,'mobile shell needs Home/Search/AI/Recent navigation');
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
console.log('Aizanoi Field System desktop/mobile/error-page smoke passed');
