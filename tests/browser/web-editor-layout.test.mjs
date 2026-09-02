import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import axeCore from 'axe-core';

const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';

test('Web Editor fills its window and keeps Run accessible while Open Apps stays compact',async()=>{
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
    const source=window.locator('[data-web-source]');
    const run=window.locator('[data-web-action="run"]');
    const saveAs=window.locator('[data-web-action="saveas"]');
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

    assert.equal((await run.innerText()).trim(),'Run','primary Web Editor action should retain its accessible label');
    const runBox=await run.boundingBox();
    assert.ok(runBox&&runBox.width>=24&&runBox.height>=24,`Run must meet the WCAG 2.2 minimum target size, got ${runBox?.width}x${runBox?.height}`);
    assert.equal(await run.isVisible(),true,'Run must be visibly available without scrolling the toolbar');
    const visuallyDistinct=await page.evaluate(()=>{
      const primary=document.querySelector('.az-window[data-app-id="web-editor"] [data-web-action="run"]');
      const secondary=document.querySelector('.az-window[data-app-id="web-editor"] [data-web-action="saveas"]');
      if(!primary||!secondary)return false;
      const a=getComputedStyle(primary),b=getComputedStyle(secondary);
      return a.backgroundImage!==b.backgroundImage||a.backgroundColor!==b.backgroundColor||a.boxShadow!==b.boxShadow||a.fontWeight!==b.fontWeight;
    });
    assert.equal(visuallyDistinct,true,'Run should remain visually distinguishable from a secondary toolbar action');

    await page.addScriptTag({content:axeCore.source});
    const contrastViolations=await page.evaluate(async()=>{
      const target=document.querySelector('.az-window[data-app-id="web-editor"] [data-web-action="run"]');
      const result=await axe.run(target,{runOnly:{type:'rule',values:['color-contrast']}});
      return result.violations.map(({id,impact,nodes})=>({id,impact,nodes:nodes.map(({target,html,failureSummary})=>({target,html,failureSummary}))}));
    });
    assert.deepEqual(contrastViolations,[],'Run must pass axe color-contrast checks');

    await source.fill('<!doctype html><html><body><h1 id="keyboard-run">Waiting</h1><script>document.querySelector("#keyboard-run").textContent="Keyboard run works";<\/script></body></html>');
    await run.focus();
    assert.equal(await run.evaluate((node)=>node===document.activeElement),true,'Run should accept keyboard focus');
    await run.press('Enter');
    const preview=page.frameLocator('.az-window[data-app-id="web-editor"] [data-web-preview]');
    await preview.locator('#keyboard-run').waitFor({state:'visible',timeout:5000});
    assert.equal((await preview.locator('#keyboard-run').innerText()).trim(),'Keyboard run works','Enter should activate Run');

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
