import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const out = 'artifacts/final-visual-review';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'],
});

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', (error) => console.error('PAGEERROR', String(error)));
  return { context, page };
}

async function releasePointer(page) {
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
}

{
  const { context, page } = await newPage();
  await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide'), null, { timeout: 5000 });
  await page.evaluate(() => window.openApp?.('chatbot'));
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${out}/01-os-desktop.png` });
  console.log('captured OS');
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
