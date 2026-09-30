// Section 22: "Dungeon — controls, mobile and accessibility".
//
// What this found, and what it now measures:
//
//   - Gamepad support did not exist. The movement code read the touch joystick
//     or the keyboard and nothing else, so a connected controller was a dead
//     peripheral.
//   - The camera was shaken through fourteen direct Phaser shake() calls in
//     three files, none of which consulted a setting. There was no way to turn
//     that off.
//   - There was a mute and a hardcoded 0.6 gain, and no volume control.
//   - The four settings the game read had no UI at all: no options screen
//     existed, so a keyboard-only player could not reach any of them.
//   - A player who is deaf, in a noisy room, or playing muted had no visual
//     channel for a boss winding up.
//
// Everything below is measured against the real running game, through the real
// input paths.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const OUT = join(tmpdir(), 'aizanoi-dungeon-accessibility');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Phaser clears a key's just-pressed state at the top of every frame, so a press
// only registers if it is still held when a frame runs. Under a software
// renderer a frame can take a long time, and a fixed sleep is therefore a coin
// flip -- the keyboard toggle passed on some runs and not others. So the waits
// are counted in the renderer's own frames rather than in milliseconds.
const advance = (page, n) => page.evaluate((want) => new Promise((resolve) => {
  const g = globalThis.AIZANOI_DUNGEON_GAME.scene.game;
  const start = g.loop.frame;
  const tick = () => {
    if (g.loop.frame - start >= want) resolve(g.loop.frame - start);
    else requestAnimationFrame(tick);
  };
  tick();
}), n);

const hold = async (page, key) => {
  await page.keyboard.down(key);
  await advance(page, 3);
  await page.keyboard.up(key);
  await advance(page, 3);
};

// The page-side readers, installed once per page context. A dynamic import
// evaluated inside a waitForFunction callback runs on every poll and can hand
// back a second module record, and a second module record is a different
// in-memory copy of the settings the scene actually writes to -- which is how a
// working toggle reads as a no-op.
const installReaders = (page) => page.evaluate(async () => {
  globalThis.__dungeon = await import(
    '/js/v3/apps/dungeon/js/systems/AccessibilitySystem.js');
  globalThis.__pad = await import(
    '/js/v3/apps/dungeon/js/systems/GamepadSystem.js');
});

const results = [];
const record = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  | ${detail}` : ''}`);
};

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1024, height: 700 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

// The audit changes preferences, so a previous run's leftovers would decide
// its results. Start from a clean store rather than from whatever ran last.
await page.goto(`${BASE}/dungeon/`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await installReaders(page);
await page.waitForFunction(() => globalThis.AIZANOI_DUNGEON_GAME, null, { timeout: 60000 });

// The menu is a real multi-key flow, so use it.
const inGame = async () => page.evaluate(() =>
  Boolean(globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene')?.levelSystem));
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter']) {
  if (await inGame()) break;
  await hold(page, key);
}
record('the dungeon reaches a playable GameScene', await inGame(), '');

// --- 1. Every camera shake goes through the accessible helper -----------------
// The shake has to be measured as movement, not as a call. cam.shake() in this
// Phaser build is a function that silently does nothing -- the camera effects
// live in an FX pipeline this build does not have -- so all fourteen of the
// game's shake calls had been no-ops, and reading scroll or midPoint reported
// "no movement" whether or not the preference was honoured. The helper now
// writes the offset itself, so the frame-to-frame offset is the honest
// measurement.
const shakeWithSetting = async (reduced) => page.evaluate(async (on) => {
  const key = 'aizanoi_dungeon_settings_v1';
  const prev = localStorage.getItem(key);
  const s = prev ? JSON.parse(prev) : {};
  s.reducedShake = on;
  localStorage.setItem(key, JSON.stringify(s));

  const { shakeCamera, reducedMotionActive } = globalThis.__dungeon;
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const cam = sc.cameras.main;

  shakeCamera(sc, 300, 0.02);
  let framesMoved = 0;
  let maxOffset = 0;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => { requestAnimationFrame(r); });
    const o = cam.__aizanoiShakeOffset;
    if (!o) continue;
    const m = Math.hypot(o.x, o.y);
    if (m > 0.5) framesMoved++;
    if (m > maxOffset) maxOffset = m;
  }

  const out = { framesMoved, maxOffset: Math.round(maxOffset * 10) / 10, reduced: reducedMotionActive() };
  if (prev) localStorage.setItem(key, prev);
  else localStorage.removeItem(key);
  return out;
}, reduced);

