import assert from 'node:assert/strict';
import { chromium, firefox, webkit } from 'playwright';

const engine=process.env.AIZANOI_BROWSER||'chromium';
const browserType={chromium,firefox,webkit}[engine];
if(!browserType)throw new Error(`Unsupported AIZANOI_BROWSER: ${engine}`);
const base=process.env.ANCIENT_WORLD_BASE_URL||'http://127.0.0.1:4173';
const browser=await browserType.launch({headless:true});

async function assertRoute(context,route,{selector='body',label=route}={}){
  const page=await context.newPage();
  const errors=[];
  page.on('pageerror',(error)=>errors.push(`pageerror: ${error.message}`));
  page.on('console',(message)=>{if(message.type()==='error')errors.push(`console: ${message.text()}`);});
  try{
    const response=await page.goto(`${base}${route}`,{waitUntil:'domcontentloaded',timeout:30000});
    assert.ok(response?.ok(),`${engine} ${label}: HTTP ${response?.status()}`);
    await page.locator(selector).first().waitFor({state:'visible',timeout:15000});
    assert.deepEqual(errors,[],`${engine} ${label}: ${errors.join(' | ')}`);
  }finally{await page.close();}
}

try{
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});

  const shell=await context.newPage();
  const shellErrors=[];
  shell.on('pageerror',(error)=>shellErrors.push(`pageerror: ${error.message}`));
  shell.on('console',(message)=>{if(message.type()==='error')shellErrors.push(`console: ${message.text()}`);});
  const response=await shell.goto(`${base}/`,{waitUntil:'networkidle',timeout:30000});
  assert.ok(response?.ok(),`${engine} shell: HTTP ${response?.status()}`);
  await shell.locator('.az-desktop').waitFor({state:'visible',timeout:15000});
  await shell.waitForFunction(()=>Boolean(window.AIZANOI_OS));
  await shell.evaluate(()=>window.AIZANOI_OS.openApp('analytics'));
  await shell.locator('.az-window[data-app-id="analytics"].is-active').waitFor({state:'visible',timeout:15000});
  assert.deepEqual(shellErrors,[],`${engine} shell: ${shellErrors.join(' | ')}`);
  await shell.close();

  await assertRoute(context,'/news/',{selector:'main',label:'News'});
  await assertRoute(context,'/news/2026-09-02/aisi-cyber-eval-incident/',{selector:'main.article-page',label:'permanent News article'});
  await assertRoute(context,'/analytics/',{selector:'main',label:'Analytics catalog'});
  await assertRoute(context,'/analytics/dashboards/hr-analytics-full-set/workforce-turnover/',{selector:'body',label:'HR Turnover dashboard'});
  await assertRoute(context,'/worlds/',{selector:'main',label:'Worlds index'});
  await assertRoute(context,'/privacy/',{selector:'main',label:'Privacy'});

  await context.close();
  console.log(`${engine}: critical cross-browser smoke passed`);
}finally{
  await browser.close();
}
