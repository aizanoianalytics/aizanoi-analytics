// _aizanoi-sahne-denetim.mjs — TEST-ONLY: tapinak konumu/kamera uzakligi + teleport/tur kareleri.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { writeFileSync } from 'node:fs';

const BASE = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const SHOTDIR = join(dirname(fileURLToPath(import.meta.url)), 'ekran-goruntuleri');
async function shot(page, name) {
  const cdp = await page.context().newCDPSession(page);
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(SHOTDIR, name), Buffer.from(data, 'base64'));
}
const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/worlds/aizanoi-225/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#btn-enter').first().waitFor({ state: 'visible', timeout: 90000 });
  await page.locator('#btn-enter').first().click({ timeout: 10000 });
  await page.waitForTimeout(5000);
  const geo = await page.evaluate(() => {
    const D = window.__WORLD_DEBUG__;
    let temple = null;
    D.scene.traverse((o) => {
      if (!temple && /temple_of_zeus|temple-cella/i.test(o.name || '')) temple = o;
    });
    const tp = temple ? temple.getWorldPosition(new (Object.getPrototypeOf(temple.position).constructor)(0, 0, 0)) : null;
    const cam = D.player?.position || D.player?.camera?.position || null;
    return {
      templeName: temple?.name || null,
      templePos: tp ? [tp.x, tp.y, tp.z].map((v) => +v.toFixed(1)) : null,
      camPos: cam ? [cam.x, cam.y, cam.z].map((v) => +v.toFixed(1)) : null,
      meshCount: (() => { let n = 0; D.scene.traverse((o) => { if (o.isMesh) n++; }); return n; })(),
    };
  });
  console.log('geometri:', JSON.stringify(geo));
  // Teleport: theatre
  await page.evaluate(() => window.__WORLD_DEBUG__.teleport('theatre'));
  await page.waitForTimeout(5000);
  await shot(page, 'aizanoi-teleport-theatre.png');
  // Tur: baslat, 12 sn sonra karele
  await page.evaluate(() => window.__WORLD_DEBUG__.tour.start());
  await page.waitForTimeout(12000);
  await shot(page, 'aizanoi-tur.png');
  await page.evaluate(() => window.__WORLD_DEBUG__.tour.stop());
  console.log('errors:', errors.length);
  for (const e of errors.slice(0, 5)) console.log('  ' + e.slice(0, 200));
  console.log(errors.length === 0 ? 'SAHNE DENETIMI GECTI' : 'SAHNE HATALI');
  process.exit(errors.length ? 1 : 0);
} finally {
  await browser.close();
}
