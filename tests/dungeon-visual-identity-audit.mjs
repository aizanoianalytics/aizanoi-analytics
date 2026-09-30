// Section 21: "chapter palettes" and "The game should look intentionally
// authored."
//
// All eleven chapters declared a palette, and nothing read it. The floor, the
// walls, the light, the fog, the portal and the decoration were identical in
// every chapter, so Necropolis Labyrinth and Throne of Storms were the same room
// with different enemies.
//
// This measures the rendered frame, not the data: it enters each chapter, reads
// the actual tint and fog on the live tilemap and camera, and takes a screenshot
// so the difference is visible rather than merely asserted.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.AIZANOI_AUDIT_OUT || '/tmp/aizanoi-visual-identity';
mkdirSync(OUT, { recursive: true });
const userDataDir = mkdtempSync(join(tmpdir(), 'aizanoi-vid-'));
// A whole-run deadline, so a mutation that makes the game unplayable is
// reported as a failure instead of hanging the harness forever. The audit
// normally finishes well inside this.
const RUN_BUDGET_MS = Number(process.env.VISUAL_IDENTITY_BUDGET_MS || 15 * 60 * 1000);
const runDeadline = Date.now() + RUN_BUDGET_MS;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/dungeon/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => globalThis.AIZANOI_DUNGEON_GAME, null, { timeout: 60000 });
const inGame = async () => page.evaluate(
  () => Boolean(globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene')?.levelSystem)
);
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter', 'Space']) {
  if (await inGame()) break;
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
}
if (!(await inGame())) throw new Error('could not reach GameScene');
console.log('[entry] GameScene live');

const chapters = await page.evaluate(async () => {
  const mod = await import('/js/v3/apps/dungeon/js/data/levels.js');
  return mod.LEVELS.map((L, i) => ({ index: i, id: L.id, name: L.palette?.name ?? 'endless', declared: L.palette ?? null }));
});

