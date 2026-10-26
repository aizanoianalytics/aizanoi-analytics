import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, appendFileSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const evidence = process.env.APP_STYLE_EVIDENCE_DIR;
const devices = [ ['desktop', 1440, 900], ['tablet', 834, 1112], ['phone', 390, 844] ];
async function capture(page, name, data) {
  if (!evidence) return;
  mkdirSync(evidence, { recursive: true });
  await page.screenshot({ path: `${evidence}/${name}.png` });
  appendFileSync(`${evidence}/metrics.jsonl`, JSON.stringify({ name, ...data }) + '\n');
}
async function launch(page, app, device) {
  const prefix = device === 'desktop' ? '.az-desktop-shortcut' : device === 'tablet' ? '.az-tablet-app' : '.az-phone-app';
  const shortcut = page.locator(`${prefix}[data-app="${app}"]:visible`);
  if (await shortcut.count()) await shortcut.first().click();
  else {
    await page.locator('[data-os-launcher]:visible').first().click();
    await page.locator(`[data-app="${app}"]:visible`).first().click();
  }
  await page.locator(`.az-window[data-app-id="${app}"]`).waitFor();
}
async function shellMetrics(page) {
  return page.evaluate(() => {
    const selectors = ['html', 'body', 'main', '.az-tablet-brand-card h1', '.az-phone-home-header h1', 'a[href*="x.com"]'];
    return Object.fromEntries(selectors.map(selector => {
      const el = document.querySelector(selector);
      if (!el) return [selector, null];
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return [selector, { x:r.x, width:r.width, font:s.font, color:s.color, background:s.background, padding:s.padding, margin:s.margin, overflowX:s.overflowX, ink:s.getPropertyValue('--ink') }];
    }));
  });
}
for (const [device, width, height] of devices) {
  test(`Forge repository heading fits its ${device} card`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport:{width,height}, serviceWorkers:'block' });
      await page.goto(base); await page.waitForTimeout(600);
      await launch(page, 'forge', device);
      const overflow = await page.locator('.az-simple-card h3').first().evaluate(el => ({ clientWidth:el.clientWidth, scrollWidth:el.scrollWidth, text:el.innerText, computed:JSON.parse(JSON.stringify({ overflowWrap:getComputedStyle(el).overflowWrap, wordBreak:getComputedStyle(el).wordBreak, whiteSpace:getComputedStyle(el).whiteSpace })) }));
      await capture(page, `${device}-forge-card`, overflow);
      assert.ok(overflow.clientWidth >= overflow.scrollWidth, 'first repository heading must not overflow');
      assert.equal(overflow.computed.overflowWrap, 'anywhere', 'unbroken repository identifier must be allowed to wrap inside its card');
      assert.match(overflow.text, /aizanoianalytics\/aizanoi-analytics/);
    } finally { await browser.close(); }
  });
  test(`Labs reports loading, failure and retry honestly on ${device}`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport:{width,height}, serviceWorkers:'block' });
      let release;
      const gate = new Promise(resolve => { release = resolve; });
      await page.route('**/js/v3/apps/labs/assets/*.mp4', async route => { await gate; await route.abort(); });
      await page.goto(base); await page.waitForTimeout(600);
      await launch(page, 'labs', device);
      const panel = page.locator('[data-workspace-panel="grok"]');
      assert.match(await panel.locator('.az-labs-file-state').innerText(), /Loading/, 'an unready video is not yet attached');
      release();
      await panel.locator('.az-labs-video-empty').waitFor({state:'visible'});
      assert.match(await panel.locator('.az-labs-video-empty').innerText(), /could not be loaded/);
      await capture(page, `${device}-labs-error`, { state:await panel.locator('.az-labs-file-state').innerText() });
      await page.unroute('**/js/v3/apps/labs/assets/*.mp4');
      await panel.getByRole('button', {name:'Retry video'}).click();
      await page.waitForFunction(() => document.querySelector('[data-labs-video="grok"]')?.readyState >= 2);
      assert.equal(await panel.locator('.az-labs-video-empty').isVisible(), false);
      assert.match(await panel.locator('.az-labs-file-state').innerText(), /Ready/);
      await capture(page, `${device}-labs-retried`, { ready:await panel.locator('video').evaluate(v => v.readyState) });
      await page.locator('[data-workspace-tab="step5"]').click();
      await page.locator('[data-workspace-panel="step5"]').getByRole('button', {name:'Retry video'}).click();
      await page.waitForFunction(() => document.querySelector('[data-labs-video="step5"]')?.readyState >= 2);
      assert.equal(await page.locator('[data-workspace-panel="grok"]').isVisible(), false);
      assert.equal(await page.locator('[data-workspace-panel="step5"] .az-labs-video-empty').isVisible(), false);
    } finally { await browser.close(); }
  });
  test(`Labs hides its video fallback on ${device}`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport:{width,height}, serviceWorkers:'block' });
      await page.goto(base); await page.waitForTimeout(600);
      await launch(page, 'labs', device);
      await page.waitForFunction(() => document.querySelector('[data-labs-video="grok"]')?.readyState >= 2);
      const state = await page.locator('[data-video-slot="grok"]').evaluate(slot => ({ hidden:slot.querySelector('.az-labs-video-empty').hidden, display:getComputedStyle(slot.querySelector('.az-labs-video-empty')).display, ready:slot.querySelector('video').readyState, error:slot.querySelector('video').error }));
      await capture(page, `${device}-labs-ready`, state);
      assert.equal(state.hidden, true);
      assert.equal(state.display, 'none', 'ready video must not show a contradictory fallback');
      assert.equal(state.error, null);
    } finally { await browser.close(); }
  });
  test(`Markets leaves ${device} shell unchanged while open and after close`, async () => {
    const browser = await chromium.launch();
    try {
      const page = await browser.newPage({ viewport:{ width,height }, serviceWorkers:'block' });
      const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await page.goto(base); await page.locator('.az-phone-home, .az-tablet-home, .az-desktop-shortcut').first().waitFor({ state:'attached' });
      await page.waitForTimeout(600);
      const before = await shellMetrics(page); await capture(page, `${device}-markets-before`, { before });
      await launch(page, 'markets', device);
      await page.locator('[data-raw-table] tbody tr[data-symbol]').first().waitFor();
      await page.waitForTimeout(300);
      const open = await shellMetrics(page); await capture(page, `${device}-markets-open`, { open });
      await page.locator('.az-window[data-app-id="markets"] [data-action="close"]').click();
      await page.locator('.az-window[data-app-id="markets"]').waitFor({ state:'detached' });
      const after = await shellMetrics(page); await capture(page, `${device}-markets-after`, { after });
      assert.deepEqual(open, before, 'lazy Markets stylesheet must not alter shell styles');
      assert.deepEqual(after, before, 'shell styles must survive Markets close');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });
}
