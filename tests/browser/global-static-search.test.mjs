import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';

test('Cmd/Ctrl+K lazy-loads static content and navigates to a canonical result',async()=>{
  const browser=await chromium.launch({headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const page=await context.newPage();
  const indexRequests=[];
  page.on('request',(request)=>{
    if(new URL(request.url()).pathname.endsWith('/js/v3/search-index.generated.js'))indexRequests.push(request.url());
  });

  try{
    await page.goto(`${base}/?global-search=${Date.now()}`,{waitUntil:'networkidle'});
    await page.waitForFunction(()=>Boolean(window.AIZANOI_OS));
    assert.equal(indexRequests.length,0,'static content index must stay out of initial AizanoiOS boot');

    await page.keyboard.press('Control+K');
    const input=page.locator('#az-command-input');
    await input.waitFor({state:'visible'});
    await input.fill('Workforce Turnover Analytics');

    const result=page.locator('.az-command-row').filter({hasText:'Workforce Turnover Analytics'}).first();
    await result.waitFor({state:'visible',timeout:5000});
    assert.ok(indexRequests.length>=1,'opening global search should lazy-load the static content index');
    assert.match(await result.innerText(),/Analytics/i,'content result should retain its Analytics kind');

    await Promise.all([
      page.waitForURL(/\/analytics\/dashboards\/hr-analytics-full-set\/workforce-turnover\/$/,{timeout:10000}),
      result.click(),
    ]);
    assert.match(await page.title(),/Workforce Turnover Analytics/i);
  }finally{
    await browser.close();
  }
});
