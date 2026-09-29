// Is the Aizanoi render loop actually running, and is the black frame a
// software-rendering artefact or a real product bug? Measures frame delivery
// over time, checks the quality manager, and compares against a tiny synthetic
// scene rendered in the same page to establish this machine's ceiling.
import { chromium } from 'playwright';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/worlds/aizanoi-225/`, { waitUntil: 'domcontentloaded' });
await page.locator('#btn-enter').click();
await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, { timeout: 60000 });
await page.evaluate(() => window.__WORLD_DEBUG__.start?.());

// 1) Baseline: what does a trivial scene cost on this machine at all?
console.log('=== machine ceiling: trivial 1-cube scene, same context ===');
console.log(JSON.stringify(await page.evaluate(async () => {
  const THREE = window.__AIZANOI_THREE__;
  if (!THREE) return { note: 'THREE not exposed on window; ceiling test skipped' };
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 675;
  const r = new THREE.WebGLRenderer({ canvas: c });
  r.setSize(1080, 675, false);
  const sc = new THREE.Scene();
  sc.background = new THREE.Color(0x224466);
  const cam = new THREE.PerspectiveCamera(60, 1080 / 675, 0.1, 100);
  cam.position.z = 4;
  sc.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff8800 })));
  let frames = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < 1500) { r.render(sc, cam); frames += 1; }
  const gl = r.getContext();
  const px = new Uint8Array(4 * 16);
  gl.readPixels(540, 337, 4, 4, gl.RGBA, gl.UNSIGNED_BYTE, px);
  return { trivialFramesIn1_5s: frames, samplePixel: [...px.slice(0, 4)], glError: gl.getError() };
}), null, 2));

// 2) Does the world's own loop deliver frames, and what do metrics say?
console.log('\n=== Aizanoi loop delivery + quality state ===');
const probe = await page.evaluate(async () => {
  const d = window.__WORLD_DEBUG__;
  const samples = [];
  const t0 = performance.now();
  let last = null;
  return await new Promise((resolve) => {
    const tick = () => {
      const now = performance.now();
      samples.push({ t: Math.round(now - t0), m: d.metrics ? { ...d.metrics } : null });
      if (now - t0 < 5000) {
        setTimeout(tick, 500);
      } else {
        resolve({ samples, finalMetrics: d.metrics ? { ...d.metrics } : null });
      }
    };
    tick();
  });
});
console.log(JSON.stringify(probe, null, 2));

// 3) Force a single manual render + readback: does the scene draw at all?
console.log('\n=== forced single render of the real scene ===');
console.log(JSON.stringify(await page.evaluate(() => {
  const d = window.__WORLD_DEBUG__;
  const s = d.scene;
  if (!s) return { note: 'no scene' };
  // Find the renderer's context via any canvas in the document
  const c = document.querySelector('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) return { note: 'no gl' };
  const before = (() => { const p = new Uint8Array(4); gl.readPixels(540, 337, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, p); return [...p]; })();
  return {
    pixelBefore: before,
    sceneChildren: s.children.length,
    hasBackground: s.background !== null,
    hasFog: s.fog !== null,
    // camera visibility: is the hero temple actually in front of the camera?
    note: 'a non-null background would have painted the buffer even with no meshes'
  };
}), null, 2));

await browser.close();
