// Section 15: audit Aizanoi's performance and resilience budget against the real
// runtime. Reports the renderer's own numbers rather than estimating them.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.AIZANOI_AUDIT_OUT || 'artifacts/audit/aizanoi-performance';
mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (area, detail) => {
  findings.push({ area, detail });
  console.log(`[${area}] ${detail}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

for (const device of [
  { name: 'desktop-1440x900', width: 1440, height: 900, dpr: 1 },
  { name: 'mobile-390x844', width: 390, height: 844, dpr: 2 }
]) {
  console.log(`\n===== ${device.name} (dpr ${device.dpr}) =====`);
  const context = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.dpr,
    hasTouch: device.name.startsWith('mobile')
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

  const t0 = Date.now();
  await page.goto(`${BASE}/worlds/aizanoi-225/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.locator('#btn-enter').click();
  await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, null, { timeout: 60000 });
  await page.waitForFunction(() => document.documentElement.dataset.worldReady === 'true', null, { timeout: 30000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__WORLD_DEBUG__?.player?.controlsEnabled === true, null, { timeout: 20000 });
  note(device.name, `ready after Enter in ${Date.now() - t0}ms`);

  // Scene composition: object counts, material reuse, instancing, draw calls.
  const budget = await page.evaluate(() => {
    const scene = window.__WORLD_DEBUG__.scene;
    const canvas = document.querySelector('canvas#viewport');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');

    let meshes = 0, instanced = 0, lights = 0, groups = 0, sprites = 0, lines = 0;
    const materials = new Set();
    const geometries = new Set();
    scene.traverse((o) => {
      if (o.isInstancedMesh) { instanced += 1; meshes += 1; }
      else if (o.isMesh) meshes += 1;
      else if (o.isLight) lights += 1;
      else if (o.isGroup) groups += 1;
      else if (o.isSprite) sprites += 1;
      else if (o.isLine) lines += 1;
      if (o.material) {
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m.uuid);
      }
      if (o.geometry) geometries.add(o.geometry.uuid);
    });

    return {
      scene: { meshes, instanced, lights, groups, sprites, lines },
      reuse: {
        distinctMaterials: materials.size,
        distinctGeometries: geometries.size,
        // Reuse ratio: how many meshes each material serves. High means the
        // scene is sharing instead of allocating a material per object.
        meshesPerMaterial: +(meshes / Math.max(1, materials.size)).toFixed(2),
        geometriesPerMesh: +(geometries.size / Math.max(1, meshes)).toFixed(2)
      },
      renderer: {
        drawingBuffer: { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight },
        pixels: gl.drawingBufferWidth * gl.drawingBufferHeight,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        vendor: gl.getParameter(gl.RENDERER)
      }
    };
  });
  note(device.name, 'scene=' + JSON.stringify(budget.scene));
  note(device.name, 'reuse=' + JSON.stringify(budget.reuse));
  note(device.name, 'renderer=' + JSON.stringify(budget.renderer));

  // Frame delivery over a real interval.
  const timing = await page.evaluate(() => new Promise((resolve) => {
    const samples = [];
    let last = performance.now();
    const t0 = last;
    const tick = () => {
      const now = performance.now();
      samples.push(now - last);
      last = now;
      if (now - t0 < 3000) { requestAnimationFrame(tick); } else { resolve(samples); }
    };
    requestAnimationFrame(tick);
  }));
  const sorted = [...timing].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  note(device.name, `frames=${timing.length} in 3s, p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms (software rasteriser)`);

  // Resilience: the context-loss guard must actually be installed.
  const resilience = await page.evaluate(() => {
    const canvas = document.querySelector('canvas#viewport');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    return {
      contextLost: gl.isContextLost(),
      glError: gl.getError(),
      watchdogPresent: Boolean(window.__WORLD_BOOTSTRAP__),
      worldReadyFlag: document.documentElement.dataset.worldReady ?? null
    };
  });
  note(device.name, 'resilience=' + JSON.stringify(resilience));
  note(device.name, 'console-errors=' + (errors.length ? errors.slice(0, 4).join(' | ') : 'none'));

  writeFileSync(`${OUT}/${device.name}.json`, JSON.stringify({ budget, timing: { p50, p95, frames: timing.length }, resilience, errors }, null, 2));
  await context.close();
}

writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log(`\n=== ${findings.length} findings -> ${OUT}/findings.json ===`);
await browser.close();
