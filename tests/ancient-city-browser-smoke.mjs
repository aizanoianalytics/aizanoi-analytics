import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';
const cities = [
  { slug: 'rome-410-476', teleport: 'colosseum', arrival: /Colosseum/i },
  { slug: 'athens-450-430', teleport: 'parthenon', arrival: /Parthenon/i },
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

async function walkForward(page, milliseconds = 1000) {
  await page.keyboard.down('w');
  await page.waitForTimeout(milliseconds);
  await page.keyboard.up('w');
}

async function openCity(context, city, suffix = '') {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto(`${base}/ancient-cities/${city.slug}/${suffix}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__ANCIENT_WORLD_DEBUG__));
  if (!suffix.includes('jump=')) {
    await page.locator('#enter').click();
    await page.waitForTimeout(150);
  }
  assert.equal(await page.locator('#ancient-world-back-to-os').count(), 1, `${city.slug}: back-to-OS control missing`);
  assert.deepEqual(errors, [], `${city.slug}: browser errors: ${errors.join(' | ')}`);
  return { page, errors };
}

for (const city of cities) {
  // Field System deep links must use the city's own enter + safe teleport path.
  {
    const deepContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const opened = await openCity(deepContext, city, `?jump=${city.teleport}`);
    const deepPage = opened.page;
    await deepPage.waitForFunction(() => document.querySelector('#intro')?.classList.contains('hidden'));
    await deepPage.waitForFunction((expected) => document.querySelector('#place')?.textContent?.toLowerCase().includes(expected), city.arrival.source.replace(/\\/g,'').toLowerCase().replace(/[^a-z-]/g,''));
    assert.equal(new URL(deepPage.url()).searchParams.has('jump'), false, `${city.slug}: one-shot jump query was not consumed`);
    const deepPlayer = await player(deepPage);
    assert.ok(deepPlayer && Number.isFinite(deepPlayer.floorY), `${city.slug}: deep-link arrival produced invalid player state`);
    assert.deepEqual(opened.errors, [], `${city.slug}: deep-link browser errors: ${opened.errors.join(' | ')}`);
    await deepContext.close();
  }

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
  // Rome's enriched hero geometry is intentionally heavy under software WebGL.
  // Give SwiftShader enough wall-clock time to produce at least one simulation
  // frame while keeping the assertion about real bounded keyboard movement.
  await walkForward(page, 1000);
  const afterTeleportWalk = await player(page);
  const teleportWalkDistance = Math.hypot(afterTeleportWalk.x - afterTeleport.x, afterTeleportWalk.z - afterTeleport.z);
  assert.ok(teleportWalkDistance > 0.1 && teleportWalkDistance < 8, `${city.slug}: desktop WASD after teleport is unstable (${teleportWalkDistance})`);
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
  await mobilePage.waitForTimeout(1000);
  await mobilePage.dispatchEvent('#movePad', 'pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: cx, clientY: cy - pad.height * 0.30 });
  const mobileAfter = await player(mobilePage);
  const mobileDistance = Math.hypot(mobileAfter.x - mobileBefore.x, mobileAfter.z - mobileBefore.z);
  assert.ok(mobileDistance > 0.08 && mobileDistance < 10, `${city.slug}: mobile movement is unstable (${mobileDistance})`);
  assert.deepEqual(opened.errors, [], `${city.slug}: mobile browser errors: ${opened.errors.join(' | ')}`);
  await mobile.close();
}

// Aizanoi uses different public controls (#enterBtn/#teleport) but the same shared
// navigation bridge must still consume a one-shot OS landmark command.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`${base}/historic-world/?jump=temple`, { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.__AIZANOI_DEBUG__), null, { timeout:12000 });
  await page.waitForFunction(() => document.querySelector('#hud') && !document.querySelector('#hud').classList.contains('hidden'), null, { timeout:12000 });
  await page.waitForFunction(() => /Temple of Zeus/i.test(document.querySelector('#locName')?.textContent || ''), null, { timeout:12000 });
  assert.equal(new URL(page.url()).searchParams.has('jump'), false, 'Aizanoi: one-shot jump query was not consumed');
  const state = await page.evaluate(() => window.__AIZANOI_DEBUG__?.player);
  assert.ok(state && Number.isFinite(state.floorY), 'Aizanoi: deep-link arrival produced invalid player state');
  assert.deepEqual(errors, [], `Aizanoi deep-link browser errors: ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
console.log('Ancient city desktop/mobile/deep-link browser smoke passed');
