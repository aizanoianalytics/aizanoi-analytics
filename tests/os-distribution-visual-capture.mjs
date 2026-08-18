import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = 'artifacts/final-visual-review';
mkdirSync(out, { recursive:true });
const browser = await chromium.launch({ headless:true });

async function shellPage(viewport={width:1440,height:900}, mobile=false) {
  const context = await browser.newContext({ viewport, isMobile:mobile, hasTouch:mobile, deviceScaleFactor:mobile ? 2 : 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  await page.route('**/api/health', (route) => route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})}));
  await page.goto(`${base}/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'), null, {timeout:6000});
  await page.waitForFunction(() => Boolean(window.AIZANOI_OS && window.AIZANOI_WORKSPACE && window.AIZANOI_PLATFORM), null, {timeout:8000});
  await page.waitForTimeout(500);
  return {context,page};
}

{
  const {context,page}=await shellPage();
  await page.screenshot({path:`${out}/00e-distribution-home.png`});
  await page.locator('#start-btn').click();
  await page.waitForSelector('#az-index.open');
  await page.waitForTimeout(180);
  await page.screenshot({path:`${out}/00f-distribution-index.png`});
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.AIZANOI_OS.launchApp('archive'));
  await page.waitForSelector('.az-workbench-window[data-workbench-app="archive"]');
  await page.waitForTimeout(250);
  await page.screenshot({path:`${out}/00g-field-archive.png`});
  const ids = await page.evaluate(async () => {
    const dataset = await window.AIZANOI_WORKSPACE.archive.put({name:'HR-field-sample.csv',kind:'dataset',mime:'text/csv',collection:'Datasets',text:'employee,team,tenure,score\nAda,Research,4.2,91\nMarcus,Field,2.8,84\nLivia,Research,5.1,88\nTitus,Archive,1.9,76\nJulia,Field,3.7,93'});
    const source = await window.AIZANOI_WORKSPACE.archive.put({name:'Temple-survey-notes.md',kind:'markdown',mime:'text/markdown',collection:'Sources',text:'# Temple survey notes\n\n## Evidence layer\n\n- Monumental podium alignment documented.\n- Urban infill remains plausible, not excavated certainty.\n- Compare field observations with the historical reconstruction.'});
    return {dataset:dataset.id,source:source.id};
  });
  await page.evaluate((id) => window.AIZANOI_WORKSPACE.open('data-lab',{recordId:id}), ids.dataset);
  await page.waitForSelector('.az-workbench-window[data-workbench-app="data-lab"] .az-data-table');
  await page.waitForTimeout(220);
  await page.screenshot({path:`${out}/00h-data-lab.png`});
  await page.evaluate((id) => window.AIZANOI_WORKSPACE.open('source-reader',{recordId:id}), ids.source);
  await page.waitForSelector('.az-workbench-window[data-workbench-app="source-reader"] .az-source-document');
  await page.waitForTimeout(180);
  await page.screenshot({path:`${out}/00i-source-reader.png`});
  await page.evaluate(() => window.AIZANOI_OS.launchApp('notes'));
  await page.waitForSelector('.az-workbench-window[data-workbench-app="notes"] .az-note-area');
  await page.locator('.az-workbench-window[data-workbench-app="notes"] [data-note-title]').fill('Acropolis comparative field note');
  await page.locator('.az-workbench-window[data-workbench-app="notes"] [data-note-area]').fill('Compare documented architectural evidence against the rendered visual layer. Keep inference clearly separated from archaeology.');
  await page.waitForTimeout(520);
  await page.screenshot({path:`${out}/00j-field-notes.png`});
  await page.evaluate(() => window.AIZANOI_OS.launchApp('monitor'));
  await page.waitForSelector('.az-workbench-window[data-workbench-app="monitor"] .az-monitor-shell');
  await page.waitForTimeout(180);
  await page.screenshot({path:`${out}/00k-workspace-monitor.png`});
  await context.close();
}

{
  const {context,page}=await shellPage({width:390,height:844},true);
  await page.waitForSelector('#az-mobile-home:not(.hidden)');
  await page.screenshot({path:`${out}/00l-distribution-mobile-home.png`});
  await page.locator('#az-mobile-apps [data-app="archive"]').click();
  await page.waitForSelector('.az-workbench-window[data-workbench-app="archive"]');
  await page.waitForTimeout(180);
  await page.screenshot({path:`${out}/00m-distribution-mobile-archive.png`});
  await context.close();
}

await browser.close();
console.log('Aizanoi distribution visual captures complete');
