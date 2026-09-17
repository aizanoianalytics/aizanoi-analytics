// _tarayici-duman.mjs — TEST-ONLY tarayici duman testi (work klasoru, upstream degil).
// Kullanim (repo kokunden, sunucu ayri terminalde veya asagidaki gibi job ile):
//   node gelistirmeler/2026-09-16-harita-revizyonu/_tarayici-duman.mjs
// Her rotada: HTTP, WebGL destegi, console/page error yok, Enter tiklanabilirlik, ekran goruntusu.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const BASE = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const SHOTDIR = join(dirname(fileURLToPath(import.meta.url)), 'ekran-goruntuleri');
mkdirSync(SHOTDIR, { recursive: true });

const ROUTES = [
  { route: '/worlds/', label: 'worlds-portal', enter: null },
  { route: '/worlds/aizanoi-225/', label: 'aizanoi', enter: '#btn-enter, #intro-modal button' },
  { route: '/worlds/rome-410-476/', label: 'rome', enter: '#btn-enter, #intro-modal button' },
  { route: '/worlds/athens-450-430/', label: 'athens', enter: '#btn-enter, #intro-modal button' },
  { route: '/worlds/iga-airport/', label: 'iga', enter: '#btn-enter, #intro-modal button' },
  { route: '/labs/fly-world/', label: 'fly', enter: null },
];

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
let fails = 0;
try {
  for (const { route, label, enter } of ROUTES) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const http = res?.status() ?? -1;
      const webgl = await page.evaluate(() => {
        try {
          const c = document.createElement('canvas');
          return !!(c.getContext('webgl2') || c.getContext('webgl'));
        } catch { return false; }
      });
      let entered = 'n/a';
      if (enter) {
        const btn = page.locator(enter).first();
        try {
          // Heavy scenes (rome/athens GLB kits under SwiftShader) can keep
          // the intro hidden for a while; wait generously.
          await btn.waitFor({ state: 'visible', timeout: 90000 });
          await btn.click({ timeout: 10000 });
          entered = 'clicked';
        } catch { entered = 'no-button'; }
      }
      await page.waitForTimeout(6000);
      const sceneState = await page.evaluate(() => ({
        loadingHidden: (() => {
          const el = document.querySelector('#loading-screen');
          if (!el) return 'n/a';
          const s = getComputedStyle(el);
          return s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0';
        })(),
        debug: typeof window.__WORLD_DEBUG__ !== 'undefined' || typeof window.__FLY_DEBUG__ !== 'undefined',
      }));
      // CDP capture: Playwright's screenshot() waits for document.fonts,
      // which can stall under SwiftShader load; CDP skips that wait.
      try {
        const cdp = await page.context().newCDPSession(page);
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        const { writeFileSync } = await import('node:fs');
        writeFileSync(join(SHOTDIR, `${label}.png`), Buffer.from(data, 'base64'));
      } catch {
        await page.screenshot({ path: join(SHOTDIR, `${label}.png`), timeout: 20000 });
      }
      const ok = http === 200 && webgl && errors.length === 0;
      if (!ok) fails++;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${label}: http=${http} webgl=${webgl} enter=${entered} loadingHidden=${sceneState.loadingHidden} debug=${sceneState.debug} errors=${errors.length}`);
      for (const e of errors.slice(0, 5)) console.log('   ' + e.slice(0, 220));
    } catch (e) {
      fails++;
      console.log(`FAIL ${label}: EXCEPTION ${e.message.slice(0, 200)}`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
console.log(fails === 0 ? 'TUM TARAYICI KONTROLLERI GECTI' : `${fails} ROTA HATALI`);
process.exit(fails ? 1 : 0);
