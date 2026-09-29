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
// framebuffer and require actual content, so a black frame fails the routine
// gate instead of passing it.
//
// The framebuffer must be read with readPixels rather than by drawing the
// WebGL canvas into a 2D canvas: the renderer runs without
// preserveDrawingBuffer, so by the time a drawImage copy happens the drawing
// buffer has already been cleared and the copy comes back black. Reading the
// pixels directly, inside a rAF callback and before the frame is presented,
// measures the frame that was actually drawn -- which is how the black-frame
// investigation distinguished a healthy render from a broken one.
async function assertRenderedFrame(page, label) {
  const stats = await page.evaluate(() => new Promise((resolve) => {
    // Run this inside the same animation frame as the world's own draw, so the
    // drawing buffer still holds the frame that was just rendered.
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas#viewport');
      if (!canvas) {
        resolve({ error: 'no canvas' });
        return;
      }
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        resolve({ error: 'no webgl context' });
        return;
      }
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0;
      let max = 0;
      let lit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const v = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
        sum += v;
        if (v > max) max = v;
        if (v > 3) lit += 1;
      }
      const total = pixels.length / 4;
      resolve({
        mean: +(sum / total).toFixed(2),
        max: +max.toFixed(1),
        litPct: +((lit / total) * 100).toFixed(1),
        glError: gl.getError()
      });
    });
  }));
  assert.ok(!stats.error, `${label}: ${stats.error}`);
  assert.equal(stats.glError, 0, `${label}: WebGL reported error ${stats.glError}`);
  assert.ok(stats.max > 8, `${label}: frame is black (max luma ${stats.max}, mean ${stats.mean})`);
  assert.ok(stats.litPct > 5, `${label}: frame has almost no lit pixels (${stats.litPct}%)`);
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
