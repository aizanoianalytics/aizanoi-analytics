import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
mkdirSync('artifacts/visual-audit', { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-gpu-sandbox'],
});

async function snapAizanoi() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/historic-world/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__AIZANOI_DEBUG__));
  await page.locator('#enterBtn').click();
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__AIZANOI_DEBUG__.teleportTo('temple', { lock: false }));
  await page.waitForTimeout(500);
  const stats = await page.evaluate(() => ({
    geometry: window.__AIZANOI_DEBUG__.geometry,
    player: window.__AIZANOI_DEBUG__.player,
    landmarks: window.__AIZANOI_DEBUG__.landmarks?.length || 0,
  }));
  console.log('AUDIT AIZANOI', JSON.stringify(stats));
  await page.screenshot({ path: 'artifacts/visual-audit/aizanoi-temple.png', fullPage: true });
  await context.close();
}

async function snapCity(slug, target) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.goto(`${base}/ancient-cities/${slug}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__));
  await page.locator('#enter').click();
  await page.waitForTimeout(250);
  await page.evaluate((id) => window.__ANCIENT_WORLD_DEBUG__.teleport(id), target);
  await page.waitForTimeout(500);
  const stats = await page.evaluate(() => ({
    geometry: window.__ANCIENT_WORLD_DEBUG__.geometry(),
    player: window.__ANCIENT_WORLD_DEBUG__.player,
    colliders: window.__ANCIENT_WORLD_DEBUG__.colliders?.length || 0,
    walkSurfaces: window.__ANCIENT_WORLD_DEBUG__.walkSurfaces?.length || 0,
  }));
  console.log(`AUDIT ${slug.toUpperCase()}`, JSON.stringify(stats));
  await page.screenshot({ path: `artifacts/visual-audit/${slug}.png`, fullPage: true });
  await context.close();
}

await snapAizanoi();
await snapCity('rome-410-476', 'colosseum');
await snapCity('athens-450-430', 'parthenon');
await browser.close();
