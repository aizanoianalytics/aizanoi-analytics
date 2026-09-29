// Section 20: "Add a useful run/chapter summary if currently missing."
//
// The statistics were always recorded; nothing ever displayed them. This drives
// the real game, kills real enemies for real, and then checks that the victory
// ledger reports figures that match what actually happened.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const userDataDir = mkdtempSync(join(tmpdir(), 'aizanoi-run-'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}\n${(e.stack || '').split('\n').slice(1, 6).join('\n')}`));

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
console.log('[entry] GameScene live');

// A run must exist the moment play begins, before anything is earned.
const fresh = await page.evaluate(() => {
  const s = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const p = s.progression;
  return { hasRun: Boolean(p.run), summary: p.runSummary() };
});
console.log(`[run-start] hasRun=${fresh.hasRun} ${JSON.stringify(fresh.summary)}`);

// Earn something through the real systems: kills, XP and denarii.
const earned = await page.evaluate(() => {
  const s = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene');
  const p = s.progression;
  // Kill real enemies through the real damage path.
  const enemies = s.enemies.getChildren();
  const killed = [];
  for (const e of enemies.slice(0, 6)) {
    if (e.hp !== undefined) {
      e.takeDamage(999999, s.player);
      killed.push(e.getData('spawnRole') || 'unknown');
    }
  }
  p.addXp(500);
  p.addGold(750);
  s.beginPortalTransition();
  return { killed: killed.length, summary: p.runSummary() };
});
console.log(`[earned] ${JSON.stringify(earned)}`);

// Open the real victory scene and read the text it actually renders.
await page.evaluate(() => {
  globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('GameScene').scene.start('VictoryScene');
});
await page.waitForTimeout(1200);
const ledger = await page.evaluate(() => {
  const scene = globalThis.AIZANOI_DUNGEON_GAME.scene.getScene('VictoryScene');
  if (!scene) return { error: 'no VictoryScene' };
  const texts = [];
  const walk = (obj) => {
    for (const child of (obj?.list || [])) {
      if (child.type === 'Text' && child.text) texts.push(String(child.text));
      walk(child);
    }
  };
  walk(scene.children);
  return { texts };
});

const hasLedger = ledger.texts?.some((t) => t.includes('RUN LEDGER'));
const labels = ['Chapters cleared', 'Enemies defeated', 'Bosses felled',
  'Levels gained this run', 'Denarii earned', 'XP earned', 'Denarii unspent'];
const present = labels.filter((l) => ledger.texts?.some((t) => t.includes(l)));
console.log(`[ledger] rendered=${hasLedger} rows=${present.length}/${labels.length} ${JSON.stringify(present)}`);

// Every figure on screen must match what actually happened.
const truth = earned.summary;
const expected = [
  `+${truth.levelsGained} (now ${truth.levelNow})`,
  String(truth.xpEarned),
  String(truth.denariiEarned)
];
const mismatches = expected.filter((v) => !ledger.texts?.some((t) => t.includes(v)));
console.log(`[truth-match] expected ${JSON.stringify(expected)} mismatches=${JSON.stringify(mismatches)}`);

// The real balance: simulate a full clear and check the run produces levels.
const balance = await page.evaluate(async () => {
  const en = await import('/js/v3/apps/dungeon/js/data/enemies.js');
  const lv = await import('/js/v3/apps/dungeon/js/data/levels.js');
  const { xpForLevel, LEVEL_UP_BONUS } = await import('/js/v3/apps/dungeon/js/constants.js');
  const DENSITY = { low: 10, medium: 18, high: 26, very_high: 36 };
  let level = 1, xp = 0, nextXp = xpForLevel(1), gold = 0;
  const rows = [];
  for (const L of lv.LEVELS.filter((l) => !l.isEndless)) {
    const count = L.boss ? DENSITY[L.enemies.density] + 1 : DENSITY[L.enemies.density];
    let chapterXp = 0;
    let chapterGold = 0;
    for (let i = 0; i < count; i++) {
      const t = en.ENEMY_TYPES[L.enemies.types[i % L.enemies.types.length]];
      chapterXp += t.xpReward;
      chapterGold += t.goldReward;
    }
    if (L.boss) {
      chapterXp += en.ENEMY_TYPES[L.boss].xpReward;
      chapterGold += en.ENEMY_TYPES[L.boss].goldReward;
    }
    gold += chapterGold + (L.goldBonus || 0);
    let rem = chapterXp;
    while (rem > 0) {
      const need = nextXp - xp;
      if (rem >= need) { xp = 0; rem -= need; level++; nextXp = xpForLevel(level); }
      else { xp += rem; rem = 0; }
    }
    rows.push({ ch: L.id, levelAtEnd: level });
  }
  return { finalLevel: level, finalGold: gold, rows, levelUpHp: LEVEL_UP_BONUS.hp, levelUpDmg: LEVEL_UP_BONUS.attackDamage };
});
console.log(`[balance] level ${balance.finalLevel}, ${balance.finalGold} denarii, +${balance.levelUpHp} hp / +${balance.levelUpDmg} dmg per level`);
console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);

const problems = [];
if (!fresh.hasRun) problems.push('a run was not started when play began');
if (!hasLedger) problems.push('the victory screen renders no ledger');
if (present.length < labels.length) problems.push(`only ${present.length}/${labels.length} summary rows render`);
if (mismatches.length) problems.push(`ledger figures disagree with the run: ${mismatches.join(', ')}`);
if (truth.enemiesKilled < 1) problems.push('kills were not recorded against the run');
if (balance.finalLevel < 10) problems.push(`a full clear only reaches level ${balance.finalLevel}`);

console.log(`[summary] problems=${problems.length ? problems.join(' | ') : 'none'}`);

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });
if (problems.length) process.exitCode = 1;
