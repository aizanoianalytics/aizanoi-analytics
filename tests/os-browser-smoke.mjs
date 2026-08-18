import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ headless:true });

async function open(context,path='/'){
  const page = await context.newPage();
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+path,{waitUntil:'networkidle'});
  if(path==='/') await page.waitForFunction(()=>!document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'),null,{timeout:5000});
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

  await page.evaluate(()=>openApp('chatbot'));
  await page.waitForSelector('.win.active[role="dialog"]');
  await page.waitForFunction(()=>document.getElementById('chat-input')?.tagName==='TEXTAREA');

  const input=page.locator('#chat-input');
  assert.equal(await input.evaluate(el=>el.tagName),'TEXTAREA','chat composer must be a native textarea');
  assert.equal(await page.locator('.os-v2-chat-toolbar').count(),1,'chat toolbar missing');
  assert.ok(await page.locator('[data-chat-action="retry"]').count(),'retry action missing');
  assert.ok(await page.evaluate(()=>typeof openWindows.get('chatbot')?.cleanup==='function'),'core window cleanup hook missing');
  assert.ok(await page.evaluate(()=>window.__AIZANOI_OS_V2__?.debug?.().marqueeEnabled===true),'desktop marquee enhancement missing');

  await input.fill('Line one');
  await input.press('Shift+Enter');
  await input.type('Line two');
  assert.equal(await input.inputValue(),'Line one\nLine two','Shift+Enter should insert a newline');
  await input.press('Enter');
  await page.waitForFunction(()=>document.querySelectorAll('.chat-msg.bot:not(.typing)').length>=2);
  assert.equal(chatRequests,1,'Enter should submit exactly one chat request');
  assert.match(await page.locator('.chat-msg.bot:not(.typing) .bubble').last().innerText(),/Mock reply 1/);

  await page.locator('[data-chat-action="retry"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.chat-msg.bot:not(.typing)').length>=3);
  assert.equal(chatRequests,2,'Retry last should resubmit the previous prompt once');

  const titlebar=page.locator('.win.active .win-titlebar');
  await titlebar.dblclick();
  assert.ok(await page.locator('.win.active').evaluate(el=>el.classList.contains('maximized')),'titlebar double click should maximize once');
  await titlebar.dblclick();
  assert.ok(!await page.locator('.win.active').evaluate(el=>el.classList.contains('maximized')),'second titlebar double click should restore once');

  await page.locator('.win.active').evaluate(el=>{
    el.style.left='5000px'; el.style.top='5000px';
    document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  });
  await page.waitForTimeout(80);
  const clamped=await page.locator('.win.active').boundingBox();
  assert.ok(clamped && clamped.x<1280 && clamped.y<800,'window was not clamped back into the viewport');

  assert.ok(await page.locator('.os-v2-show-desktop').count(),'show desktop missing');
  await page.locator('.os-v2-show-desktop').click();
  assert.equal(await page.locator('.win.active:visible').count(),0,'show desktop did not hide windows');
  await page.locator('.os-v2-show-desktop').click();
  assert.ok(await page.locator('.win:visible').count(),'show desktop did not restore windows');

  await page.locator('#taskbar').click({button:'right'});
  await page.waitForSelector('.ctx-menu[role="menu"]');
  assert.ok(await page.locator('.ctx-menu [role="menuitem"]').count(),'context menu items lost menu semantics');
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
  await page.evaluate(()=>openApp('games'));
  const win=page.locator('.win.active');
  await win.waitFor();
  const box=await win.boundingBox();
  assert.ok(box && box.width<=390 && box.height<=844,'mobile window exceeds viewport');
  assert.ok(await page.locator('.win-titlebar').first().evaluate(el=>el.getBoundingClientRect().height>=30),'mobile titlebar too small');
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
console.log('Aizanoi OS desktop/mobile/error-page smoke passed');