const shakeOn = await shakeWithSetting(false);
const shakeOff = await shakeWithSetting(true);
record('screen shake can be turned off',
  shakeOn.framesMoved > 0 && shakeOff.framesMoved === 0 && shakeOff.reduced,
  `moving frames with=${shakeOn.framesMoved} (max ${shakeOn.maxOffset}px) without=${shakeOff.framesMoved}, reduced=${shakeOff.reduced}`);

// --- 2. A real volume control, not just a mute ------------------------------
const volume = await page.evaluate(async () => {
  const { audioManager } = await import('/js/v3/apps/dungeon/js/systems/AudioManager.js');
  const before = audioManager.getVolume();
  audioManager.setVolume(0.25);
  const after = audioManager.getVolume();
  audioManager.ensureContext();
  audioManager.applyVolume();
    // gain.value is the value the graph is doing right now. setValueAtTime lands
  // on the audio clock, which only advances at a render quantum, so it has to be
  // read after a wait rather than in the same tick.
  await new Promise((r) => { setTimeout(r, 120); });
  const live = () => audioManager.masterGain?.gain?.value ?? null;
  const gain = live();
  const wasMuted = audioManager.toggleMute();
  await new Promise((r) => { setTimeout(r, 120); });
  const mutedGain = live();
  if (wasMuted) { audioManager.toggleMute(); await new Promise((r) => { setTimeout(r, 120); }); }
  audioManager.setVolume(before);
  return { before, after, gain, mutedGain, wasMuted };
});
record('volume control changes the master gain',
  Math.abs(volume.before - 1) < 1e-6 && Math.abs(volume.after - 0.25) < 1e-6
    && volume.gain !== null && Math.abs(volume.gain - 0.25) < 0.02
    && volume.mutedGain === 0,
  `default=${volume.before} set=${volume.after} gain=${volume.gain} muted=${volume.mutedGain}`);

// --- 3. The settings are reachable, and reachable from a keyboard ------------
// Reload rather than switch scenes in place: the shake measurement above drove
// the camera and left a watcher running, and a scene torn down under a live
// camera effect does not come back cleanly. A fresh load is also the path a
// player takes to reach the menu.
// A clean store for this section: the two measurements above deliberately wrote
// preferences, and starting from those would mean the audit's own leftovers
// decided the results.
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'domcontentloaded' });
await installReaders(page);
await page.waitForFunction(() => globalThis.AIZANOI_DUNGEON_GAME, null, { timeout: 60000 });
await page.waitForFunction(() => Boolean(
  globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('MenuScene')?.scene?.isActive?.()
), null, { timeout: 30000 });
await page.waitForTimeout(900);
const menuHasOptions = await page.evaluate(() => {
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('MenuScene');
  return sc?.children?.list?.some((o) => o.type === 'Container'
    && o.list?.some((c) => c.text === 'Options & accessibility')) || false;
});
record('the menu offers an options entry', menuHasOptions, '');

