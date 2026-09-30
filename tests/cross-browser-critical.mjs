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
  await assertRoute(context,'/analytics/dashboards/new-hr-collection/pacs/',{selector:'body',label:'PACS dashboard'});
  // Markets data is published by the provider pipeline, not committed to the
  // source tree. Verify the static shell/status surface without turning a
  // missing build artifact into a false functional pass.
  const marketsContext=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block',javaScriptEnabled:false});
  await assertRoute(marketsContext,'/analytics/markets/',{selector:'[data-markets-root]',label:'Markets static shell'});
  await marketsContext.close();
  await assertRoute(context,'/dungeon/',{selector:'#game-container canvas',label:'standalone Dungeon menu'});
  await assertRoute(context,'/worlds/',{selector:'main',label:'Aizanoi product landing'});
  await assertRoute(context,'/privacy/',{selector:'main',label:'Privacy'});

  // Aizanoi: actually boot the WebGL world under this engine rather than only
  // loading the landing page. Pointer-lock and controls are Chromium/GTK
  // dependent, so canvas boot + a fatal-error check is the honest floor.
  {
    const page=await context.newPage();
    const worldErrors=[];
    page.on('pageerror',(error)=>worldErrors.push(`pageerror: ${error.message}`));
    page.on('console',(message)=>{if(message.type()==='error')worldErrors.push(`console: ${message.text()}`);});
    const world=await page.goto(`${base}/worlds/aizanoi-225/`,{waitUntil:'domcontentloaded',timeout:60000});
    assert.ok(world?.ok(),`${engine} Aizanoi: HTTP ${world?.status()}`);
    await page.waitForFunction(
      ()=>window.__WORLD_BOOTSTRAP__?.ready===true||window.__WORLD_DEBUG__?.ready===true,
      null,{timeout:60000},
    );
    await page.locator('canvas#viewport').first().waitFor({state:'visible',timeout:30000});
    // Enter, then require the world to actually report a ready player. Pointer
    // lock is not available in every engine, so the HUD/ready signal is the
    // contract rather than controlsEnabled.
    await page.waitForSelector('#btn-enter',{timeout:30000});
    await page.waitForFunction(()=>{const b=document.getElementById('btn-enter');return b&&!b.disabled;},null,{timeout:30000});
    await page.locator('#btn-enter').click();
    // Wait for bootstrap to complete (success or failure). Budget covers the
    // dynamic import plus bootstrap's own 30 s runtime wait; on timeout dump
    // every available signal (bootstrap state, entry-net report with init
    // catches + WebGL2 probe, captured page errors, fatal card text) so the
    // CI log names the real cause instead of a bare TimeoutError.
    let bootstrapDiag=null;
    try{
      await page.waitForFunction(() => {
        const b = window.__WORLD_BOOTSTRAP__;
        return b && (b.loading === false || b.started === false);
      }, null, { timeout: 75000 });
    }catch(waitError){
      bootstrapDiag = await page.evaluate(() => ({
        bootstrap: window.__WORLD_BOOTSTRAP__ ? {
          started: window.__WORLD_BOOTSTRAP__.started,
          loading: window.__WORLD_BOOTSTRAP__.loading,
          lastError: window.__WORLD_BOOTSTRAP__.lastError ?? null,
        } : null,
        entryNet: window.__WORLDS_ENTRY_NET__?.report?.() ?? null,
        btnEnterText: document.getElementById('btn-enter')?.textContent,
        btnEnterDisabled: document.getElementById('btn-enter')?.disabled,
        fatalCard: document.querySelector('.runtime-message, .fatal-error, [data-fatal]')?.textContent?.slice(0,500) ?? null,
      }));
      console.log(`${engine} BOOTSTRAP TIMEOUT diagnostics:`, JSON.stringify(bootstrapDiag));
      console.log(`${engine} worldErrors so far:`, JSON.stringify(worldErrors));
      throw waitError;
    }
    const diag = await page.evaluate(() => ({
      hasDebug: !!window.__WORLD_DEBUG__,
      debugReady: window.__WORLD_DEBUG__?.ready,
      bootstrapStarted: window.__WORLD_BOOTSTRAP__?.started,
      bootstrapLoading: window.__WORLD_BOOTSTRAP__?.loading,
      bootstrapLastError: window.__WORLD_BOOTSTRAP__?.lastError ?? null,
      entryNet: window.__WORLDS_ENTRY_NET__?.report?.() ?? null,
      btnEnterText: document.getElementById('btn-enter')?.textContent,
      btnEnterDisabled: document.getElementById('btn-enter')?.disabled,
    }));
    console.log(`${engine} bootstrap diagnostics:`, JSON.stringify(diag));
    if (!diag.hasDebug) {
      console.log(`${engine} worldErrors so far:`, JSON.stringify(worldErrors));
      throw new Error(`${engine}: __WORLD_DEBUG__ undefined after bootstrap. Diagnostics: ${JSON.stringify(diag)}`);
    }
    await page.waitForFunction(()=>window.__WORLD_DEBUG__?.ready===true,null,{timeout:90000});
    assert.ok(await page.locator('.hud-top').count(),`${engine} Aizanoi: HUD missing after Enter`);
    assert.deepEqual(worldErrors,[],`${engine} Aizanoi: ${worldErrors.join(' | ')}`);
    await page.close();
  }

  await context.close();
  console.log(`${engine}: critical cross-browser smoke passed`);
}finally{
  await browser.close();
}
