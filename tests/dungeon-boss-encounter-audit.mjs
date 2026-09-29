// Section 18, boss half: "Bosses need real encounter design." The mini boss
// needs readable phases, the final boss must "feel like a final boss rather
// than a large stat block" with distinct phases, telegraphed attacks, arena
// progression, a lightning/storm identity and a meaningful escalation.
//
// This audit fights both bosses in the live game: it walks them through their
// health thresholds, records the phases they enter, the moves they use, and
// whether the escalation is actually observable.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const userDataDir = mkdtempSync(join(tmpdir(), 'dungeon-boss-audit-'));
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

// Enter the game the way a player does.
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
  // Measure on the arena floor, not inside the base safe radius.
  player.setPosition(player.x + 200, player.y);
  await new Promise((done) => { setTimeout(done, 300); });

  const out = [];
  for (const key of ['marbleMinotaur', 'titanColossus']) {
    const type = ENEMY_TYPES[key];
    const boss = new Enemy(scene, player.x + 200, player.y, { ...type });
    scene.enemies.add(boss);

    const phases = new Set([boss.encounter.phase]);
    const moves = new Set();
    const speeds = [];
    const samples = [];
    let enrageSeen = false;
    let enrageSpeed = 0;
    let baseSpeed = boss.moveSpeed;

    // Walk the boss down through every health threshold. Only hp is changed;
    // the phases, moves and escalation all have to come from the real update
    // loop, not from anything this audit writes directly.
    for (const frac of [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.1]) {
      boss.hp = Math.max(1, Math.round(boss.maxHp * frac));
      const started = performance.now();
      // Long enough to contain a full windup -> charge -> recovery cycle.
      while (performance.now() - started < 2600) {
        await new Promise((done) => { requestAnimationFrame(() => { done(); }); });
        phases.add(boss.encounter.phase);
        if (boss.encounter.move?.phase) moves.add(boss.encounter.move.phase);
        const sp = boss.body ? Math.hypot(boss.body.velocity.x, boss.body.velocity.y) : 0;
        speeds.push(Math.round(sp));
        samples.push(boss.encounter.phase);
        if (boss.encounter.enraged) {
          enrageSeen = true;
          enrageSpeed = boss.moveSpeed;
        }
      }
    }

    out.push({
      id: key,
      isFinal: Boolean(type.isFinalBoss),
      phases: [...phases].sort((a, b) => a - b),
      moves: [...moves].sort(),
      maxSpeed: Math.max(0, ...speeds),
      enrageSeen,
      baseSpeed,
      enrageSpeed,
      alive: boss.active
    });
    boss.destroy();
  }
  return out;
});

console.log('\n=== boss encounters ===');
const findings = [];
for (const b of report) {
  console.log(`[${b.id}] ${JSON.stringify(b)}`);
  // A final boss needs at least three phases; a mini boss at least two.
  const minPhases = b.isFinal ? 3 : 2;
  if (b.phases.length < minPhases) {
    findings.push(`${b.id} only reached ${b.phases.length} phase(s), expected ${minPhases}`);
  }
  // Phases must be movement phases, not just a number incrementing.
  const realMoves = b.moves.filter((m) => m !== 'idle');
  if (realMoves.length < 2) {
    findings.push(`${b.id} never used a telegraphed move (saw: ${b.moves.join(',') || 'none'})`);
  }
  if (b.maxSpeed < 100) {
    findings.push(`${b.id} never committed to an attack (peak speed ${b.maxSpeed})`);
  }
  if (b.isFinal && !b.enrageSeen) {
    findings.push('titanColossus never enraged at its final health threshold');
  }
  if (b.isFinal && b.enrageSpeed <= b.baseSpeed) {
    findings.push(`titanColossus enrage did not escalate its speed (${b.baseSpeed} -> ${b.enrageSpeed})`);
  }
}

console.log(`[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);
console.log(`[findings] ${findings.length ? findings.join(' | ') : 'none'}`);

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });
process.exitCode = findings.length ? 1 : 0;
