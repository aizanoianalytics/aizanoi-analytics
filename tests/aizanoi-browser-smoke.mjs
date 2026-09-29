// Aizanoi real-browser smoke (desktop + mobile), promoted into routine CI.
// Replaces the retired four-world `worlds-browser-smoke.mjs` (text #25).
// Asserts the public artifact contract, not implementation details.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const AIZANOI = { id: 'aizanoi', path: '/worlds/aizanoi-225/', hero: 'temple' };
const LANDMARKS = ['temple', 'macellum'];

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
});

async function open(context, spec) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const response = await page.goto(`${base}${spec.path}`, { waitUntil: 'networkidle' });
  assert.ok(response?.ok(), `${spec.id}: HTTP ${response?.status()}`);
  await page.waitForFunction(
    () => window.__WORLD_BOOTSTRAP__?.ready === true || window.__WORLD_DEBUG__?.ready === true,
    null,
    { timeout: 20000 },
  );
  assert.equal(await page.locator('canvas#viewport').count(), 1, `${spec.id}: WebGL canvas missing`);
  return { page, errors };
}

const position = (page) => page.evaluate(() => window.__WORLD_DEBUG__.player);

// A canvas that exists is not proof that anything was drawn. Sample the real
// framebuffer after real animation frames have run and require actual content,
// so a black frame fails the routine gate instead of passing it.
async function assertRenderedFrame(page, label) {
  const stats = await page.evaluate(async () => {
    // Let the render loop actually produce frames before judging the buffer.
    await new Promise((resolve) => {
      let ticks = 0;
      const tick = () => {
        ticks += 1;
        if (ticks < 12) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
    const canvas = document.querySelector('canvas#viewport');
    if (!canvas) return { error: 'no canvas' };
    const off = document.createElement('canvas');
    off.width = 160; off.height = 100;
    const ctx = off.getContext('2d');
    ctx.drawImage(canvas, 0, 0, off.width, off.height);
    const { data } = ctx.getImageData(0, 0, off.width, off.height);
    let sum = 0, max = 0, lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      sum += v; if (v > max) max = v; if (v > 3) lit += 1;
    }
    const px = data.length / 4;
    return { mean: +(sum / px).toFixed(2), max: +max.toFixed(1), litPct: +((lit / px) * 100).toFixed(1) };
  });
  assert.ok(!stats.error, `${label}: ${stats.error}`);
  assert.ok(stats.max > 8, `${label}: frame is black (max luma ${stats.max}, mean ${stats.mean})`);
  assert.ok(stats.litPct > 1, `${label}: frame has almost no lit pixels (${stats.litPct}%)`);
  return stats;
}

async function enter(page, spec) {
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, null, { timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__WORLD_DEBUG__?.player?.controlsEnabled===true,null,{timeout:10000});
  assert.ok(await page.locator('.hud-top').count(), `${spec.id}: HUD missing`);
  const luma = await assertRenderedFrame(page, `${spec.id} first frame`);
  console.log(`  ${spec.id} rendered frame: mean=${luma.mean} max=${luma.max} lit=${luma.litPct}%`);
}

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
  const opened = await open(context, AIZANOI);
  const page = opened.page;
  await enter(page, AIZANOI);

  // movement
  const before = await position(page);
  await page.keyboard.down('w');
  assert.equal(await page.evaluate(() => window.__WORLD_DEBUG__.step(0.25)), true, 'deterministic movement step unavailable');
  await page.keyboard.up('w');
  const after = await position(page);
  const d = Math.hypot(after.x - before.x, after.z - before.z);
  assert.ok(d > 0.05 && d < 20, `WASD movement unstable (${d})`);

  // fast travel: the hero landmark plus at least one more (text #25)
  for (const landmark of LANDMARKS) {
    assert.equal(await page.evaluate((id) => window.__WORLD_DEBUG__.teleport(id), landmark), true, `teleport failed: ${landmark}`);
  }

  // evidence toggle
  assert.equal(await page.evaluate(() => window.__WORLD_DEBUG__.toggleEvidence()), true, 'evidence did not enable');
  assert.equal(await page.evaluate(() => window.__WORLD_DEBUG__.toggleEvidence()), false, 'evidence did not disable');

  assert.deepEqual(opened.errors, [], `desktop errors: ${opened.errors.join(' | ')}`);
  await context.close();
}

{
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
  });
  const mo = await open(mobile, AIZANOI);
  const mp = mo.page;
  await mp.locator('#btn-enter').tap();
  await mp.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, null, { timeout: 30000 });
  await mp.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, { timeout: 30000 });
  await mp.waitForFunction(() => getComputedStyle(document.querySelector('#loading-screen')).display === 'none', null, { timeout: 30000 });
  await mp.touchscreen.tap(300, 400);
  await mp.waitForFunction(() => window.__WORLD_DEBUG__?.player?.controlsEnabled === true, null, { timeout: 10000 });

  const rightTarget = await mp.evaluate(() => {
    const el = document.elementFromPoint(innerWidth * 0.75, innerHeight * 0.5);
    return { tag: el?.tagName || '', id: el?.id || '', className: typeof el?.className === 'string' ? el.className : '' };
  });
  assert.deepEqual(rightTarget, { tag: 'CANVAS', id: 'viewport', className: '' }, `look surface covered after entry (${JSON.stringify(rightTarget)})`);
  await mp.waitForFunction(() => getComputedStyle(document.querySelector('#mobile-controls')).display !== 'none');
  const pad = await mp.locator('#movePad').boundingBox();
  assert.ok(pad, 'mobile joystick missing');
  const box = await mp.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(box.sw <= box.cw + 2, 'mobile horizontal overflow');
  assert.deepEqual(mo.errors, [], `mobile errors: ${mo.errors.join(' | ')}`);
  await mobile.close();
}

await browser.close();
console.log('Aizanoi desktop/mobile WebGL smoke passed');
