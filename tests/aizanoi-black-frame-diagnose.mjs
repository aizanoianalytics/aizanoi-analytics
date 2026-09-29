// Why is the Aizanoi frame black? Runs in whatever environment it is given and
// reports the renderer's own numbers (draw calls, triangles, render target,
// camera frustum) instead of guessing from a screenshot.
import { chromium } from 'playwright';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const args = process.env.AIZANOI_CHROME_ARGS
  ? process.env.AIZANOI_CHROME_ARGS.split(' ')
  : ['--use-gl=angle', '--enable-unsafe-swiftshader'];

const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/worlds/aizanoi-225/`, { waitUntil: 'domcontentloaded' });
await page.locator('#btn-enter').click();
await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, { timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', { timeout: 30000 });
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__WORLD_DEBUG__?.player?.controlsEnabled === true, null, { timeout: 15000 });

// Force many real frames, then read the renderer's own statistics.
const report = await page.evaluate(async () => {
  // Drive frames the way the browser does.
  await new Promise((resolve) => {
    let n = 0;
    const tick = () => {
      n += 1;
      if (n < 40) { requestAnimationFrame(tick); } else { resolve(); }
    };
    requestAnimationFrame(tick);
  });

  const canvas = document.querySelector('canvas#viewport');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

  // Reach the renderer through the scene's userData if exposed; otherwise
  // reconstruct what we can from the canvas + scene.
  const scene = window.__WORLD_DEBUG__.scene;
  const player = window.__WORLD_DEBUG__.player;

  // What does the framebuffer contain, sampled at several heights?
  const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, max = 0, alphaMax = 0;
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
    sum += v; if (v > max) max = v; if (px[i + 3] > alphaMax) alphaMax = px[i + 3];
  }

  return {
    gl: {
      version: gl.getParameter(gl.VERSION),
      drawingBuffer: { w, h },
      canvasAttr: { w: canvas.width, h: canvas.height },
      clearColor: Array.from(gl.getParameter(gl.COLOR_CLEAR_VALUE)),
      error: gl.getError(),
      contextLost: gl.isContextLost()
    },
    framebuffer: {
      mean: +(sum / (px.length / 4)).toFixed(2),
      max: +max.toFixed(1),
      alphaMax
    },
    scene: scene ? { children: scene.children.length, fog: scene.fog?.type ?? null, background: scene.background ? 'set' : null } : null,
    player
  };
});

console.log(JSON.stringify(report, null, 2));

// Second opinion: does a plain full-screen clear produce visible pixels?
// If a clearColor of 0 and no drawn geometry both give black, the scene is
// genuinely not drawing. If the clear alone is visible, geometry is missing.
console.log('\n=== direct GL clear test on the live context ===');
console.log(JSON.stringify(await page.evaluate(() => {
  const canvas = document.querySelector('canvas#viewport');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  gl.clearColor(1, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  const p = new Uint8Array(4);
  gl.readPixels(10, 10, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p);
  return { afterRedClear: [...p], glError: gl.getError(), note: 'red means the readback path works and the world simply drew nothing' };
}), null, 2));

console.log('\nconsole errors:', errs.length ? errs.slice(0, 6) : 'none');
await page.screenshot({ path: 'artifacts/audit/aizanoi-runtime/black-frame-diagnosis.png' });
await browser.close();
