// Browser proof that the 3D dungeon is a real playable game, not a facade.
//
// The static suites assert on source shape. This suite drives the actual
// route in a real browser: it boots the Three.js scene, starts a run with a
// trusted click, proves the render loop advances, proves the framebuffer
// actually contains a lit scene (readPixels, not a screenshot), proves the
// player moves on real keyboard input, and proves a real attack lands.
import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.ANCIENT_WORLD_BASE_URL || 'http://127.0.0.1:4173';

// SwiftShader is the software rasteriser available in CI; without it the
// WebGL2 context is unavailable and the scene correctly shows its repair card.
const LAUNCH_ARGS = [
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--no-sandbox',
  '--disable-dev-shm-usage',
];

const readFrameStats = (page) => page.evaluate(async () => {
  // Drive real animation frames the way the browser does, then read the
  // drawing buffer back. A screenshot cannot prove this: with
  // preserveDrawingBuffer off, a copied canvas is already blank.
  await new Promise((resolve) => {
    let n = 0;
    const tick = () => { n += 1; if (n < 24) requestAnimationFrame(tick); else resolve(); };
    requestAnimationFrame(tick);
  });
  const canvas = document.querySelector('canvas');
  if (!canvas) return { error: 'no canvas element' };
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
  if (!gl) return { error: 'no webgl context' };
  const w = gl.drawingBufferWidth;
  const h = gl.drawingBufferHeight;
  const px = new Uint8Array(w * h * 4);
  gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, max = 0, nonBlack = 0, samples = 0;
  const buckets = new Set();
  for (let i = 0; i < px.length; i += 4 * 17) {
    const lum = px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722;
    sum += lum; samples += 1;
    if (lum > max) max = lum;
    if (lum > 8) nonBlack += 1;
    buckets.add(`${px[i] >> 4},${px[i + 1] >> 4},${px[i + 2] >> 4}`);
  }
  return {
    width: w, height: h,
    meanLum: +(sum / samples).toFixed(2),
    maxLum: +max.toFixed(1),
    nonBlackPct: +((100 * nonBlack) / samples).toFixed(1),
    distinctColorBuckets: buckets.size,
    glError: gl.getError(),
    contextLost: gl.isContextLost(),
  };
});

test('the 3D dungeon boots a real Three.js scene and plays a real run', async () => {
  const browser = await chromium.launch({ headless: true, args: LAUNCH_ARGS });
  const context = await browser.newContext({
    viewport: { width: 1024, height: 640 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const badResponses = [];
  page.on('response', (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  try {
    await page.goto(`${base}/dungeon/?qa=${Date.now()}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.az-dungeon-begin', { timeout: 30000 });

    // The menu must offer a real start, and the scene must already be live.
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.frames > 0, null, { timeout: 30000 });
    const menu = await page.evaluate(() => ({
      state: window.AIZANOI_DUNGEON_GAME.state,
      frames: window.AIZANOI_DUNGEON_GAME.frames,
      canvas: !!document.querySelector('canvas'),
      repairCard: !!document.querySelector('.aizanoi-dungeon3d-card'),
    }));
    assert.equal(menu.state, 'menu', 'the route must boot into the title menu');
    assert.equal(menu.repairCard, false, 'the scene must not show the repair card');
    assert.equal(menu.canvas, true, 'the Three.js canvas must exist');

    // Start a run with a real trusted click, never evaluate(el.click()).
    await page.locator('.az-dungeon-begin').click();
    await page.waitForFunction(() => window.AIZANOI_DUNGEON_GAME?.state === 'playing', null, { timeout: 15000 });

    const started = await page.evaluate(() => ({
      chapter: window.AIZANOI_DUNGEON_GAME.chapter,
      enemyCount: window.AIZANOI_DUNGEON_GAME.enemyCount,
      hp: window.AIZANOI_DUNGEON_GAME.hp,
      player: window.AIZANOI_DUNGEON_GAME.player,
    }));
    assert.equal(started.chapter, 1, 'a run must start at chapter 1');
    assert.ok(started.enemyCount > 0, 'a run must spawn enemies');
    assert.ok(started.hp > 0, 'the player must start alive');

    // The render loop must actually advance while playing.
    const framesBefore = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.frames);
    await page.waitForTimeout(1200);
    const framesAfter = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.frames);
    assert.ok(framesAfter > framesBefore,
      `the render loop must advance while playing (${framesBefore} -> ${framesAfter})`);

    // The framebuffer must contain a lit, shaded scene — not a black frame.
    const frame = await readFrameStats(page);
    assert.ok(!frame.error, `the framebuffer must be readable: ${frame.error}`);
    assert.equal(frame.contextLost, false, 'the WebGL context must stay alive');
    assert.equal(frame.glError, 0, 'the WebGL context must have no pending error');
    assert.ok(frame.meanLum > 12,
      `the scene must render lit pixels, mean luminance was ${frame.meanLum}`);
    assert.ok(frame.nonBlackPct > 50,
      `most of the frame must be drawn, was ${frame.nonBlackPct}%`);
    assert.ok(frame.distinctColorBuckets > 8,
      `the frame must contain shading, only ${frame.distinctColorBuckets} colour buckets`);

    // Real keyboard input must move the player.
    const before = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.player);
    await page.keyboard.down('w');
    await page.waitForTimeout(900);
    await page.keyboard.up('w');
    const after = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.player);
    const moved = Math.abs(after.x - before.x) + Math.abs(after.z - before.z);
    assert.ok(moved > 0.2, `holding W must move the player, moved ${moved.toFixed(3)}`);

    // A real attack must resolve against a real enemy.
    const beforeHp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.map((e) => e.hp));
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await page.keyboard.press('j');
      await page.waitForTimeout(220);
      const hit = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.map((e) => e.hp));
      if (hit.some((hp, i) => hp < beforeHp[i])) return;
    }
    const afterHp = await page.evaluate(() => window.AIZANOI_DUNGEON_GAME.enemyHp.map((e) => e.hp));
    assert.ok(afterHp.some((hp, i) => hp < beforeHp[i]),
      `attacking must damage an enemy, before ${beforeHp} after ${afterHp}`);

    assert.deepEqual(badResponses, [], 'every dungeon asset must load without a 4xx/5xx');
    assert.deepEqual(errors, [], 'the run must produce no console or page errors');
  } finally {
    await browser.close();
  }
});