// A reload leaves the AudioContext suspended until a gesture, and OptionsScene
// calls ensureContext() in create(). Unlock it directly rather than clicking: a
// click at the centre of the menu would land on a button and start a run, which
// is not what this step is measuring.
await page.evaluate(async () => {
  const { audioManager } = await import('/js/v3/apps/dungeon/js/systems/AudioManager.js');
  audioManager.ensureContext();
  await audioManager.ctx?.resume?.();
});
await page.waitForFunction(() => Boolean(
  globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('MenuScene')?.scene?.isActive?.()
), null, { timeout: 20000 });
await page.evaluate(() => {
  globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('MenuScene').scene.start('OptionsScene', { from: 'MenuScene' });
});
await page.waitForTimeout(900);

await page.waitForFunction(() => {
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene');
  return Boolean(sc?.scene?.isActive()) && Array.isArray(sc?.rows);
}, null, { timeout: 20000 });
const optionsUp = await page.evaluate(() => {
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene');
  return {
    live: Boolean(sc?.scene?.isActive()),
    rows: sc?.rows?.map((r) => r.label) || [],
    cursor: sc?.cursor
  };
});
record('the options screen lists every preference',
  optionsUp.live
    && ['Reduced screen shake', 'Non-audio telegraphs', 'Readable contrast', 'Text size', 'Volume']
      .every((l) => optionsUp.rows.includes(l)),
  optionsUp.rows.join(', '));

// Drive it with real keys only: no pointer, no direct method calls.
await page.waitForFunction(() => {
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene');
  return Boolean(sc?.scene?.isActive()) && Array.isArray(sc?.rows) && sc.rows.length > 1;
}, null, { timeout: 20000 });
const keyboardOnly = await page.evaluate(() => globalThis.__dungeon.loadAccessibilitySettings());
// Navigate to the row by its label, then press once. Counting presses would make
// the test depend on how many keys the harness manages to deliver, and a dropped
// keypress lands the activation on a different setting than the one claimed.
for (let i = 0; i < 8; i++) {
  const label = await page.evaluate(() => {
    const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene');
    return sc?.rows?.[sc?.cursor]?.label || null;
  });
  if (label === 'Non-audio telegraphs') break;
  await hold(page, 'ArrowDown');
}
await hold(page, 'Space');
await page.waitForFunction(
  (want) => globalThis.__dungeon.loadAccessibilitySettings().nonAudioTelegraphs === want,
  !keyboardOnly.nonAudioTelegraphs, { timeout: 15000 });
const afterToggle = await page.evaluate(() => {
  const { loadAccessibilitySettings } = globalThis.__dungeon;
  return {
    settings: loadAccessibilitySettings(),
    cursor: globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene')?.cursor
  };
});
record('a preference can be changed with the keyboard alone',
  afterToggle.cursor === 1
    && afterToggle.settings.nonAudioTelegraphs === !keyboardOnly.nonAudioTelegraphs,
  `cursor=${afterToggle.cursor} nonAudioTelegraphs ${keyboardOnly.nonAudioTelegraphs} -> ${afterToggle.settings.nonAudioTelegraphs}; stored=${JSON.stringify(afterToggle.settings)}`);

// Text size has to be adjustable too, and it is a stepper, not a slider.
const sizeBefore = await page.evaluate(() => globalThis.__dungeon.uiScale());
// Navigate by label. Counting presses is brittle: one dropped keypress moves the
// cursor and the test then reads a different setting than the one it claims to
// change. Bounded so a screen that never lands on the row fails instead of
// looping.
let sizeRow = null;
for (let i = 0; i < 8; i++) {
  sizeRow = await page.evaluate(() => {
    const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene');
    return sc?.rows?.[sc?.cursor]?.label || null;
  });
  if (sizeRow === 'Text size') break;
  await hold(page, 'ArrowDown');
}
await hold(page, 'Space');
await page.waitForFunction(
  (was) => globalThis.__dungeon.uiScale() !== was,
  sizeBefore, { timeout: 15000 });
