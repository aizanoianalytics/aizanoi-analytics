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
  await page.evaluate(() => window.__AIZANOI_DEBUG__?.teleportTo?.('temple', { lock: false }));
  await page.waitForTimeout(550);
  await page.screenshot({ path: `${out}/02-aizanoi-temple.png` });
  console.log('captured Aizanoi');
  await context.close();
}

for (const city of [
  { slug: 'rome-410-476', target: 'colosseum', file: '03-rome-colosseum.png' },
  { slug: 'athens-450-430', target: 'parthenon', file: '04-athens-acropolis.png' },
]) {
  const { context, page } = await newPage();
  await page.goto(`${base}/ancient-cities/${city.slug}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__), null, { timeout: 12000 });
  await page.locator('#enter').click();
  await page.waitForTimeout(250);
  await page.evaluate((target) => window.__ANCIENT_WORLD_DEBUG__?.teleport?.(target), city.target);
  await page.waitForTimeout(650);
  await page.screenshot({ path: `${out}/${city.file}` });
  console.log(`captured ${city.slug}`);
  await context.close();
}

await browser.close();
console.log('Final visual review captures complete');
