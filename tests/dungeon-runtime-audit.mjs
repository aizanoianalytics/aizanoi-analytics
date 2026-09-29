// Section 16: audit the actual game in a real browser. Boot the standalone
// Dungeon route, start a run, exercise combat and traversal through the real
// game loop, and record what happens with its own state as evidence.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const URL_DUNGEON = `${BASE}/dungeon/`;
const OUT = process.env.AIZANOI_AUDIT_OUT || 'artifacts/audit/dungeon';
mkdirSync(OUT, { recursive: true });

const findings = [];
const note = (area, detail) => {
  findings.push({ area, detail });
  console.log(`[${area}] ${detail}`);
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

const errors = [];
const failed = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });

const t0 = Date.now();
await page.goto(URL_DUNGEON, { waitUntil: 'domcontentloaded', timeout: 60000 });
note('boot', `DOM ready in ${Date.now() - t0}ms`);

// Phaser is a global; wait for the game to actually build a canvas.
let canvasOk = false;
try {
  await page.waitForFunction(
    () => document.querySelector('#game-container canvas') !== null,
    null,
    { timeout: 45000 }
  );
  canvasOk = true;
} catch { canvasOk = false; }
note('canvas', `game canvas present: ${canvasOk}`);
await page.screenshot({ path: `${OUT}/01-boot.png` });

// What debug surface does the game expose? This is the traversal hook the brief
// asks for: without one, covering 10 chapters by hand is not tractable.
const surface = await page.evaluate(() => {
  const g = window.AIZANOI_DUNGEON_GAME;
  const keys = window.__AIZANOI_DUNGEON_SCENE ? Object.keys(window.__AIZANOI_DUNGEON_SCENE).slice(0, 30) : null;
  return {
    hasGame: Boolean(window.AIZANOI_DUNGEON_GAME),
    gameKeys: window.game ? Object.keys(window.game).slice(0, 40) : null,
    sceneKeys: window.AIZANOI_DUNGEON_GAME?.scene ? window.AIZANOI_DUNGEON_GAME.scene.scenes.map((s) => s.constructor?.name ?? 'anonymous') : null,
    activeScenes: window.AIZANOI_DUNGEON_GAME?.scene?.getScenes?.(true)?.map((s) => s.constructor?.name ?? 'anonymous') ?? null,
    sceneHandle: keys,
    phaserVersion: window.Phaser?.VERSION ?? null,
    canvasSize: (() => {
      const c = document.querySelector('#game-container canvas');
      return c ? { w: c.width, h: c.height, cssW: c.clientWidth, cssH: c.clientHeight } : null;
    })()
  };
});
note('surface', JSON.stringify(surface));
writeFileSync(`${OUT}/surface.json`, JSON.stringify(surface, null, 2));

// The frame must actually contain the game, not an empty container.
const frame = await page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => {
    const canvas = document.querySelector('#game-container canvas');
    if (!canvas) { resolve({ error: 'no canvas' }); return; }
    // Phaser 3 renders into a 2D context on this route, so drawImage is valid.
    const off = document.createElement('canvas');
    off.width = 160; off.height = 90;
    const ctx = off.getContext('2d');
    ctx.drawImage(canvas, 0, 0, off.width, off.height);
    const { data } = ctx.getImageData(0, 0, off.width, off.height);
    let sum = 0, max = 0, lit = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      sum += v; if (v > max) max = v; if (v > 8) lit += 1;
    }
    const total = data.length / 4;
    resolve({ mean: +(sum / total).toFixed(2), max: +max.toFixed(1), litPct: +((lit / total) * 100).toFixed(1) });
  });
}));
note('first-frame', JSON.stringify(frame));

// Drive the menu with real input, and record how far the player gets.
const canvasBox = await page.locator('#game-container canvas').boundingBox().catch(() => null);
if (canvasBox) {
  const cx = canvasBox.x + canvasBox.width / 2;
  const cy = canvasBox.y + canvasBox.height / 2;
  await page.mouse.click(cx, cy);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/02-after-click.png` });
  // Keyboard is how a Phaser game receives input; try the common start keys.
  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(700);
  }
  await page.screenshot({ path: `${OUT}/03-after-start-keys.png` });
  note('input', `clicked canvas centre and pressed Enter/Space`);
}

const afterInput = await page.evaluate(() => {
  const g = window.AIZANOI_DUNGEON_GAME;
  return {
    activeScenes: g?.scene?.getScenes?.(true)?.map((s) => s.constructor?.name ?? 'anonymous') ?? null,
    sceneHandle: Boolean(window.__AIZANOI_DUNGEON_SCENE),
  };
});
note('after-input', JSON.stringify(afterInput));
note('console-errors', errors.length ? errors.slice(0, 6).join(' | ') : 'none');
note('failed-requests', failed.length ? failed.slice(0, 6).join(' | ') : 'none');

writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log(`\n=== ${findings.length} findings -> ${OUT}/findings.json ===`);
await browser.close();
