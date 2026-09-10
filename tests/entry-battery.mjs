// Entry battery v2 — desktop fix (click not tap, hasTouch where needed)
// + CPU-throttled variant (6x: a mid phone) and double-ENTER race variant.
// Probes the FULL natural flow: boot → ENTER → cinematic completes → controls.
import { chromium, webkit, devices } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'https://aizanoianalytics.com';
const worlds = [
  { id: 'aizanoi', path: '/worlds/aizanoi-225/' },
  { id: 'athens', path: '/worlds/athens-450-430/' },
  { id: 'rome', path: '/worlds/rome-410-476/' },
  { id: 'iga', path: '/worlds/iga-airport/' },
];

async function naturalEntry(browser, ctxOpts, spec, label, { enterTimes = 1, cdpThrottle = 0 } = {}) {
  const context = await browser.newContext(ctxOpts);
  const page = await context.newPage();
  if (cdpThrottle) {
    const session = await context.newCDPSession(page);
    await session.send('Emulation.setCPUThrottlingRate', { rate: cdpThrottle });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
  const out = { label, id: spec.id, enterTimes, cdpThrottle, errors };
  const t0 = Date.now();
  try {
    await page.goto(`${base}${spec.path}`, { waitUntil: 'load', timeout: 45000 });
    out.bootMs = Date.now() - t0;
    await page.waitForSelector('#btn-enter', { state: 'visible', timeout: 30000 });
    for (let i = 0; i < enterTimes; i++) {
      if (i === 0) {
        await page.locator('#btn-enter').click({ force: false, timeout: 10000 }).catch(async (e) => {
          out.clickFallback = String(e).split('\n')[0].slice(0, 120);
          await page.locator('#btn-enter').click({ force: true, timeout: 10000 });
        });
      } else {
        // Model impatient repeated activation without asking Playwright to click
        // a button that the first activation intentionally hid.
        await page.evaluate(() => document.getElementById('btn-enter')?.click());
      }
      await page.waitForTimeout(i === 0 ? 250 : 60);
    }
    await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, { timeout: 30000 });
    out.worldReadyMs = Date.now() - t0;
    await page.waitForFunction(() => window.__WORLD_DEBUG__?.player?.controlsEnabled === true, null, { timeout: 35000 });
    out.controlsMs = Date.now() - t0;
    out.passed = true;
    out.metrics = await page.evaluate(() => window.__WORLD_DEBUG__?.metrics?.() || null);
  } catch (e) {
    out.failure = String(e).split('\n')[0].slice(0, 200);
    out.stateAtFailure = await page.evaluate(() => ({
      worldReady: document.documentElement.dataset.worldReady || null,
      loadingVisible: (() => { const el = document.getElementById('loading-screen'); return el ? getComputedStyle(el).display !== 'none' : false; })(),
      loadingText: document.querySelector('.loading-title')?.textContent || null,
      introModalDisplay: (() => { const el = document.getElementById('intro-modal'); return el ? getComputedStyle(el).display : null; })(),
      cinematicDisplay: (() => { const el = document.getElementById('cinematic-title'); return el ? getComputedStyle(el).display : null; })(),
      controlsEnabled: window.__WORLD_DEBUG__?.player?.controlsEnabled ?? null,
      audioInit: window.__WORLD_DEBUG__?.audio?.isInitialized ?? null,
    })).catch(() => ({ evalFailed: true }));
  }
  out.errors = errors.slice(0, 6);
  await context.close();
  return out;
}

const desktop = { viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' };
const glArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];
const mobile = { ...devices['iPhone 13'], serviceWorkers: 'block' };

const results = [];
// A. Desktop, natural entry, single ENTER
{
  const browser = await chromium.launch({ headless: true, args: glArgs });
  for (const spec of worlds) results.push(await naturalEntry(browser, desktop, spec, 'desktop'));
  await browser.close();
}
// B. Desktop, DOUBLE-ENTER race (impatient user taps twice)
{
  const browser = await chromium.launch({ headless: true, args: glArgs });
  for (const spec of worlds) results.push(await naturalEntry(browser, desktop, spec, 'desktop-double-enter', { enterTimes: 3 }));
  await browser.close();
}
// C. Desktop 6x CPU throttle (mid-range phone emulation)
{
  const browser = await chromium.launch({ headless: true, args: glArgs });
  for (const spec of worlds) results.push(await naturalEntry(browser, desktop, spec, 'desktop-6x-throttle', { cdpThrottle: 6 }));
  await browser.close();
}
// D. WebKit iPhone 13 (real browser class on the user's device)
{
  const browser = await webkit.launch({ headless: true });
  for (const spec of worlds) results.push(await naturalEntry(browser, mobile, spec, 'webkit-iphone13'));
  await browser.close();
}
for (const r of results) console.log(JSON.stringify(r));
const failures = results.filter((result) => !result.passed);
console.log(`battery v2 done: ${results.length - failures.length}/${results.length} passed`);
if (failures.length) process.exitCode = 1;
