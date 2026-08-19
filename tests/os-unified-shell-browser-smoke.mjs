import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const LEGACY_PRE_SHELL_SVG_WARNING = /<g> attribute transform: Expected '\)', "translate\(50%, 100%\)"/;
mkdirSync('artifacts/diagnostics', { recursive:true });
const browser = await chromium.launch({ headless:true });

async function openShell({ name, width, height, mobile = false, expected }) {
  const context = await browser.newContext({
    viewport:{ width, height },
    isMobile:mobile,
    hasTouch:mobile || expected === 'tablet',
    deviceScaleFactor:mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => {
    const text = String(error);
    if (!LEGACY_PRE_SHELL_SVG_WARNING.test(text)) errors.push(text);
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (!LEGACY_PRE_SHELL_SVG_WARNING.test(text)) errors.push(text);
  });

  await page.goto(`${base}/`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => !document.getElementById('boot') || document.getElementById('boot').classList.contains('hide') || getComputedStyle(document.getElementById('boot')).display === 'none', null, { timeout:8000 });
  await page.waitForFunction(() => Boolean(window.AIZANOI_OS_STATE && window.AIZANOI_UNIFIED_SHELL), null, { timeout:8000 });
  await page.waitForFunction(() => document.querySelectorAll('#az-mobile-apps .az-mobile-app').length === 8, null, { timeout:5000 });

  assert.equal(await page.evaluate(() => document.body.dataset.azLayout), expected, `${name}: wrong responsive mode`);
  assert.equal(await page.locator('#az-mobile-apps .az-mobile-app').count(), 8, `${name}: launcher must expose eight synchronized apps`);
  assert.equal(await page.locator('#az-mobile-apps [data-app="chatbot"]').count(), 0, `${name}: disabled AI leaked into launcher`);
  assert.equal(await page.locator('#az-mobile-apps [data-app="terminal"]').count(), 1, `${name}: terminal missing from launcher`);
  assert.notEqual(await page.locator('#az-mobile-home').evaluate((node) => getComputedStyle(node).display), 'none', `${name}: unified home not visible`);

  const dock = await page.locator('#taskbar').boundingBox();
  assert.ok(dock, `${name}: dock missing`);
  if (expected === 'mobile') {
    assert.ok(dock.x <= 1 && Math.abs(dock.width - width) <= 2, `${name}: mobile dock must span viewport`);
    assert.equal(await page.locator('#az-mobile-nav [data-mobile-nav]').count(), 3, `${name}: mobile dock must have three actions`);
    assert.equal(await page.locator('#az-mobile-nav [data-mobile-nav="ai"]').count(), 0, `${name}: legacy AI nav must be removed`);
  } else {
    assert.ok(dock.x >= 6 && dock.width <= width - 12, `${name}: desktop/tablet dock should float inside viewport`);
  }

  await page.screenshot({ path:`artifacts/diagnostics/unified-${name}.png`, fullPage:false });

  await page.locator('#az-mobile-apps [data-app="terminal"]').click();
  const terminal = page.locator('.win').filter({ hasText:'Terminal' }).first();
  await terminal.waitFor({ state:'visible', timeout:5000 });
  const box = await terminal.boundingBox();
  assert.ok(box, `${name}: terminal window missing`);
  if (expected === 'mobile') {
    assert.ok(box.width >= width - 2, `${name}: mobile application is not fullscreen-equivalent`);
    assert.equal(await page.locator('#az-mobile-home').evaluate((node) => getComputedStyle(node).display), 'none', `${name}: mobile home should yield to fullscreen app`);
  } else {
    assert.ok(box.width < width, `${name}: windowed shell unexpectedly forced fullscreen`);
  }

  assert.deepEqual(errors, [], `${name}: browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await openShell({ name:'desktop', width:1440, height:900, expected:'desktop' });
await openShell({ name:'tablet', width:900, height:1180, expected:'tablet' });
await openShell({ name:'mobile', width:390, height:844, mobile:true, expected:'mobile' });

await browser.close();
console.log('Unified Aizanoi shell desktop/tablet/mobile smoke passed');
