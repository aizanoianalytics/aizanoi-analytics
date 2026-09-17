// _aizanoi-intro-denetim.mjs — TEST-ONLY: intro ucusu sütun icinden geciyor mu, takiliyor mu?
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const BASE = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const SHOTDIR = join(dirname(fileURLToPath(import.meta.url)), 'ekran-goruntuleri');
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
  const btn = page.locator('#btn-enter').first();
  await btn.waitFor({ state: 'visible', timeout: 90000 });
  await btn.click({ timeout: 10000 });
  for (const t of [6, 16, 30, 45]) {
    await page.waitForTimeout(t === 6 ? 6000 : t === 16 ? 10000 : t === 30 ? 14000 : 15000);
    const st = await page.evaluate(() => {
      const c = window.__WORLD_DEBUG__;
      return {
        cam: c?.camera?.position ? [c.camera.position.x, c.camera.position.y, c.camera.position.z].map((v) => +v.toFixed(1)) : null,
        introDone: c?.intro?.isComplete ?? null,
        controls: c?.controls?.enabled ?? null,
        keys: c ? Object.keys(c) : [],
      };
    });
    console.log(`t=${t}s`, JSON.stringify(st));
    const { writeFileSync } = await import('node:fs');
    try {
      const cdp = await page.context().newCDPSession(page);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOTDIR, `aizanoi-t${t}.png`), Buffer.from(data, 'base64'));
    } catch {}
  }
  console.log('errors:', errors.length);
  for (const e of errors.slice(0, 5)) console.log('  ' + e.slice(0, 200));
} finally {
  await browser.close();
}