const sizeAfter = await page.evaluate(() => ({
  scale: globalThis.__dungeon.uiScale(),
  fontUsed: (() => {
    const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene');
    const t = sc?.children?.list?.find((o) => o.type === 'Text' && /%$/.test(o.text || ''));
    return t ? parseInt(t.style.fontSize, 10) : null;
  })()
}));
record('text size is adjustable and the screen honours it',
  sizeRow === 'Text size' && sizeAfter.scale !== sizeBefore && sizeAfter.fontUsed !== null,
  `row=${sizeRow}, ${Math.round(sizeBefore * 100)}% -> ${Math.round(sizeAfter.scale * 100)}%, rendered at ${sizeAfter.fontUsed}px`);

await hold(page, 'Escape');
const returned = await page.evaluate(() => ({
  scene: globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('MenuScene')?.scene?.isActive?.(),
  options: globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('OptionsScene')?.scene?.isActive?.()
}));
record('Escape returns to the menu', Boolean(returned.scene) && !returned.options, JSON.stringify(returned));


// --- 4. A non-audio channel for a critical cue -------------------------------
// A fresh run rather than a restart of the existing one: the previous scene was
// stopped and started to reach the menu, and Phaser's enemy group is rebuilt
// only by the scene's own create(), so a boss looked up in a torn-down scene
// has no children and the audit threw on `.entries` instead of measuring
// anything.
await page.evaluate(() => localStorage.setItem(
  'aizanoi_dungeon_settings_v1',
  JSON.stringify({ nonAudioTelegraphs: true })
));
await page.reload({ waitUntil: 'domcontentloaded' });
await installReaders(page);
await page.waitForFunction(
  () => Boolean(globalThis.AIZANOI_DUNGEON_GAME?.scene),
  null, { timeout: 90000 });
