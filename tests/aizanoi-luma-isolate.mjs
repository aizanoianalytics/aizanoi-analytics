// Isolate the first-frame luma=0 finding: real black frame, or a measurement
// artefact? Renders with the debug API, waits for real animation frames, and
// samples the canvas both through a 2D copy and through readPixels.
import { chromium } from 'playwright';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/worlds/aizanoi-225/`, { waitUntil: 'domcontentloaded' });
await page.locator('#btn-enter').click();
await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, { timeout: 60000 });
console.log('runtime ready');

// What does the debug surface actually expose?
console.log('\n=== debug API surface ===');
console.log(JSON.stringify(await page.evaluate(() => {
  const d = window.__WORLD_DEBUG__;
  return {
    keys: Object.keys(d),
    id: d.id,
    ready: d.ready,
    hasStart: typeof d.start,
    hasStep: typeof d.step,
    metrics: d.metrics ?? null,
    player: d.player ? Object.keys(d.player) : null
  };
}), null, 2));

// Drive the real start sequence, then count actual animation frames.
console.log('\n=== start() + animation frame count ===');
console.log(JSON.stringify(await page.evaluate(async () => {
  const d = window.__WORLD_DEBUG__;
  let started = null;
  try { started = d.start ? d.start() : 'no start()'; } catch (e) { started = `threw: ${e.message}`; }
  // Count real rAF ticks: 0 ticks means nothing is driving the render loop.
  const ticks = await new Promise((resolve) => {
    let n = 0;
    const t0 = performance.now();
    const tick = () => { n += 1; if (performance.now() - t0 < 2000) requestAnimationFrame(tick); else resolve(n); };
    requestAnimationFrame(tick);
  });
  return { startReturned: started, rafTicksIn2s: ticks, metricsAfter: d.metrics ?? null };
}), null, 2));

// Canvas reality: real backing-store size vs CSS size.
console.log('\n=== canvas sizing ===');
console.log(JSON.stringify(await page.evaluate(() => {
  const c = document.querySelector('canvas');
  if (!c) return { canvas: false };
  const r = c.getBoundingClientRect();
  return {
    canvas: true,
    attrWidth: c.width, attrHeight: c.height,
    cssWidth: Math.round(r.width), cssHeight: Math.round(r.height),
    clientWidth: c.clientWidth, clientHeight: c.clientHeight,
    style: c.getAttribute('style'),
    classes: c.className
  };
}), null, 2));

// Sample the framebuffer two independent ways after real frames have run.
console.log('\n=== framebuffer sample (two independent methods) ===');
const sample = await page.evaluate(async () => {
  // let the loop actually draw
  await new Promise((r) => setTimeout(r, 1200));
  const c = document.querySelector('canvas');
  const out = {};
  // 1) drawImage into a 2D canvas
  const off = document.createElement('canvas');
  off.width = 200; off.height = 125;
  const c2 = off.getContext('2d');
  c2.drawImage(c, 0, 0, off.width, off.height);
  const d2 = c2.getImageData(0, 0, off.width, off.height).data;
  let s = 0, mx = 0;
  for (let i = 0; i < d2.length; i += 4) { const v = d2[i] * .2126 + d2[i + 1] * .7152 + d2[i + 2] * .0722; s += v; if (v > mx) mx = v; }
  out.drawImageMean = +(s / (d2.length / 4)).toFixed(2);
  out.drawImageMax = +mx.toFixed(1);
  // 2) readPixels straight out of the GL context
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (gl) {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s2 = 0, mx2 = 0;
    for (let i = 0; i < px.length; i += 4) { const v = px[i] * .2126 + px[i + 1] * .7152 + px[i + 2] * .0722; s2 += v; if (v > mx2) mx2 = v; }
    out.readPixelsMean = +(s2 / (px.length / 4)).toFixed(2);
    out.readPixelsMax = +mx2.toFixed(1);
    out.drawingBuffer = { w, h };
    out.glError = gl.getError();
  }
  return out;
});
console.log(JSON.stringify(sample, null, 2));

// Scene content: is there anything in the scene graph at all?
console.log('\n=== scene graph ===');
console.log(JSON.stringify(await page.evaluate(() => {
  const d = window.__WORLD_DEBUG__;
  const s = d.scene;
  if (!s) return { scene: false };
  let meshes = 0, lights = 0, materials = new Set();
  s.traverse((o) => { if (o.isMesh) meshes += 1; if (o.isLight) lights += 1; if (o.material) materials.add(o.material.uuid); });
  return { scene: true, children: s.children.length, meshes, lights, distinctMaterials: materials.size, fog: s.fog?.type ?? null, background: s.background ? 'set' : null };
}), null, 2));

await page.screenshot({ path: 'artifacts/audit/aizanoi-runtime/luma-isolated.png' });
console.log('\nconsole errors:', errors.length ? errors.slice(0, 5) : 'none');
await browser.close();
