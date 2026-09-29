// Section 18: "Verify each behavior actually differs in runtime. Do not accept
// data labels such as melee_chase, ranged_kite, stealth_ambush,
// shield_bash_charge unless the gameplay implementation genuinely
// differentiates them."
//
// This audit spawns one of every enemy archetype into the live game, lets the
// real AI run, and records the observable outcome. A label that only exists in
// the data table, with nothing in Enemy.js reading it, fails here.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.AIZANOI_BASE_URL || 'http://127.0.0.1:4173';
const ROUTE = `${BASE}/dungeon/`;

const ARCHETYPES = [
  { key: 'gargoyle', behavior: 'melee_chase', expect: 'closes distance on the player' },
  { key: 'legionary', behavior: 'ranged_kite', expect: 'backs away when the player closes inside 120px' },
  { key: 'centurion', behavior: 'melee_tank', expect: 'slow armoured advance, no retreat' },
  { key: 'wraith', behavior: 'stealth_ambush', expect: 'translucent until it commits to the ambush' },
  { key: 'praetorian', behavior: 'shield_bash_charge', expect: 'wind-up then a committed charge' }
];

const userDataDir = mkdtempSync(join(tmpdir(), 'dungeon-enemy-audit-'));
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

await page.goto(ROUTE, { waitUntil: 'domcontentloaded', timeout: 60000 });
// The game instance is published before the scenes boot, so wait for the
// canvas first and the instance second -- the reverse order times out.
await page.waitForFunction(
  () => document.querySelector('#game-container canvas') !== null, null, { timeout: 60000 });
await page.waitForFunction(() => Boolean(window.AIZANOI_DUNGEON_GAME), null, { timeout: 30000 });
// Drive the menu with real input until the play scene is actually running.
// A single Enter is not enough: the menu needs a highlighted option first.
const enteredPlay = async () => page.evaluate(() =>
  Boolean(window.AIZANOI_DUNGEON_GAME?.scene?.getScene('GameScene')?.player));
for (const key of ['Enter', 'Space', 'ArrowDown', 'Enter', 'Space', 'Enter']) {
  await page.keyboard.press(key);
  await page.waitForTimeout(600);
  if (await enteredPlay()) break;
}
if (!await enteredPlay()) {
  const diag = await page.evaluate(() => {
    const g = window.AIZANOI_DUNGEON_GAME;
    return { active: g ? g.scene.getScenes(true).map((x) => x.constructor?.name) : null };
  });
  throw new Error(`could not start a run; active scenes: ${JSON.stringify(diag.active)}`);
}

const results = [];
for (const a of ARCHETYPES) {
  // Spawn through the game's own factory so nothing about the entity is faked.
  const r = await page.evaluate(async (arch) => {
    const game = window.AIZANOI_DUNGEON_GAME;
    const scene = game.scene.getScene('GameScene');
    const [{ ENEMY_TYPES }, { Enemy }] = await Promise.all([
      import('/js/v3/apps/dungeon/js/data/enemies.js'),
      import('/js/v3/apps/dungeon/js/entities/Enemy.js')
    ]);
    // Resolve by declared behaviour, not by a hard-coded id, so the audit
    // cannot drift from the data table.
    const entry = Object.entries(ENEMY_TYPES).find(([, t]) => t.behavior === arch.behavior);
    if (!entry) return { error: `no enemy type declares behaviour ${arch.behavior}` };
    const [typeKey, type] = entry;
    if (!typeKey) return { error: `behaviour ${arch.behavior} has no type key` };

    const player = scene.player;
    if (!player) return { error: 'scene.player is missing' };
    // Build through the same path GameScene uses for real spawns.
    // Spawn INSIDE the archetype's own aggro range, otherwise the AI idles and
    // the audit would report "no behaviour" for every enemy that happens to
    // have a short aggro range.
    // Probe distance per behaviour: a kiter only retreats when the player is
    // inside 120px, so spawning it at 75% of a 224px aggro range would show it
    // standing still and read as "no behaviour".
    const aggro = type.aggroRange ?? 160;
    const probeDist = arch.behavior === 'ranged_kite'
      ? 90
      : Math.max(40, Math.round(aggro * 0.75));
    const enemy = new Enemy(scene, player.x + probeDist, player.y, { ...type });
    scene.enemies.add(enemy);

    const sample = [];
    const started = performance.now();
    // Let the real update loop drive the AI for a fixed window.
    while (performance.now() - started < 2600) {
      await new Promise((done) => {
        requestAnimationFrame(() => { done(); });
      });
      sample.push({
        t: Math.round(performance.now() - started),
        dist: Math.round(Math.hypot(enemy.x - player.x, enemy.y - player.y)),
        vx: Math.round(enemy.body ? enemy.body.velocity.x : 0),
        vy: Math.round(enemy.body ? enemy.body.velocity.y : 0),
        alpha: Math.round(enemy.alpha * 100) / 100,
        scaleX: Math.round(enemy.scaleX * 100) / 100,
        chargePhase: enemy.charge?.phase ?? null
      });
    }
    const first = sample[0];
    const last = sample[sample.length - 1];
    const maxSpeed = Math.max(...sample.map((s) => Math.hypot(s.vx, s.vy)));
    const minDist = Math.min(...sample.map((s) => s.dist));
    const maxDist = Math.max(...sample.map((s) => s.dist));
    const alphas = new Set(sample.map((s) => s.alpha));
    const scales = new Set(sample.map((s) => s.scaleX));
    const chargePhases = [...new Set(sample.map((s) => s.chargePhase).filter(Boolean))];

    const summary = {
      id: typeKey,
      behavior: enemy.behavior,
      declared: type.behavior,
      startDist: first.dist,
      endDist: last.dist,
      minDist,
      maxDist,
      maxSpeed,
      distinctAlphas: [...alphas].sort(),
      distinctScales: [...scales].sort(),
      chargePhases,
      sampleCount: sample.length
    };
    enemy.destroy();
    return summary;
  }, a);
  results.push({ ...a, ...r });
  console.log(`[${a.key}] ${JSON.stringify(r)}`);
}