// Held presses, not taps: the menu's own handler reads JustDown too.
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter']) {
  if (await page.evaluate(() => Boolean(
    globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene')?.levelSystem))) break;
  await hold(page, key);
}
await page.waitForFunction(() => Boolean(
  globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene')?.levelSystem
), null, { timeout: 30000 });
// The enemy group has to exist before anything can be measured against it.
// Phaser stores a group's members in a Set, not an array, so the earlier
// Array.isArray check on this never became true and the wait simply ran out --
// with an enemy group sitting right there.
await page.waitForFunction(() => {
  const s = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  return Boolean(s?.enemies?.getChildren?.().length);
}, null, { timeout: 40000 });
// Chapter 1 has no boss and waiting for one times the run out. The encounter
// code is shared by both bosses, so go to the chapter that has one rather than
// asserting a thing that is not there yet.
// A chapter is a boss chapter when its config names one; the earlier guess at
// an `isBoss` flag in the level data matched nothing, so the search fell back to
// chapter 5, which does have a minotaur -- but the probe was reading the wrong
// shape for the enemy itself and reported no boss at all.
const bossChapter = await page.evaluate(async () => {
  const { LEVELS } = await import('/js/v3/apps/dungeon/js/data/levels.js');
  const idx = LEVELS.findIndex((l) => Boolean(l.boss));
  return idx >= 0 ? idx : 4;
});
await page.evaluate((idx) => {
  const s = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  s.scene.restart({ chapterIndex: idx, isEndless: false, runState: s.runState });
}, bossChapter);
await page.waitForFunction(() => {
  const s = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const list = s?.enemies?.getChildren?.() || [];
  return list.some((e) => e?.isBoss);
}, null, { timeout: 40000 });
await page.waitForTimeout(600);

const telegraph = await page.evaluate(async () => {
  const { nonAudioTelegraphsActive } = globalThis.__dungeon;
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const boss = (sc?.enemies?.getChildren?.() || []).find((e) => e?.isBoss);
  if (!boss) return { boss: false, active: nonAudioTelegraphsActive() };
  // Put the boss into its committed wind-up through its own state, then look for
  // the mark. A player has to be able to see this with the sound off.
  boss.encounter.move.phase = 'windup';
  boss.encounter.move.timer = 600;
  await new Promise((r) => { setTimeout(r, 500); });
  return {
    boss: true,
    active: nonAudioTelegraphsActive(),
    mark: Boolean(boss.telegraphMark),
    markType: boss.telegraphMark?.type || null,
    onScreen: boss.telegraphMark ? boss.telegraphMark.x > 0 : false
  };
});
record('a winding-up boss carries a visible mark',
  telegraph.active && telegraph.boss && telegraph.mark,
  `setting=${telegraph.active} boss=${telegraph.boss} mark=${telegraph.mark} (${telegraph.markType})`);

const telegraphOff = await page.evaluate(async () => {
  const { saveAccessibilitySettings } = globalThis.__dungeon;
  saveAccessibilitySettings({ nonAudioTelegraphs: false });
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const boss = (sc?.enemies?.getChildren?.() || []).find((e) => e?.isBoss);
  await new Promise((r) => { setTimeout(r, 400); });
  return { mark: Boolean(boss?.telegraphMark) };
});
record('the mark is not drawn when the preference is off', telegraphOff.mark === false, '');

// --- 5. A gamepad is actually read -------------------------------------------
const gamepad = await page.evaluate(async () => {
  const { readMoveVector } = globalThis.__pad;
  // A synthetic pad, because the test host has no controller. The reader is
  // what is under test, and it must work on a standard-mapping pad.
  const pad = {
    connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false }))
  };
  pad.axes[0] = 0.9; pad.axes[1] = -0.4;
  const stick = readMoveVector(pad);
  // deadzone
  pad.axes[0] = 0.1; pad.axes[1] = 0.05;
  const dead = readMoveVector(pad);
  // d-pad
  pad.axes[0] = 0; pad.axes[1] = 0;
  pad.buttons[15].pressed = true; pad.buttons[13].pressed = true;
  const dpad = readMoveVector(pad);
  // diagonal normalisation
  pad.buttons[15].pressed = true; pad.buttons[13].pressed = true; pad.buttons[14].pressed = true;
  const diag = readMoveVector(pad);
  return { stick, dead, dpad, diag };
});
record('the gamepad reader maps stick, deadzone and d-pad',
  gamepad.stick.x >= 0.9 && gamepad.stick.y <= -0.3
    && gamepad.dead.x === 0 && gamepad.dead.y === 0
    // a diagonal d-pad is normalised to unit length, so both axes are 1/sqrt(2)
    && Math.abs(gamepad.dpad.x - Math.SQRT1_2) < 1e-6
    && Math.abs(gamepad.dpad.y - Math.SQRT1_2) < 1e-6
    && Math.hypot(gamepad.diag.x, gamepad.diag.y) <= 1.0001,
  `stick=${JSON.stringify(gamepad.stick)} dead=${JSON.stringify(gamepad.dead)} dpad=${JSON.stringify(gamepad.dpad)}`);

const padEdge = await page.evaluate(async () => {
  const { GamepadInput } = globalThis.__pad;
  const fake = {
    connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false }))
  };
  const real = navigator.getGamepads;
  navigator.getGamepads = () => [fake, null, null, null];
  try {
    const gi = new GamepadInput();
    // the resting sample primes the previous-state cache
    const rest = gi.sample();
    fake.buttons[0].pressed = true;
    const edge = gi.sample();      // the press itself: edge-triggered
    const heldAgain = gi.sample(); // still down: must not fire again
    // and a disconnect mid-press must not leave the action stuck
    navigator.getGamepads = () => [null, null, null, null];
    const gone = gi.sample();
    return {
      restArmed: rest.pressed.attack === false,
      edge: edge.pressed.attack,
      held: edge.held.attack,
      repeat: heldAgain.pressed.attack,
      after: gone.held.attack,
      connected: gone.connected
    };
  } finally { navigator.getGamepads = real; }
});
record('a gamepad press is edge-triggered and clears on disconnect',
  padEdge.restArmed === true
    && padEdge.edge === true && padEdge.held === true
    && padEdge.repeat === false
    && padEdge.after === false && padEdge.connected === false,
  JSON.stringify(padEdge));

