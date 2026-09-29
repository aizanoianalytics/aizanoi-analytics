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

// Measure the same state the routine gate measures: after the intro lands and
// the player has control. Sampling mid-cinematic measures the camera in flight,
// which is a different question than "does the world draw".
await page.keyboard.press('Escape');
await page.waitForFunction(
  () => window.__WORLD_DEBUG__?.player?.controlsEnabled === true,
  null,
  { timeout: 20000 }
);
console.log('arrival complete, controls enabled');

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

// Count real animation frames: near-zero ticks mean nothing is driving the loop.
console.log('\n=== animation frame delivery ===');
console.log(JSON.stringify(await page.evaluate(() => new Promise((resolve) => {
  let n = 0;
  const t0 = performance.now();
  const tick = () => {
    n += 1;
    if (performance.now() - t0 < 2000) {
      requestAnimationFrame(tick);
    } else {
      resolve({ rafTicksIn2s: n, metrics: window.__WORLD_DEBUG__.metrics ?? null });
    }
  };
  requestAnimationFrame(tick);
})), null, 2));

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

// Sample the drawing buffer directly, inside a rAF callback so the buffer is
// still the frame that was just drawn. A drawImage copy after presentation
// samples a cleared buffer (the renderer does not preserve it) and reports a
// false black frame -- which is exactly the misdiagnosis this script exists to
// rule out.
console.log('\n=== framebuffer sample (readPixels inside rAF) ===');
const sample = await page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => {
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let sum = 0, max = 0, lit = 0;
    for (let i = 0; i < px.length; i += 4) {
      const v = px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
      sum += v; if (v > max) max = v; if (v > 3) lit += 1;
    }
    const total = px.length / 4;
    resolve({
      mean: +(sum / total).toFixed(2),
      max: +max.toFixed(1),
      litPct: +((lit / total) * 100).toFixed(1),
      drawingBuffer: { w, h },
      glError: gl.getError()
    });
  });
}));
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
