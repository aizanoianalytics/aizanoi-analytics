import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';

test('Web Editor fills its window, keeps Run visible and Open Apps keeps application icons compact',async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  try{
    await page.goto(`${base}/?web-editor-layout=${Date.now()}`,{waitUntil:'networkidle'});
    await page.evaluate(()=>window.AIZANOI_OS.openApp('web-editor'));
    const window=page.locator('.az-window[data-app-id="web-editor"]');
    const editor=window.locator('.az-web-editor');
    const run=window.locator('[data-web-run]');
    await editor.waitFor({state:'visible'});
    await page.waitForTimeout(150);
    const metrics=await page.evaluate(()=>{
      const rect=(selector)=>document.querySelector(selector)?.getBoundingClientRect();
      const body=rect('.az-window[data-app-id="web-editor"] [data-app-body]');
      const editor=rect('.az-window[data-app-id="web-editor"] .az-web-editor');
      const layout=rect('.az-window[data-app-id="web-editor"] .az-web-editor-layout');
      return{body:{height:body?.height,bottom:body?.bottom},editor:{height:editor?.height,bottom:editor?.bottom},layout:{height:layout?.height,bottom:layout?.bottom}};
    });
    assert.ok(metrics.body.height>400,'Web Editor test window should have useful vertical space');
    assert.ok(metrics.editor.height>=metrics.body.height-2,`editor should fill window body (${metrics.editor.height} vs ${metrics.body.height})`);
    assert.ok(Math.abs(metrics.layout.bottom-metrics.body.bottom)<=2,`split layout should reach the window bottom (${metrics.layout.bottom} vs ${metrics.body.bottom})`);

    assert.equal((await run.innerText()).trim(),'Run','primary Web Editor action should retain its label');
    const runStyle=await run.evaluate((node)=>{
      const style=getComputedStyle(node);
      const rect=node.getBoundingClientRect();
      return{color:style.color,backgroundImage:style.backgroundImage,width:rect.width,height:rect.height};
    });
    assert.equal(runStyle.color,'rgb(255, 255, 255)','Run label should remain white on the primary action');
    assert.notEqual(runStyle.backgroundImage,'none','Run should retain a visible primary gradient background');
    assert.ok(runStyle.width>=70&&runStyle.height>=30,`Run should remain a clear primary target, got ${runStyle.width}x${runStyle.height}`);

    await page.locator('[data-os-switcher]').click();
    const overlay=page.locator('#az-switcher-overlay');
    await overlay.waitFor({state:'visible'});
    assert.equal((await page.locator('#az-switcher-title').innerText()).trim(),'Open Apps');
    const item=overlay.locator('.az-switcher-item').first();
    const icon=item.locator('img');
    const itemBox=await item.boundingBox();
    const iconBox=await icon.boundingBox();
    assert.ok(itemBox&&itemBox.height<=90,`Open Apps row should remain compact, got ${itemBox?.height}`);
    assert.ok(iconBox&&iconBox.width<=52&&iconBox.height<=52,`Open Apps icon should remain compact, got ${iconBox?.width}x${iconBox?.height}`);
    assert.match(await item.innerText(),/Aizanoi Web Editor|Web Editor/);
  }finally{
    await browser.close();
  }
  assert.deepEqual(errors,[],`page errors: ${JSON.stringify(errors)}`);
});