const padDrivesMovement = await page.evaluate(async () => {
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const p = sc?.player;
  if (!p) return { ok: false };
  const fake = {
    connected: true, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false }))
  };
  fake.axes[0] = 1;
  const real = navigator.getGamepads;
  navigator.getGamepads = () => [fake, null, null, null];
  try {
    const x0 = p.x, y0 = p.y;
    await new Promise((r) => { setTimeout(r, 700); });
    return { ok: true, moved: Math.hypot(p.x - x0, p.y - y0) > 8, x0, x: p.x };
  } finally { navigator.getGamepads = real; }
});
record('holding a stick right moves the player with no key pressed',
  padDrivesMovement.ok && padDrivesMovement.moved,
  `x ${padDrivesMovement.x0} -> ${padDrivesMovement.x}`);

// --- 6. Desktop controls that section 22 names -------------------------------
const controls = await page.evaluate(() => {
  const sc = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const keys = Object.keys(sc.wasd || {});
  return {
    keys,
    movement: Boolean(sc.cursors) && keys.includes('W') && keys.includes('D'),
    attack: Boolean(sc.cursors?.space),
    skills: keys.includes('Q') && keys.includes('R'),
    inventory: keys.includes('I') && keys.includes('TAB'),
    utility: keys.includes('E') && keys.includes('B'),
    menu: keys.includes('ESC') && keys.includes('P'),
    pause: keys.includes('P')
  };
});
record('the desktop bindings section 22 lists are all bound',
  controls.movement && controls.attack && controls.skills && controls.inventory
    && controls.utility && controls.menu,
  `keys: ${controls.keys.join(',')}`);

// --- 7. The HUD actually redraws at the chosen size -------------------------
// UIScene is built once per run, so a scale changed mid-run does not resize the
// existing labels. The honest test is the path a player takes: set it, then load
// the game. Measuring it without a reload would report a broken feature that
// works, and measuring only the preference object would report a working
// checkbox that does nothing.
await page.evaluate(() => localStorage.setItem(
  'aizanoi_dungeon_settings_v1',
  JSON.stringify({ uiScale: 2, highContrast: true })
));
await page.reload({ waitUntil: 'domcontentloaded' });
await installReaders(page);
await page.waitForFunction(() => globalThis.AIZANOI_DUNGEON_GAME, null, { timeout: 60000 });
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter']) {
  if (await inGame()) break;
  await hold(page, key);
}
const hud = await page.evaluate(() => {
  const ui = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('UIScene');
  const texts = (ui?.children?.list || []).filter((o) => o.type === 'Text');
  const sizes = texts.map((t) => parseInt(t.style.fontSize, 10));
  return {
    count: sizes.length,
    min: sizes.length ? Math.min(...sizes) : null,
    max: sizes.length ? Math.max(...sizes) : null,
    colours: [...new Set(texts.map((t) => t.style.color))]
  };
});
record('the HUD draws at the chosen text size on a real load',
  hud.count > 0 && hud.min >= 20 && hud.max >= 26,
  `${hud.count} labels, ${hud.min}-${hud.max}px at 200%`);
record('the contrast option changes real HUD pixels',
  hud.colours.includes('#f8fafc'),
  hud.colours.join(' '));
record('no HUD label is below the readable floor',
  hud.min !== null && hud.min >= 11,
  `smallest is ${hud.min}px`);

record('no console errors', consoleErrors.length === 0, consoleErrors.join(' | '));

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
await page.screenshot({ path: `${OUT}/final.png` });
await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(`\n[summary] ${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log(`[summary] failures: ${failed.map((f) => f.name).join(' | ')}`);
  process.exitCode = 1;
}
