import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = 'artifacts/final-visual-review';
mkdirSync(out, { recursive:true });
const browser = await chromium.launch({ headless:true });

async function pageFor(viewport={width:1440,height:900}, mobile=false, touch=false) {
  const context = await browser.newContext({ viewport, isMobile:mobile, hasTouch:mobile || touch, deviceScaleFactor:mobile ? 2 : 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  await page.goto(`${base}/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => {
    const boot=document.getElementById('boot');
    return !boot || boot.classList.contains('hide') || getComputedStyle(boot).display==='none';
  }, null, { timeout:9000 });
  await page.waitForFunction(() => Boolean(window.AIZANOI_PRODUCT_POLISH && window.AIZANOI_UNIFIED_SHELL), null, { timeout:9000 });
  await page.waitForTimeout(350);
  return { context, page };
}

async function open(page, appId, direct=false) {
  await page.evaluate(({id,direct}) => direct ? window.openApp?.(id) : window.AIZANOI_OS?.launchApp?.(id), {id:appId,direct});
  await page.locator(`.win[data-app-id="${appId}"]`).first().waitFor({state:'visible',timeout:10000});
  await page.waitForTimeout(180);
}

async function close(page, appId) {
  await page.evaluate((id)=>window.closeApp?.(id), appId);
  await page.waitForTimeout(100);
}

// Desktop legacy/application surfaces that were previously visually disconnected.
{
  const {context,page}=await pageFor();
  for (const [appId,file,direct] of [
    ['terminal','00n-polish-terminal.png',false],
    ['games','00o-polish-games.png',false],
    ['projects','00p-polish-projects.png',false],
    ['about','00q-polish-about.png',false],
    ['privacy','00r-polish-privacy.png',true],
  ]) {
    await open(page,appId,direct);
    if(appId==='projects') await page.waitForFunction(()=>document.querySelector('#projects-list')?.textContent && !/Loading/.test(document.querySelector('#projects-list').textContent),null,{timeout:7000});
    await page.screenshot({path:`${out}/${file}`});
    await close(page,appId);
  }
  await context.close();
}

// Tablet explicitly reviews both the workstation and a legacy app in the same shell.
{
  const {context,page}=await pageFor({width:900,height:1180},false,true);
  await open(page,'archive');
  await page.screenshot({path:`${out}/00s-polish-tablet-archive.png`});
  await close(page,'archive');
  await open(page,'games');
  await page.screenshot({path:`${out}/00t-polish-tablet-games.png`});
  await context.close();
}

// Mobile reviews fullscreen-equivalent interiors, not only the home screen.
{
  const {context,page}=await pageFor({width:390,height:844},true,true);
  for (const [appId,file] of [
    ['terminal','00u-polish-mobile-terminal.png'],
    ['notes','00v-polish-mobile-notes.png'],
    ['data-lab','00w-polish-mobile-data.png'],
    ['games','00x-polish-mobile-games.png'],
  ]) {
    await open(page,appId);
    await page.screenshot({path:`${out}/${file}`});
    await close(page,appId);
  }
  await context.close();
}

await browser.close();
console.log('Aizanoi product polish visual captures complete');
