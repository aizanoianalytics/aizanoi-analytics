// Section 17: "Combat must become responsive and readable." The audit drives
// real attacks in the live game and measures the things that make a hit feel
// like a hit: the world freezing on impact, the telegraph window before a
// melee blow lands, and the hitstop actually restoring the time scale after.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const userDataDir = mkdtempSync(join(tmpdir(), 'dungeon-combat-feel-'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(`${BASE}/dungeon/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(
  () => document.querySelector('#game-container canvas') !== null, null, { timeout: 60000 });
await page.waitForFunction(() => Boolean(window.AIZANOI_DUNGEON_GAME), null, { timeout: 30000 });

const enteredPlay = async () => page.evaluate(() =>
  Boolean(window.AIZANOI_DUNGEON_GAME?.scene?.getScene('GameScene')?.player));
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter', 'Space', 'Enter']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(600);
  if (await enteredPlay()) break;
}
if (!await enteredPlay()) throw new Error('could not start a run');

const report = await page.evaluate(async () => {
  const game = window.AIZANOI_DUNGEON_GAME;
  const scene = game.scene.getScene('GameScene');
  const [{ ENEMY_TYPES }, { Enemy }] = await Promise.all([
    import('/js/v3/apps/dungeon/js/data/enemies.js'),
    import('/js/v3/apps/dungeon/js/entities/Enemy.js')
  ]);
  const player = scene.player;
  player.setPosition(player.x + 200, player.y);
  await new Promise((done) => { setTimeout(done, 300); });

  const out = {};

  // --- 1. hitstop must actually freeze the clock, then release it ---
  const timeScaleSamples = [];
  const observe = () => timeScaleSamples.push(scene.time.timeScale);
  const before = scene.time.timeScale;
  scene.applyHitstop(120, 0.004);
  const during = scene.time.timeScale;
  const t0 = performance.now();
  while (performance.now() - t0 < 260) {
    observe();
    await new Promise((done) => { requestAnimationFrame(() => { done(); }); });
  }
  // The freeze must lift on its own.
  const after = scene.time.timeScale;
  out.hitstop = {
    before, during, after,
    minDuring: Math.min(...timeScaleSamples),
    frozen: during < 0.5,
    released: after === 1
  };

  // --- 2. a real landed hit must drive it, and must not leave it stuck ---
  const enemy = new Enemy(scene, player.x + 60, player.y, { ...ENEMY_TYPES.gargoyle });
  scene.enemies.add(enemy);
  const hpBefore = enemy.hp;
  const scales = [];
  const t1 = performance.now();
  enemy.takeDamage(12, false, player);
  while (performance.now() - t1 < 400) {
    scales.push(scene.time.timeScale);
    await new Promise((done) => { requestAnimationFrame(() => { done(); }); });
  }
  out.landedHit = {
    damageDealt: hpBefore - enemy.hp,
    minTimeScale: Math.min(...scales),
    froze: Math.min(...scales) < 0.5,
    released: scene.time.timeScale === 1
  };
  enemy.destroy();

  // --- 3. the melee telegraph must delay the damage, not apply it instantly ---
  const dummy = new Enemy(scene, player.x + 40, player.y, { ...ENEMY_TYPES.gargoyle });
  scene.enemies.add(dummy);
  dummy.hp = dummy.maxHp = 500;
  const hp0 = dummy.hp;
  // Force a melee weapon so the telegraphed path is the one under test.
  // Use a real weapon id from the table; a made-up id leaves the weapon
  // data undefined and the attack silently falls into the ranged path.
  if (player.inventory?.equipped) player.inventory.equipped.weapon = 'legion_gladius';
  player.isAttacking = false;
  // Recompute derived stats after swapping the weapon, exactly as the real
  // inventory does, otherwise this.stats.attackRange still belongs to the
  // previous weapon and the range gate rejects the target.
  if (typeof player.stats?.recompute === 'function') player.stats.recompute();
  if (player.inventory?.getCalculatedStats) {
    player.stats = player.inventory.getCalculatedStats();
  }
  // Pin the player and the dummy for the whole measurement: the live update
  // loop moves bodies around, and a target that drifts out of range mid-windup
  // is rejected by design, not because the telegraph is broken.
  dummy.setImmovable(true);
  player.setImmovable(true);
  const before2 = dummy.hp;
  const dist = Math.round(Math.hypot(dummy.x - player.x, dummy.y - player.y));
  player.attack(dummy);
  const immediately = dummy.hp < before2;
  const distAtImpact = Math.round(Math.hypot(dummy.x - player.x, dummy.y - player.y));
  await new Promise((done) => { setTimeout(done, 400); });
  const after2 = dummy.hp;
  player.setImmovable(false);
  out.telegraph = {
    weapon: player.inventory?.equipped?.weapon,
    distance: dist,
    distanceAtImpact: distAtImpact,
    attackRange: Math.round(player.stats?.attackRange ?? -1),
    attackSpeed: player.stats?.attackSpeed ?? null,
    dummyAlive: dummy.active,
    damageInstant: immediately,
    damageAfterWindup: after2 < before2,
    totalDamage: before2 - after2,
    hp0
  };
  dummy.destroy();
  out.consoleErrorCount = 0;
  return out;
});

console.log('\n=== combat feel ===');
console.log(`[hitstop] ${JSON.stringify(report.hitstop)}`);
console.log(`[landedHit] ${JSON.stringify(report.landedHit)}`);
console.log(`[telegraph] ${JSON.stringify(report.telegraph)}`);

const findings = [];
if (!report.hitstop.frozen) findings.push('hitstop did not drop the time scale');
if (!report.hitstop.released) findings.push(`hitstop left the time scale at ${report.hitstop.after}`);
if (!report.landedHit.froze) findings.push('a landed enemy hit produced no hitstop');
if (!report.landedHit.released) findings.push('a landed enemy hit left the game in slow motion');
if (report.landedHit.damageDealt <= 0) findings.push('the landed hit dealt no damage');
// The whole point of anticipation: the damage must NOT be instantaneous.
if (report.telegraph.damageInstant) {
  findings.push('melee damage was applied instantly; there is no anticipation window');
}
if (!report.telegraph.damageAfterWindup) findings.push('the telegraphed melee never landed');
if (report.telegraph.totalDamage <= 0) findings.push('the telegraphed melee dealt no damage');

console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);
console.log(`[findings] ${findings.length ? findings.join(' | ') : 'none'}`);

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });
process.exitCode = findings.length ? 1 : 0;