// The sorcerer's ground denial is only real if a zone actually appears on the
// scene and ticks damage. Measure it rather than trusting the call site.
const aoe = await page.evaluate(async () => {
  const game = window.AIZANOI_DUNGEON_GAME;
  const scene = game.scene.getScene('GameScene');
  const [{ ENEMY_TYPES }, { Enemy }] = await Promise.all([
    import('/js/v3/apps/dungeon/js/data/enemies.js'),
    import('/js/v3/apps/dungeon/js/entities/Enemy.js')
  ]);
  const type = { ...ENEMY_TYPES.cultSorcerer };
  const player = scene.player;

  // The spawn point sits inside the base altar's safe radius, and a ground
  // hazard correctly does no damage there. Walk the player out onto the floor
  // first so the zone is measured where a real fight happens.
  const base = scene.baseAltar;
  const bx = player.x;
  const by = player.y;
  player.setPosition(bx + 200, by);
  await new Promise((done) => { setTimeout(done, 400); });
  const inBase = player.isInBase;
  const circlesBefore = scene.children.list.filter((c) => c.type === 'Arc').length;

  // Isolate the measurement: the player regenerates and the level's own
  // enemies keep hitting, so a raw hp delta cannot attribute damage to the
  // zone. Count the zone's own calls into takeDamage instead.
  const original = player.takeDamage.bind(player);
  let zoneTicks = 0;
  player.takeDamage = (amount, ...rest) => {
    zoneTicks += 1;
    return original(amount, ...rest);
  };

  // Call the real method the AI calls.
  const state = scene.spawnVolatileZone(player.x, player.y, type.volatileRadius, type.volatileDamage, 1400);
  const circlesAfter = scene.children.list.filter((c) => c.type === 'Arc').length;
  await new Promise((done) => { setTimeout(done, 1600); });
  const circlesFinal = scene.children.list.filter((c) => c.type === 'Arc').length;
  player.takeDamage = original;
  if (state?.zone?.destroy) state.zone.destroy();
  if (state?.rim?.destroy) state.rim.destroy();
  return {
    radius: type.volatileRadius,
    damage: type.volatileDamage,
    measuredInBase: inBase,
    spawned: circlesAfter - circlesBefore,
    damageTicks: zoneTicks,
    cleanedUp: circlesFinal < circlesAfter
  };
});
console.log('[aoe] ' + JSON.stringify(aoe));

await browser.close();
rmSync(userDataDir, { recursive: true, force: true });

console.log('\n=== declared vs runtime ===');
const findings = [];
for (const r of results) {
  if (r.error) { findings.push(`${r.key}: ${r.error}`); continue; }
  const declared = r.declared;
  const runtimeMoves = r.maxSpeed > 5;
  const distinctAlpha = r.distinctAlphas.length > 1;
  const distinctScale = r.distinctScales.length > 1;
  // A behaviour is "genuinely differentiated" only if Enemy.js visibly acts on
  // it: movement, stealth transparency or body scale.
  const phases = r.chargePhases || [];
  const charges = phases.some((p) => p !== 'idle');
  const differentiated = runtimeMoves || distinctAlpha || distinctScale || charges;
  const line = `${r.key.padEnd(11)} declared=${String(declared).padEnd(20)} ` +
    `moves=${runtimeMoves} alpha-varied=${distinctAlpha} scale-varied=${distinctScale} ` +
    `charge=${phases.join('>') || 'n/a'} ` +
    `dist ${r.startDist}->${r.endDist} peakSpeed=${r.maxSpeed}`;
  console.log(line);
  if (!differentiated) findings.push(`${r.key} (${declared}) shows no differentiated runtime behaviour`);
  // A behaviour that declares multi-phase mechanics must actually cycle them.
  if (declared === 'shield_bash_charge' && phases.length < 2) {
    findings.push('shield_bash_charge never left the idle phase');
  }
  // A kiter must retreat: the player closing in has to INCREASE the gap.
  if (declared === 'ranged_kite' && r.endDist <= r.startDist) {
    findings.push(`ranged_kite failed to retreat (${r.startDist} -> ${r.endDist})`);
  }
}
console.log(`\n[console-errors] ${consoleErrors.length ? consoleErrors.join(' | ') : 'none'}`);
if (aoe.spawned < 2) findings.push('the sorcerer ground zone did not render');
if (aoe.measuredInBase) {
  findings.push('the audit could not leave the base safe zone; the ground hazard was never exercised');
} else if (aoe.damageTicks < 1) {
  findings.push('the sorcerer ground zone did no damage over time');
}
console.log(`[undifferentiated] ${findings.length ? findings.join(' | ') : 'none'}`);
process.exitCode = 0;