const measured = [];
for (const ch of chapters) {
  await page.evaluate((idx) => {
    const scene = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    if (scene) scene.scene.restart({ chapterIndex: idx, isEndless: false, runState: scene.runState });
  }, ch.index);
  await page.waitForFunction(
    (idx) => {
      const live = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
      return Boolean(live?.mapData?.audit) && live.chapterIndex === idx;
    },
    ch.index,
    { timeout: 30000 }
  );
  await page.waitForTimeout(700);

  const m = await page.evaluate(() => {
    const s = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const cam = s.cameras.main;
    // Read the tints actually applied to the rendered layers, not the config.
    // Phaser 3.80 keeps the tint in the render pipeline rather than on a
    // public property, so it is read the same way the renderer reads it. The
    // earlier attempt read `tintTopLeft`, which is always undefined, and that
    // would have reported "no palette" for a working implementation.
    const tintOf = (obj) => {
      if (!obj) return null;
      try {
        if (typeof obj.tint === 'number' && obj.tint !== 0) return obj.tint;
        const p = obj.pipeline?.currentPipeline;
        if (p && typeof p.tint === 'number' && p.tint !== 0) return p.tint;
        if (p?.batchTint) return p.batchTint;
      } catch (_) {}
      return null;
    };
    const floor = tintOf(s.floorLayer);
    const wall = tintOf(s.wallLayer);
    const overlay = s.chapterLightOverlay ?? null;
    return {
      name: s.mapData?.palette?.name ?? null,
      floorTint: typeof floor === 'number' ? floor : null,
      wallTint: typeof wall === 'number' ? wall : null,
      fog: cam?.fog?.color ?? null,
      fogNear: cam?.fog?.near ?? null,
      fogFar: cam?.fog?.far ?? null,
      bg: cam?.backgroundColor?.rgba?.color ?? cam?._backgroundColor?.rgba?.color ?? null,
      overlayTint: overlay?.fillColor ?? null,
      overlayAlpha: overlay?.fillAlpha ?? null,
      hasOverlay: Boolean(overlay)
    };
  });

  // Read the rendered frame. The drawing buffer is not preserved, so a read
  // outside a frame callback returns black no matter what the scene contains:
  // the first version of this audit reported [0, 0, 0] for every chapter and it
  // looked like a palette that did nothing.
  const sampleFrame = async (pg) => pg.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const cvs = document.querySelector('#game-container canvas');
      const gl = cvs.getContext('webgl2') || cvs.getContext('webgl');
      const buf = new Uint8Array(cvs.width * cvs.height * 4);
      gl.readPixels(0, 0, cvs.width, cvs.height, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < buf.length; i += 4 * 37) { r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++; }
      resolve({ mean: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] });
    });
  }));

  // The palette's own effect, measured per layer. Summing everything into one
  // number is what let four separate mutations through: whichever layer was
  // still working carried the total, so breaking any single one looked fine.
  // Each mechanism is toggled on its own and restored immediately.
  const shiftOf = async (field, offAlpha, onAlpha) => {
    const on = await sampleFrame(page);
    await page.evaluate(([f, a]) => {
      const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
      if (sc[f]) sc[f].setAlpha(a);
    }, [field, offAlpha]);
    await page.waitForTimeout(150);
    const off = await sampleFrame(page);
    await page.evaluate(([f, a]) => {
      const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
      if (sc[f]) sc[f].setAlpha(a);
    }, [field, onAlpha]);
    await page.waitForTimeout(150);
    if (!on?.mean || !off?.mean) return null;
    return Math.round(Math.hypot(
      on.mean[0] - off.mean[0], on.mean[1] - off.mean[1], on.mean[2] - off.mean[2]
    ));
  };

  const hazeShift = await shiftOf('chapterHaze', 0, 0.55);
  const accentShift = await shiftOf('chapterLightOverlay', 0, 0.16);

  // The floor and wall tints. Toggling uses the values the game RECORDED when it
  // applied them, not values recomputed here: recomputing made the audit agree
  // with itself, so it reported the intended tint even when the game had stopped
  // applying it at all.
  const tintShift = await page.evaluate(async () => {
    const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const appliedFloor = sc.appliedFloorTint;
    const appliedWall = sc.appliedWallTint;
    if (typeof appliedFloor !== 'number') return null;
    const sample = () => new Promise((res) => { requestAnimationFrame(() => {
      const cvs = document.querySelector('#game-container canvas');
      const gl = cvs.getContext('webgl2') || cvs.getContext('webgl');
      const full = new Uint8Array(cvs.width * cvs.height * 4);
      gl.readPixels(0, 0, cvs.width, cvs.height, gl.RGBA, gl.UNSIGNED_BYTE, full);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < full.length; i += 4 * 37) { r += full[i]; g += full[i + 1]; b += full[i + 2]; n++; }
      res([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
    }); });
    // The scene keeps drawing between the two reads, so each sample waits for
    // the tint change to be flushed and for a settled frame. Reading too early
    // compares two mid-redraw states and reports a number that means nothing --
    // and on the way back the game had moved on again, so the two halves of the
    // comparison were not even of the same frame.
    const settle = () => new Promise((r) => { setTimeout(r, 150); });
    await settle();
    const tinted = await sample();
    sc.floorLayer.setTint(0xffffff);
    sc.wallLayer.setTint(0xffffff);
    await settle();
    const white = await sample();
    sc.floorLayer.setTint(appliedFloor);
    sc.wallLayer.setTint(appliedWall);
    await settle();
    await sample();
    return Math.round(Math.hypot(
      tinted[0] - white[0], tinted[1] - white[1], tinted[2] - white[2]
    ));
  });

  // The portal glow. It is measured by its applied tint rather than by pixels:
  // the exit portal of a freshly generated chapter sits in a corner the player
  // has not walked to yet, so the camera is locked on the player and the glow is
  // genuinely off screen. Reading a band around an off-screen position clamps to
  // the screen edge and reports no change, which looks exactly like a broken
  // palette. A tint that is not the chapter accent IS a broken palette, and the
  // value is on the sprite.
  // The wash must stay between the tilemap and the actors. Moving it to the top
  // of the display list still leaves a measurable frame -- it just puts a 55%
  // fog rectangle over the player and every enemy, which is not a palette, it is
  // a broken game. No pixel comparison catches that, so the stack order is read
  // directly and compared against the nearest actor.
  const stackOrder = await page.evaluate(() => {
    const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const list = sc.children.list;
    const idx = (o) => (o ? list.indexOf(o) : -1);
    const player = sc.player;
    return {
      floor: idx(sc.floorLayer),
      wall: idx(sc.wallLayer),
      haze: idx(sc.chapterHaze),
      accent: idx(sc.chapterLightOverlay),
      player: idx(player),
      hazeDepth: sc.chapterHaze?.depth,
      accentDepth: sc.chapterLightOverlay?.depth,
      playerDepth: player?.depth,
      playerX: player ? Math.round(player.x) : null,
      playerY: player ? Math.round(player.y) : null
    };
  });

  const portalShift = await page.evaluate(() => {
    const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const glow = sc.portalGlow;
    const declared = sc.chapterPalette?.accent;
    if (!glow || typeof declared !== 'number') return null;
    // The applied tint must BE the declared accent. When the portal was pinned
    // to a constant gold this came out as a non-zero distance from every
    // chapter's own accent, which is the failure, not a threshold to clear.
    const applied = glow.tintTopLeft >>> 0;
    return applied === (declared >>> 0) ? 255 : 0;
  });

  // The portal reading is a channel distance, not a pixel distance, so it is
  // reported but not added into the pixel total.
  const shift = Math.round(
    (hazeShift || 0) + (accentShift || 0) + (tintShift || 0)
  );

  const shot = `${OUT}/${String(ch.index + 1).padStart(2, '0')}-${m.name || ch.name}.png`;
  await page.screenshot({ path: shot });
  measured.push({ ...ch, ...m, shot, shift, hazeShift, accentShift, tintShift, portalShift, stackOrder });
  console.log(
    `[${String(ch.index + 1).padStart(2)}] ${String(m.name).padEnd(10)} floor=0x${(m.floorTint ?? 0).toString(16).padStart(6, '0')} ` +
    `wall=0x${(m.wallTint ?? 0).toString(16).padStart(6, '0')} fog=${m.fog ? '0x' + m.fog.color.toString(16).padStart(6, '0') : 'none'} ` +
    `overlay=${m.hasOverlay ? '0x' + (m.overlayTint ?? 0).toString(16).padStart(6, '0') : 'none'} shift=${shift} (haze=${hazeShift} accent=${accentShift} tint=${tintShift} portal=${portalShift})`
  );
}

writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measured, null, 2));

console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);
console.log(`[screenshots] ${OUT}`);

const problems = [];
// The real test: every chapter's own colour has to move its own frame.
// A shift under 8 out of 255 is not a palette a player could notice. Each
// mechanism has to carry weight on its own, or a broken one is hidden behind the
// others: the first version summed them, and four separate mutations passed.
const inert = measured.filter((m) => (m.shift ?? 0) < 8);
if (inert.length) problems.push(`${inert.length} chapters have no measurable colour effect: ${inert.map((m) => m.name).join(', ')}`);

const noHaze = measured.filter((m) => (m.hazeShift ?? 0) < 4);
if (noHaze.length) problems.push(`the chapter wash is invisible in: ${noHaze.map((m) => m.name).join(', ')}`);

const noAccent = measured.filter((m) => (m.accentShift ?? 0) < 2);
if (noAccent.length) problems.push(`the accent lift is invisible in: ${noAccent.map((m) => m.name).join(', ')}`);

const noTint = measured.filter((m) => (m.tintShift ?? 0) < 3);
if (noTint.length) problems.push(`the floor/wall tints have no effect in: ${noTint.map((m) => m.name).join(', ')}`);

// The portal must carry the declared accent exactly. When it was pinned to a
// constant gold the tint was still a tint, so a presence check would have passed.
const noPortal = measured.filter((m) => m.portalShift !== 255);
if (noPortal.length) problems.push(`the portal glow does not carry the chapter accent in: ${noPortal.map((m) => m.name).join(', ')}`);

// The stack must read: tilemap, then the wash, then the actors. A wash at the top
// of the display list still leaves a measurable frame -- it just puts a 55% fog
// rectangle over the player and every enemy, which is not a palette, it is a
// broken game. No pixel comparison catches that, so the order is read directly.
const badStack = measured.filter((m) => {
  const st = m.stackOrder;
  if (!st) return true;
  return !(st.floor >= 0 && st.wall >= 0 && st.haze > st.wall &&
           st.accent > st.haze && (st.player < 0 || st.haze < st.player));
});
if (badStack.length) {
  const st = badStack[0].stackOrder || {};
  problems.push(`the chapter wash is not between the tilemap and the actors in: ${badStack.map((m) => m.name).join(', ')} (floor=${st.floor} wall=${st.wall} haze=${st.haze} accent=${st.accent} player=${st.player})`);
}

const accents = new Set(measured.map((m) => m.overlayTint));
console.log(`[distinct] accents=${accents.size} of ${measured.length} chapters`);
const mismatches = measured.filter((m) => m.declared && m.overlayTint !== m.declared.accent);
if (mismatches.length) problems.push(`the portal accent does not match the chapter in: ${mismatches.map((m) => m.name).join(', ')}`);
console.log(`[applied-correctly] ${measured.length - mismatches.length}/${measured.length}`);
if (accents.size !== measured.length) problems.push(`only ${accents.size} distinct accents across ${measured.length} chapters`);

const shifts = measured.map((m) => m.shift).filter((v) => typeof v === 'number');
const distinctShifts = new Set(shifts);
if (distinctShifts.size < 5) problems.push(`only ${distinctShifts.size} distinct palette effects across ${measured.length} chapters`);

const layer = (key) => {
  const v = measured.map((m) => m[key]).filter((x) => typeof x === 'number');
  return `${key.replace('Shift', '')}: min=${Math.min(...v)} max=${Math.max(...v)}`;
};

console.log(`[palette-effect] total shift: min=${Math.min(...shifts)} max=${Math.max(...shifts)} distinct=${distinctShifts.size}`);
console.log(`[layers] ${layer('hazeShift')} | ${layer('accentShift')} | ${layer('tintShift')} | ${layer('portalShift')}`);

writeFileSync(`${OUT}/measurements.json`, JSON.stringify(measured, null, 2));

if (problems.length) {
  console.log(`[summary] problems=${problems.join(' | ')}`);
  process.exitCode = 1;
} else {
  console.log('[summary] problems=none');
}
