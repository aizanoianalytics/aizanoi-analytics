// Section 19: "do not allow all 10 chapters to feel like differently sized random
// rectangles", and the guarantee list — connectivity, no inaccessible portal, no
// wall spawn, no impossible encounter, no soft lock.
//
// This drives the real game in a real browser: it enters each of the 10
// chapters through the game's own restart path, then reads the generated level
// and the entities that were actually placed.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const ROUTE = `${BASE}/dungeon/`;
const userDataDir = mkdtempSync(join(tmpdir(), 'aizanoi-levels-'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(ROUTE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => globalThis.AIZANOI_DUNGEON_GAME, null, { timeout: 60000 });
console.log('[entry] game instance published');

// Enter the game for real before auditing anything: the level is only generated
// once GameScene runs, and auditing a menu would measure nothing. The menu
// accepts several inputs, so drive the same sequence the play audit uses.
const inGame = async () => page.evaluate(
  () => Boolean(globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene')?.levelSystem)
);
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter', 'Space']) {
  if (await inGame()) break;
  await page.keyboard.press(key);
  await page.waitForTimeout(500);
}
if (!(await inGame())) {
  const box = await page.locator('#game-container canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  for (const key of ['Enter', 'Space']) {
    if (await inGame()) break;
    await page.keyboard.press(key);
    await page.waitForTimeout(600);
  }
}
if (!(await inGame())) throw new Error('could not reach GameScene; nothing to audit');
console.log('[entry] GameScene live');

const chapters = await page.evaluate(async () => {
  const mod = await import('/js/v3/apps/dungeon/js/data/levels.js');
  return mod.LEVELS.map((L) => ({
    id: L.id,
    name: L.name,
    palette: L.palette ? L.palette.name : null,
    declared: L.rooms || null,
    boss: L.boss || null
  }));
});

const results = [];
for (let i = 0; i < chapters.length; i++) {
  const ch = chapters[i];
  // Restart through the game's own mechanism, exactly as real progression does,
  // then wait for the rebuilt level from the driver side. Wrapping the wait in
  // a page-side promise does not work: the restart tears the scene down, which
  // collects any timer the promise was holding.
  await page.evaluate((idx) => {
    const scene = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    if (scene) scene.scene.restart({ chapterIndex: idx, isEndless: false, runState: scene.runState });
  }, i);
  await page.waitForFunction(
    (idx) => {
      const live = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
      return Boolean(live?.mapData?.audit) && live.chapterIndex === idx && Boolean(live.enemies);
    },
    i,
    { timeout: 30000 }
  );
  const r = await page.evaluate(() => {
    const live = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
    const sys = live.levelSystem;
    const gen = live.mapData;
    const audit = sys.audit();

    const roles = {};
    const allEnemies = live.enemies?.getChildren?.() || [];
    for (const e of allEnemies) {
      const role = e.getData('spawnRole') || 'unassigned';
      roles[role] = (roles[role] || 0) + 1;
    }
    // Section 19 forbids a wall spawn AND an unreachable placement. A spawn on
    // walkable tiles that the player cannot path to is a different failure and
    // has to be measured separately.
    const reachableSet = sys.reachableSet();
    let unreachableSpawns = 0;
    for (const e of allEnemies) {
      const cx = Math.floor(e.x / 32);
      const cy = Math.floor(e.y / 32);
      if (!reachableSet.has(`${cx},${cy}`)) unreachableSpawns++;
    }

    let wallSpawns = 0;
    for (const e of allEnemies) {
      const cx = Math.floor(e.x / 32);
      const cy = Math.floor(e.y / 32);
      const t = gen.grid[cy]?.[cx];
      if (t === undefined || t === 2) wallSpawns++;
    }
    const arena = sys.rooms.find((rm) => rm.role === 'boss');
    const boss = allEnemies.find((e) => e.getData('spawnRole') === 'boss');
    let bossInArena = null;
    if (boss && arena) {
      const bx = Math.floor(boss.x / 32);
      const by = Math.floor(boss.y / 32);
      bossInArena = bx >= arena.x && bx < arena.x + arena.w && by >= arena.y && by < arena.y + arena.h;
    }
    return {
      seed: gen.seed,
      rooms: audit.rooms,
      roleCounts: audit.roleCounts,
      portal: audit.portalReachable,
      unreach: audit.unreachableRooms.length,
      bossClr: audit.bossClearance,
      enough: audit.enoughRooms,
      ok: audit.ok,
      placed: roles,
      wallSpawns,
      unreachableSpawns,
      bossInArena,
      palette: gen.palette ? gen.palette.name : null
    };
  });

  const declaredTypes = Object.keys(ch.declared || {}).filter((k) => k !== 'base' && k !== 'boss');
  const presentTypes = declaredTypes.filter((t) => (r.roleCounts[t] || 0) > 0);
  const dominantDeclared = [...declaredTypes].sort((a, b) =>
    (ch.declared[b] || 0) - (ch.declared[a] || 0))[0];
  const dominantActual = Object.entries(r.roleCounts)
    .filter(([k]) => !['base', 'boss', 'transition'].includes(k))
    .sort((a, b) => b[1] - a[1])[0];
  const dominantOk = !dominantDeclared || (dominantActual && dominantActual[0] === dominantDeclared);

  const problems = [];
  if (!r.ok) problems.push('audit failed');
  if (!r.portal) problems.push('portal unreachable');
  if (r.unreach) problems.push(`${r.unreach} unreachable rooms`);
  if (!r.enough) problems.push('not enough rooms for its mix');
  if (r.wallSpawns > 0) problems.push(`${r.wallSpawns} wall spawns`);
  if (r.unreachableSpawns > 0) problems.push(`${r.unreachableSpawns} unreachable spawns`);
  if (dominantTypesMiss(presentTypes, declaredTypes)) problems.push('declared room type missing');
  if (!dominantOk) problems.push(`dominant role is ${dominantActual?.[0]}, declared ${dominantDeclared}`);
  if (r.bossInArena === false) problems.push('boss outside its arena');

  function dominantTypesMiss(present, declared) {
    return declared.length > 0 && present.length < declared.length;
  }

  results.push({ ...ch, ...r, problems, dominantOk });
  console.log(
    `[ch${String(i + 1).padStart(2)}] ${String(ch.palette).padEnd(10)} rooms=${r.rooms} seed=${r.seed} ` +
    `portal=${r.portal} wallSpawns=${r.wallSpawns} unreachable=${r.unreachableSpawns} placed=${JSON.stringify(r.placed)} ` +
    `| ${problems.length ? 'PROBLEMS: ' + problems.join(', ') : 'ok'}`
  );
}

// Determinism across a full regeneration, in the real runtime.
const determinism = await page.evaluate(async () => {
  const mod = await import('/js/v3/apps/dungeon/js/data/levels.js');
  const { LevelSystem } = await import('/js/v3/apps/dungeon/js/systems/LevelSystem.js');
  const rows = [];
  for (const L of mod.LEVELS) {
    const a = new LevelSystem(null, { ...L }).generate();
    const b = new LevelSystem(null, { ...L }).generate();
    const c = new LevelSystem(null, { ...L, seed: 424242 }).generate();
    rows.push({
      id: L.id,
      same: JSON.stringify(a.grid) === JSON.stringify(b.grid),
      reseedDiffers: JSON.stringify(a.grid) !== JSON.stringify(c.grid)
    });
  }
  return rows;
});

console.log(`[determinism] ${determinism.filter((d) => d.same).length}/${determinism.length} reproduce, ` +
  `${determinism.filter((d) => d.reseedDiffers).length}/${determinism.length} differ on a new seed`);
console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);

const failed = results.filter((r) => r.problems.length);
const paletteSet = new Set(results.map((r) => r.palette));
console.log(`[summary] chapters=${results.length} clean=${results.length - failed.length} failed=${failed.length}`);
console.log(`[palettes] ${JSON.stringify([...paletteSet])}`);
console.log(`[identity] ${results.filter((r) => r.dominantOk).length}/${results.length} chapters have their declared dominant room`);

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });
if (failed.length) {
  console.log(`[FAIL] ${failed.map((f) => f.name + ': ' + f.problems.join('; ')).join(' || ')}`);
}
