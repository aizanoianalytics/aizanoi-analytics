import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const cities = [
  { slug: 'rome-410-476', teleport: 'colosseum' },
  { slug: 'athens-450-430', teleport: 'parthenon' },
];

const browser = await chromium.launch({
  headless: true,
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-gpu-sandbox',
  ],
});

async function player(page) {
  return page.evaluate(() => window.__ANCIENT_WORLD_DEBUG__?.player);
}

async function walkForward(page, milliseconds = 320) {
  await page.keyboard.down('w');
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up('w');
}

async function openCity(context, city) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${base}/ancient-cities/${city.slug}/`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__));
  await page.locator('#enter').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('#ancient-world-back-to-os').count(), 1, `${city.slug}: back-to-OS control missing`);
  assert.deepEqual(errors, [], `${city.slug}: browser errors: ${errors.join(' | ')}`);
  return { page, errors };
}

for (const city of cities) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const { page, errors } = await openCity(context, city);
  const initial = await player(page);
  assert.ok(initial && Number.isFinite(initial.x) && Number.isFinite(initial.floorY), `${city.slug}: invalid initial player state`);
  assert.ok(Math.abs(initial.y - (initial.floorY + 1.68)) < 0.2, `${city.slug}: eye height is not human-scale`);

  // Enter requests pointer lock on desktop. Explicitly release it so the fallback
  // drag path can be exercised using Playwright's real mouse input rather than a
  // synthetic pointer id that cannot participate in browser pointer capture.
  await page.evaluate(() => document.exitPointerLock?.());
  await page.waitForFunction(() => document.pointerLockElement === null);
  const canvas = await page.locator('#glCanvas').boundingBox();
  assert.ok(canvas, `${city.slug}: desktop canvas has no layout box`);
  const mouseBefore = await player(page);
  const mx = canvas.x + canvas.width * 0.62;
  const my = canvas.y + canvas.height * 0.48;
  await page.mouse.move(mx, my);
  await page.mouse.down({ button: 'left' });
  await page.mouse.move(mx + 64, my, { steps: 4 });
  await page.mouse.up({ button: 'left' });
  const mouseAfter = await player(page);
  assert.ok(mouseAfter.yaw > mouseBefore.yaw + 0.05, `${city.slug}: dragging mouse right did not turn view right (${mouseBefore.yaw} -> ${mouseAfter.yaw})`);

  const teleported = await page.evaluate((id) => window.__ANCIENT_WORLD_DEBUG__.teleport(id), city.teleport);
  assert.equal(teleported, true, `${city.slug}: teleport failed`);
  const afterTeleport = await player(page);
  assert.ok(Math.abs(afterTeleport.y - (afterTeleport.floorY + 1.68)) < 0.2, `${city.slug}: teleport broke support/eye height`);
  await walkForward(page, 320);
  const afterTeleportWalk = await player(page);
  const teleportWalkDistance = Math.hypot(afterTeleportWalk.x - afterTeleport.x, afterTeleportWalk.z - afterTeleport.z);
  assert.ok(teleportWalkDistance > 0.25 && teleportWalkDistance < 8, `${city.slug}: desktop WASD after teleport is unstable (${teleportWalkDistance})`);
  assert.deepEqual(errors, [], `${city.slug}: desktop browser errors: ${errors.join(' | ')}`);
  await context.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const opened = await openCity(mobile, city);
  const mobilePage = opened.page;
  await mobilePage.waitForFunction(() => getComputedStyle(document.querySelector('#mobileControls')).display !== 'none');
  const pad = await mobilePage.locator('#movePad').boundingBox();
  assert.ok(pad, `${city.slug}: joystick has no layout box`);
  const mobileBefore = await player(mobilePage);
  const cx = pad.x + pad.width / 2;
  const cy = pad.y + pad.height / 2;
  await mobilePage.dispatchEvent('#movePad', 'pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy });
  await mobilePage.dispatchEvent('#movePad', 'pointermove', { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy - pad.height * 0.30 });
  await mobilePage.waitForTimeout(360);
  await mobilePage.dispatchEvent('#movePad', 'pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy - pad.height * 0.30 });
  const mobileWalked = await player(mobilePage);
  assert.ok(Math.hypot(mobileWalked.x - mobileBefore.x, mobileWalked.z - mobileBefore.z) > 0.2, `${city.slug}: analog joystick did not move`);

  const mobileCanvas = await mobilePage.locator('#glCanvas').boundingBox();
  assert.ok(mobileCanvas, `${city.slug}: canvas has no layout box`);
  const yawBefore = mobileWalked.yaw;
  const lx = mobileCanvas.x + mobileCanvas.width * 0.72;
  const ly = mobileCanvas.y + mobileCanvas.height * 0.52;
  await mobilePage.dispatchEvent('#glCanvas', 'pointerdown', { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: lx, clientY: ly });
  await mobilePage.dispatchEvent('#glCanvas', 'pointermove', { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: lx + 48, clientY: ly + 8 });
  await mobilePage.dispatchEvent('#glCanvas', 'pointerup', { pointerId: 12, pointerType: 'touch', isPrimary: true, clientX: lx + 48, clientY: ly + 8 });
  const looked = await player(mobilePage);
  assert.ok(Math.abs(looked.yaw - yawBefore) > 0.03, `${city.slug}: right-side drag look did not rotate camera`);

  await mobilePage.dispatchEvent('#mobileRun', 'pointerdown', { pointerId: 13, pointerType: 'touch', isPrimary: true });
  assert.equal(await mobilePage.locator('#mobileRun').evaluate((el) => el.classList.contains('primaryTouch')), true, `${city.slug}: run button did not engage`);
  await mobilePage.dispatchEvent('#mobileRun', 'pointerup', { pointerId: 13, pointerType: 'touch', isPrimary: true });
  assert.deepEqual(opened.errors, [], `${city.slug}: mobile browser errors: ${opened.errors.join(' | ')}`);
  await mobile.close();
}

await browser.close();
console.log('Ancient city desktop + mobile browser smoke passed');
