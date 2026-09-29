// Section 9 audit: run the real Aizanoi world in a real browser and record what
// actually happens. This is a diagnostic harness, not a test: every viewport in
// the brief is exercised and the raw evidence is written to disk so findings are
// backed by observed state rather than source inspection.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const WORLD = `${BASE}/worlds/aizanoi-225/`;
const OUT = process.env.AIZANOI_AUDIT_OUT || 'artifacts/audit/aizanoi-runtime';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop-1440x900', width: 1440, height: 900, touch: false },
  { name: 'desktop-1280x800', width: 1280, height: 800, touch: false },
  { name: 'tablet-820x1180', width: 820, height: 1180, touch: true },
  { name: 'mobile-390x844', width: 390, height: 844, touch: true },
  { name: 'mobile-landscape-844x390', width: 844, height: 390, touch: true }
];

const findings = [];
const note = (vp, area, detail) => {
  findings.push({ viewport: vp, area, detail });
  console.log(`[${vp}] ${area}: ${detail}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

for (const vp of VIEWPORTS) {
  console.log(`\n===== ${vp.name} =====`);
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    hasTouch: vp.touch,
    isMobile: false,
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const failedRequests = [];
  const requestLog = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });
  page.on('request', (r) => requestLog.push(r.url()));

  const t0 = Date.now();
  await page.goto(WORLD, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // WebGL reality check, not a flag check (the world is lazy: it only builds
  // after Enter, so this is a probe of the page shell, not the scene)
  const gl = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { canvas: false };
    const ctx = c.getContext('webgl2') || c.getContext('webgl');
    if (!ctx) return { canvas: true, context: false };
    const dbg = ctx.getExtension('WEBGL_debug_renderer_info');
    return {
      canvas: true,
      context: true,
      version: ctx.getParameter(ctx.VERSION),
      renderer: dbg ? ctx.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER),
      size: { w: c.width, h: c.height },
      drawingBuffer: { w: ctx.drawingBufferWidth, h: ctx.drawingBufferHeight }
    };
  });
  note(vp.name, 'webgl-probe', JSON.stringify(gl));

  // --- Enter flow (section 9 explicitly requires exercising this) ---
  const enter = page.locator('#btn-enter');
  const enterVisible = await enter.isVisible().catch(() => false);
  const enterLabel = enterVisible ? (await enter.textContent().catch(() => '')).trim() : null;
  note(vp.name, 'enter-button', `visible=${enterVisible} label=${JSON.stringify(enterLabel)}`);
  if (!enterVisible) {
    note(vp.name, 'blocking', 'no Enter control: the world cannot be entered at this viewport');
    await page.screenshot({ path: `${OUT}/${vp.name}-no-enter.png` });
    await context.close();
    continue;
  }
  await enter.click();

  let ready = null;
  try {
    await page.waitForFunction(() => window.__WORLD_DEBUG__?.ready === true, { timeout: 60000 });
    ready = true;
  } catch { ready = false; }
  const loadMs = Date.now() - t0;
  note(vp.name, 'ready-after-enter', `${ready} after ${loadMs}ms`);
  if (!ready) {
    const boot = await page.evaluate(() => window.__WORLD_BOOTSTRAP__ || null);
    note(vp.name, 'bootstrap-state', JSON.stringify(boot));
  }

  if (ready) {
    const state = await page.evaluate(() => {
      const d = window.__WORLD_DEBUG__;
      const out = { keys: Object.keys(d) };
      for (const k of ['frames', 'fps', 'drawCalls', 'triangles', 'geometries', 'textures',
                       'programs', 'sceneChildren', 'colliders', 'landmarks', 'evidenceCount',
                       'audioEnabled', 'quality', 'dayPhase', 'tourActive', 'evidenceMode',
                       'controlsEnabled', 'pointerLocked', 'position', 'yaw', 'pitch']) {
        if (k in d) out[k] = d[k];
      }
      return out;
    });
    note(vp.name, 'runtime-state', JSON.stringify(state));
  }

  // Luma proof: is anything actually rendered, or a black frame?
  // Read the drawing buffer inside a rAF callback. The renderer does not
  // preserve its drawing buffer, so a drawImage copy taken after the frame is
  // presented samples a cleared buffer and reports a false black frame.
  const luma = await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) { resolve({ ok: false, reason: 'no canvas' }); return; }
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) { resolve({ ok: false, reason: 'no webgl context' }); return; }
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let sum = 0, max = 0, lit = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const v = pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722;
        sum += v; if (v > max) max = v; if (v > 3) lit += 1;
      }
      const total = pixels.length / 4;
      resolve({
        ok: true,
        mean: +(sum / total).toFixed(2),
        max: +max.toFixed(1),
        litPct: +((lit / total) * 100).toFixed(1),
        glError: gl.getError()
      });
    });
  }));
  note(vp.name, 'first-frame-luma', JSON.stringify(luma));

  await page.screenshot({ path: `${OUT}/${vp.name}-entry.png` });
  writeFileSync(`${OUT}/${vp.name}-console.json`, JSON.stringify({ consoleErrors, failedRequests }, null, 2));
  note(vp.name, 'console-errors', consoleErrors.length ? consoleErrors.slice(0, 5).join(' | ') : 'none');
  note(vp.name, 'failed-requests', failedRequests.length ? `${failedRequests.length}: ${failedRequests.slice(0, 4).join(' | ')}` : 'none');
  note(vp.name, 'request-count', String(requestLog.length));

  await context.close();
}

await browser.close();
writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log(`\n=== wrote ${findings.length} findings to ${OUT}/findings.json ===`);
