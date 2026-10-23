// Headless balance smoke bot: simulates N seeded runs with a scripted build
// and prints clear rate, median chapter, damage taken and samples per archetype.
// The bot is deliberately dumb (no dodging); bounds are loose smoke checks.
// Usage: node scripts/dungeon/balance-harness.mjs [--runs 40] [--seed base]
import { createGameState, spawnWave, stepGame, chooseBlessing, openChest } from '../../frontend/js/v3/apps/dungeon/src/game/index.js';

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf('--runs') + 1]) || 40;
const base = args[args.indexOf('--seed') + 1] || 'balance';

const SAMPLES = {};
let clears = 0;
const chapters = [];
const damageTaken = [];

for (let run = 0; run < runs; run += 1) {
  const state = createGameState(`${base}-${run}`);
  spawnWave(state, 1);
  let ticks = 0;
  const maxTicks = 60 * 60 * 30;
  while (state.chapter <= 10 && ticks < maxTicks && !state.player.dead) {
    const px = state.player.position.x;
    const pz = state.player.position.z;
    const input = {
      moveX: px > 1 ? -1 : px < -1 ? 1 : 0,
      moveZ: pz > 1 ? -1 : pz < -1 ? 1 : 0,
      attack: true,
      shoot: ticks % 40 < 30,
      autoAttack: true,
      dash: ticks % 120 === 0,
    };
    stepGame(state, input, 1 / 60);
    ticks += 1;
    for (const chest of state.chests.filter((c) => !c.opened)) {
      const result = openChest(state, chest.id);
      if (result.blessing) chooseBlessing(state, result.blessing);
      if (result.victory) break;
      spawnWave(state, state.chapter);
    }
  }
  if (state.chapter > 10) clears += 1;
  chapters.push(state.chapter);
  damageTaken.push(state.stats.damageTaken);
  for (const e of state.enemies) {
    SAMPLES[e.archetype] = SAMPLES[e.archetype] || [];
    SAMPLES[e.archetype].push(e.maxHp);
  }
}

chapters.sort((a, b) => a - b);
const median = chapters[Math.floor(chapters.length / 2)];
const avgDamage = Math.round(damageTaken.reduce((a, b) => a + b, 0) / Math.max(1, damageTaken.length));
console.log(`runs=${runs} clears=${clears} clearRate=${((clears / runs) * 100).toFixed(1)}% medianChapter=${median} avgDamageTaken=${avgDamage}`);
for (const [arch, list] of Object.entries(SAMPLES)) {
  const avg = Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  console.log(`archetype=${arch} samples=${list.length} avgMaxHp=${avg}`);
}
// Loose smoke bounds: a dumb bot should regularly leave the early chapters,
// and a full clear with no dodging should be rare.
if (median < 2) { console.error('FAIL: median chapter below 2 — progression broken'); process.exit(1); }
if (clears > runs * 0.9) console.warn('WARN: bot clears too often — difficulty may be flat');
console.log('balance harness: OK');
