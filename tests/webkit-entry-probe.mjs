// iPhone 13 (WebKit) entry + audio + performance probe for the four worlds.
// Diagnoses the user-reported "won't open / audio weak / mobile unusable" on the
// device class they actually browse with. Run against a local static server.
import { webkit, devices } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4199';
const worlds = [
  { id: 'aizanoi', path: '/worlds/aizanoi-225/' },
  { id: 'athens', path: '/worlds/athens-450-430/' },
  { id: 'rome', path: '/worlds/rome-410-476/' },
  { id: 'iga', path: '/worlds/iga-airport/' },
];

const browser = await webkit.launch({ headless: true });
const report = [];

for (const spec of worlds) {
  const context = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });

  const r = { id: spec.id, errors };
  const t0 = Date.now();
  try {
    await page.goto(`${base}${spec.path}`, { waitUntil: 'load', timeout: 45000 });
    r.loaded = true;
    // wait for bootstrap ready flag (either debug facade)
    await page.waitForFunction(
      () => window.__WORLD_BOOTSTRAP__?.ready === true || window.__WORLD_DEBUG__?.ready === true,
      null, { timeout: 30000 }
    );
    r.bootMs = Date.now() - t0;
    r.canvas = await page.locator('canvas#viewport').count();
    // tap ENTER (touch, like the real device)
    await page.locator('#btn-enter').tap();
    await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, { timeout: 30000 });
    r.entered = true;
    // audio state after gesture
    r.audio = await page.evaluate(() => {
      const w = window.__WORLD_DEBUG__ || {};
      return { ready: !!w.ready, audio: w.audio ? JSON.stringify(w.audio).slice(0, 120) : null };
    });
    // joystick present?
    r.joystick = await page.evaluate(() => {
      const el = document.getElementById('mobile-controls') || document.getElementById('movePad');
      return el ? getComputedStyle(el).display !== 'none' : false;
    });
    // frame metrics if exposed
    r.metrics = await page.evaluate(() => {
      const m = window.__WORLD_DEBUG__?.metrics?.();
      if (!m) return null;
      return { fps: m.fps, p95: m.p95Ms ?? m.p95, max: m.maxMs ?? m.max };
    });
    // 6s walk on joystick-less keyboard fallback is meaningless on touch; instead just settle and re-read metrics
    await page.waitForTimeout(6000);
    r.metricsLate = await page.evaluate(() => {
      const m = window.__WORLD_DEBUG__?.metrics?.();
      if (!m) return null;
      return { fps: m.fps, p95: m.p95Ms ?? m.p95, max: m.maxMs ?? m.max };
    });
  } catch (e) {
    r.failure = String(e).split('\n')[0].slice(0, 220);
  }
  report.push(r);
  await context.close();
}

await browser.close();
for (const r of report) {
  console.log(`\n=== ${r.id} ===`);
  console.log(JSON.stringify(r, null, 2));
}
