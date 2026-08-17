import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const requested = new Set(process.argv.slice(2));
const runDesktop = requested.size === 0 || requested.has('desktop');
const runInput = requested.size === 0 || requested.has('input');
const runMobile = requested.size === 0 || requested.has('mobile');
if (!runDesktop && !runInput && !runMobile) throw new Error('Pass desktop, input and/or mobile to browser-smoke.mjs.');

const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(repoRoot, `.${decoded}`);
  if (candidate !== repoRoot && !candidate.startsWith(`${repoRoot}${sep}`)) return null;
  return candidate;
}

const server = createServer(async (request, response) => {
  try {
    let path = safePath(request.url || '/');
    if (!path) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    let info = await stat(path);
    if (info.isDirectory()) {
      path = resolve(path, 'index.html');
      info = await stat(path);
    }
    if (!info.isFile()) throw new Error('Not a file');
    const body = await readFile(path);
    response.writeHead(200, {
      'content-type': mime.get(extname(path).toLowerCase()) || 'application/octet-stream',
      'cache-control': 'no-store',
    });
    response.end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
});

await new Promise((resolveReady, rejectReady) => {
  server.once('error', rejectReady);
  server.listen(0, '127.0.0.1', resolveReady);
});

const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const url = `${origin}/experiments/threejs-rome-renderer/`;
let browser;

function watchPage(page, label) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(`${label} pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`${label} console: ${message.text()}`);
  });
  return errors;
}

async function waitForPoc(page) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__ROME_THREE_POC__), null, { timeout: 30_000 });
  await page.waitForFunction(() => window.__ROME_THREE_POC__.renderer.info.render.triangles > 0, null, { timeout: 15_000 });
}

async function desktopSmoke(page) {
  const errors = watchPage(page, 'desktop');
  await waitForPoc(page);

  const baseline = await page.evaluate(() => {
    const api = window.__ROME_THREE_POC__;
    return {
      triangles: api.renderer.info.render.triangles,
      calls: api.renderer.info.render.calls,
      canvasCount: document.querySelectorAll('canvas').length,
      player: { x: api.simulation.player.x, y: api.simulation.player.y, z: api.simulation.player.z },
      target: api.contract.teleportTargets.find((item) => item.monumentId === 'colosseum') || api.contract.teleportTargets[0],
    };
  });

  assert.ok(baseline.triangles > 0, 'desktop renderer should draw triangles');
  assert.ok(baseline.calls > 0, 'desktop renderer should issue draw calls');
  assert.equal(baseline.canvasCount, 1, 'desktop PoC should own one renderer canvas');
  assert.ok(baseline.target?.id, 'desktop PoC should expose at least one teleport target');

  const teleported = await page.evaluate((targetId) => {
    const api = window.__ROME_THREE_POC__;
    const ok = api.controls.teleportTarget(targetId);
    return {
      ok,
      x: api.simulation.player.x,
      y: api.simulation.player.y,
      z: api.simulation.player.z,
      floorY: api.simulation.player.floorY,
    };
  }, baseline.target.id);
  assert.equal(teleported.ok, true, 'desktop teleport should succeed');
  assert.ok(Math.hypot(teleported.x - baseline.player.x, teleported.z - baseline.player.z) > 20, 'desktop teleport should move the player');
  assert.ok(Math.abs(teleported.y - (teleported.floorY + 1.68)) < 0.02, 'desktop teleport should preserve eye height above support');

  await page.evaluate(() => window.__ROME_THREE_POC__.destroy());
  await page.waitForFunction(() => document.querySelectorAll('canvas').length === 0);
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`Desktop smoke passed · ${baseline.triangles} triangles · ${baseline.calls} calls`);
}

async function inputSmoke(page) {
  const errors = watchPage(page, 'input');
  await waitForPoc(page);

  const canvas = page.locator('canvas').first();
  await canvas.click({ position: { x: 320, y: 260 } });
  await page.waitForFunction(() => document.pointerLockElement === window.__ROME_THREE_POC__.renderer.domElement, null, { timeout: 10_000 });

  const locked = await page.evaluate(() => document.pointerLockElement === window.__ROME_THREE_POC__.renderer.domElement);
  assert.equal(locked, true, 'trusted canvas click should acquire pointer lock');

  await page.keyboard.down('w');
  await page.waitForFunction(() => window.__ROME_THREE_POC__.controls.keys.has('KeyW'));
  const heldBeforeBlur = await page.evaluate(() => window.__ROME_THREE_POC__.controls.keys.has('KeyW'));
  assert.equal(heldBeforeBlur, true, 'desktop keyboard input should reach the shared key state');

  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const heldAfterBlur = await page.evaluate(() => window.__ROME_THREE_POC__.controls.keys.size);
  assert.equal(heldAfterBlur, 0, 'focus loss should clear all movement keys');
  await page.keyboard.up('w');

  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement == null);
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log('Desktop input smoke passed · pointer lock acquired · blur reset movement state.');
}

async function mobileSmoke(page) {
  const errors = watchPage(page, 'mobile');
  await waitForPoc(page);

  const touchVisible = await page.locator('.touchControls').evaluate((element) => getComputedStyle(element).display !== 'none');
  assert.equal(touchVisible, true, 'mobile controls should be visible');

  const beforeMove = await page.evaluate(() => ({
    x: window.__ROME_THREE_POC__.simulation.player.x,
    z: window.__ROME_THREE_POC__.simulation.player.z,
    yaw: window.__ROME_THREE_POC__.simulation.player.yaw,
  }));

  const forward = page.locator('[data-move="KeyW"]');
  await forward.dispatchEvent('pointerdown', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 70, clientY: 700 });
  await page.waitForTimeout(260);
  await forward.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 70, clientY: 700 });

  const lookPad = page.locator('#lookPad');
  await lookPad.dispatchEvent('pointerdown', { pointerId: 8, pointerType: 'touch', isPrimary: true, clientX: 300, clientY: 650 });
  await lookPad.dispatchEvent('pointermove', { pointerId: 8, pointerType: 'touch', isPrimary: true, clientX: 345, clientY: 625 });
  await lookPad.dispatchEvent('pointerup', { pointerId: 8, pointerType: 'touch', isPrimary: true, clientX: 345, clientY: 625 });

  const afterMove = await page.evaluate(() => ({
    x: window.__ROME_THREE_POC__.simulation.player.x,
    z: window.__ROME_THREE_POC__.simulation.player.z,
    yaw: window.__ROME_THREE_POC__.simulation.player.yaw,
    tier: window.__ROME_THREE_POC__.quality.snapshot().tier,
  }));

  assert.ok(Math.hypot(afterMove.x - beforeMove.x, afterMove.z - beforeMove.z) > 0.15, 'mobile D-pad should move the player');
  assert.notEqual(afterMove.yaw, beforeMove.yaw, 'mobile look pad should change yaw');
  assert.ok(['high', 'balanced', 'low'].includes(afterMove.tier), 'mobile adaptive quality tier should remain valid');
  assert.deepEqual(errors, [], errors.join('\n'));
  console.log(`Mobile smoke passed · quality tier ${afterMove.tier}`);
}

try {
  browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });

  if (runDesktop) {
    const desktop = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await desktopSmoke(await desktop.newPage());
    await desktop.close();
  }

  if (runInput) {
    const input = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await inputSmoke(await input.newPage());
    await input.close();
  }

  if (runMobile) {
    const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await mobileSmoke(await mobile.newPage());
    await mobile.close();
  }

  console.log(`Rome Three.js browser smoke passed: ${[runDesktop && 'desktop', runInput && 'input', runMobile && 'mobile'].filter(Boolean).join(' + ')}.`);
} finally {
  await browser?.close();
  await new Promise((resolveClosed) => server.close(resolveClosed));
}
