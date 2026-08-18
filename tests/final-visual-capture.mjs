import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = 'artifacts/final-visual-review';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'],
});

async function newPage(viewport = { width: 1440, height: 900 }, mobile = false) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile:mobile, hasTouch:mobile });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => console.error('PAGEERROR', String(error)));
  return { context, page };
}

async function releasePointer(page) {
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
}

// Aizanoi Field System: capture the shell itself before opening a product window.
{
  const { context, page } = await newPage();
  await page.goto(`${base}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'), null, { timeout: 5000 });
  await page.waitForFunction(() => Boolean(window.AIZANOI_OS && document.body.classList.contains('aizanoi-next')), null, { timeout:5000 });
  await page.screenshot({ path: `${out}/00-os-field-home.png` });

  await page.locator('#start-btn').click();
  await page.waitForSelector('#az-index.open');
  await page.screenshot({ path: `${out}/00b-os-aizanoi-index.png` });
  await page.keyboard.press('Escape');

  await page.keyboard.press('Control+K');
  await page.locator('#az-command-input').fill('open Rome at Colosseum');
  await page.screenshot({ path: `${out}/00c-os-command.png` });
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.AIZANOI_OS.openSystemPanel());
  await page.waitForSelector('#az-system-panel.open');
  await page.screenshot({ path: `${out}/00d-os-system-panel.png` });
  await page.keyboard.press('Escape');

  await page.evaluate(() => window.AIZANOI_OS.launchApp('chatbot'));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/01-os-desktop.png` });
  console.log('captured Aizanoi Field System desktop set');
  await context.close();
}

// Mobile is a first-class app home/switcher model, not a squeezed desktop.
{
  const { context, page } = await newPage({ width:390, height:844 }, true);
  await page.goto(`${base}/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'), null, { timeout:5000 });
  await page.waitForFunction(() => Boolean(window.AIZANOI_OS && document.body.classList.contains('aizanoi-next')), null, { timeout:5000 });
  await page.waitForSelector('#az-mobile-home:not(.hidden)');
  await page.screenshot({ path:`${out}/01b-os-mobile-home.png` });
  await page.locator('[data-mobile-nav="search"]').click();
  await page.waitForSelector('#az-command.open');
  await page.screenshot({ path:`${out}/01c-os-mobile-command.png` });
  console.log('captured Aizanoi Field System mobile set');
  await context.close();
}

{
  const { context, page } = await newPage();
  await page.goto(`${base}/historic-world/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__AIZANOI_DEBUG__), null, { timeout: 12000 });
  await page.locator('#enterBtn').click();
  await page.waitForTimeout(250);
  await releasePointer(page);

  for (const shot of [
    ['temple', '02-aizanoi-temple.png'],
    ['theatre', '03-aizanoi-theatre.png'],
    ['reswest', '04-aizanoi-residential.png'],
    ['penkalas', '05-aizanoi-riverfront.png'],
  ]) {
    await page.evaluate((target) => window.__AIZANOI_DEBUG__?.teleportTo?.(target, { lock: false }), shot[0]);
    await page.waitForTimeout(600);
    const state = await page.evaluate(() => window.__AIZANOI_DEBUG__?.player);
    console.log(`historic-world ${shot[0]} arrival`, JSON.stringify(state));
    await page.screenshot({ path: `${out}/${shot[1]}` });
  }
  console.log('captured Aizanoi review set');
  await context.close();
}

for (const city of [
  {
    slug: 'rome-410-476',
    shots: [
      ['colosseum', '06-rome-colosseum.png'],
      ['forum', '07-rome-forum.png'],
      ['pantheon', '08-rome-pantheon.png'],
    ],
  },
  {
    slug: 'athens-450-430',
    shots: [
      ['parthenon', '09-athens-acropolis.png'],
      ['hephaisteion', '10-athens-agora.png'],
      ['pnyx-bema', '11-athens-pnyx.png'],
    ],
  },
]) {
  const { context, page } = await newPage();
  await page.goto(`${base}/ancient-cities/${city.slug}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__), null, { timeout: 12000 });
  await page.locator('#enter').click();
  await page.waitForTimeout(250);
  await releasePointer(page);

  for (const [target, file] of city.shots) {
    const ok = await page.evaluate((id) => window.__ANCIENT_WORLD_DEBUG__?.teleport?.(id), target);
    if (!ok) throw new Error(`${city.slug} teleport failed: ${target}`);
    await page.waitForTimeout(700);
    const state = await page.evaluate(() => window.__ANCIENT_WORLD_DEBUG__?.player);
    console.log(`${city.slug} ${target} arrival`, JSON.stringify(state));
    await page.screenshot({ path: `${out}/${file}` });
  }
  console.log(`captured ${city.slug} review set`);
  await context.close();
}

await browser.close();
console.log('Final visual review captures complete');
