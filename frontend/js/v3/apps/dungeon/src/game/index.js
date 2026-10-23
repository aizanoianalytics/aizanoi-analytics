// Deterministic, renderer-agnostic dungeon simulation.
const VERSION = 4;
export const DUNGEON_SAVE_KEY = 'aizanoi.dungeon.run.v4';
const V3_SAVE_KEY = 'aizanoi.dungeon.run.v3';
const LEGACY_SAVE_KEY = 'aizanoi.dungeon.run.v2';
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 600;
const ARENA_RADIUS = 18;
const REWARD_BOUNDARY = 16;
const MAX_EVENTS = 128;
const MAX_LOOT = 64;
const DASH_DURATION = 0.22;
const NORMAL_WINDUP = 0.25;
const BOSS_WINDUP = 0.45;
// The blessings the 2D build had, translated into the 3D build's multipliers.
// The 2D build named them in Turkish (hizli_saldiri, mermer_beden, ...); the
// 3D build keeps the three it already had and adopts the same ideas under
// English ids, because the 3D build's whole vocabulary is English.
const BLESSINGS = Object.freeze({
  vitality: { label: 'Blessing of Vitality', hint: '+30 max health' },
  fury: { label: 'Blessing of Fury', hint: '+20% damage' },
  windstep: { label: 'Blessing of Windstep', hint: '-25% dash cooldown' },
  swiftstrike: { label: 'Blessing of Swift Strike', hint: '+18% attack speed' },
  keeneye: { label: 'Blessing of the Keen Eye', hint: '+15% critical chance' },
  honededge: { label: 'Blessing of the Honed Edge', hint: '+35% critical damage' },
  ironskin: { label: 'Blessing of Iron Skin', hint: '-15% damage taken' },
  vampiric: { label: 'Blessing of the Vampiric Oath', hint: 'Heal 18% of the damage you deal' },
  longrange: { label: 'Blessing of Long Range', hint: '+30% bow range' },
  stormstep: { label: 'Blessing of Storm Step', hint: '+12% movement speed' },
  warmonger: { label: 'Blessing of the Warmonger', hint: '+10% damage and +8% attack speed' },
  penkalasblood: { label: 'Blessing of the Penkalas Blood', hint: '-25% bow stamina cost' },
});
const BLESSING_IDS = Object.freeze(Object.keys(BLESSINGS));
// Exported so the tests (and the HUD) can enumerate the pool.
export { BLESSING_IDS };
// The HUD needs the labels and hints, so the table is exported for the UI.
export const BLESSING_LABELS = Object.freeze(Object.fromEntries(
  BLESSING_IDS.map((id) => [id, Object.freeze({ label: BLESSINGS[id].label, hint: BLESSINGS[id].hint })]),
));
const OBSTACLES = Object.freeze([
  ...[-12, -6, 6, 12].flatMap((x) => [-12, 12].map((z) => ({ x, z, radius: 1.25, kind: 'column' }))),
  ...[-8, 8].map((x) => ({ x, z: -15, radius: 0.8, kind: 'brazier' })),
]);
const COMBO = [
  { damage: 18, range: 1.9, stun: 0.12 },
  { damage: 26, range: 2.25, stun: 0.18 },
  { damage: 42, range: 2.8, stun: 0.32 },
];
// The Penkalas bow: a charged ranged option that trades stamina for reach.
// Aimed at the nearest enemy in front of the player, like the 2D build's
// Phrygian/Penkalas bows, but expressed as a real projectile so the 3D
// scene shows the shot travelling.
const BOW = Object.freeze({
  damage: 28,
  range: 16,
  speed: 15,
  radius: 0.34,
  cooldown: 0.62,
  staminaCost: 8,
  knockback: 0.55,
});
// Flanker tuning: the ring it orbits at, how long it orbits before it lunges,
// and how long the lunge lasts. Absolute seconds on the sim clock, so the
// rhythm is the same on a slow machine and a fast one.
const FLANKER_ORBIT = 5.5;
const FLANKER_ORBIT_MS = 1.4;
const FLANKER_LUNGE_MS = 0.32;
// How many minions a single summoner may have alive at once. The 2D build
// had the same cap; without it the wave grows without bound.
const MAX_SUMMONS_PER_CASTER = 3;
// The late-chapter archetypes drive their own state machines, so their tuning
// lives here with the other absolute-time constants.
const GARGOYLE_PERCH_RANGE = 9;
const GARGOYLE_SWOOP = 1;
const GARGOYLE_RECOVER = 1.3;
const GARGOYLE_REST = 1.5;
const GARGOYLE_CONTACT_RANGE = 1.5;
const BOMBER_FUSE = 0.9;
const BOMBER_BLAST_RADIUS = 3.2;
const SORCERER_WINDUP = 0.4;
const SORCERER_COOLDOWN = 2.6;
const SORCERER_RANGE = 14;
const SHIELDBEARER_RANGE = 1.9;
const SLIMEGOLEM_RANGE = 1.7;
// Archetypes whose windup is written by their own state machine instead of the
// generic windup path: short-circuiting them there would freeze the behaviour.
const SELF_DRIVEN_WINDUP = new Set(['flanker', 'gargoyle']);
// The descent has ten chapters. Clearing the tenth is the win condition;
// past that the run continues endlessly, the way the 2D build's endless
// mode did.
const FINAL_CHAPTER = 10;
// Exported so the runtime can label the victory screen.
export { FINAL_CHAPTER };
// A hard ceiling on live enemies, so a pathological wave can never tank the
// frame rate. The arena is a single screen, so this is generous.
const MAX_LIVE_ENEMIES = 40;
const ARCHETYPES = {
  chaser: { hp: 70, speed: 3.8, damage: 9, xp: 12, gold: 5 },
  archer: { hp: 55, speed: 3.1, damage: 8, xp: 15, gold: 7 },
  tank: { hp: 145, speed: 1.8, damage: 18, xp: 22, gold: 11 },
  summoner: { hp: 90, speed: 2.2, damage: 7, xp: 26, gold: 13 },
  flanker: { hp: 80, speed: 3.4, damage: 12, xp: 18, gold: 9 },
  boss: { hp: 650, speed: 2.7, damage: 24, xp: 150, gold: 80 },
  shieldbearer: { hp: 130, speed: 2.0, damage: 14, xp: 24, gold: 12 },
  gargoyle: { hp: 75, speed: 3.6, damage: 13, xp: 20, gold: 10 },
  sorcerer: { hp: 85, speed: 2.3, damage: 10, xp: 28, gold: 14 },
  slimegolem: { hp: 160, speed: 1.6, damage: 16, xp: 26, gold: 12 },
  bomber: { hp: 60, speed: 2.8, damage: 20, xp: 18, gold: 9 },
};

const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const normalizeSeed = (seed) => {
  const text = String(seed ?? 'dungeon');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
};
const random = (state) => {
  let value = state.rng >>> 0;
  value += 0x6d2b79f5;
  state.rng = value >>> 0;
  value = Math.imul(value ^ (value >>> 15), value | 1);
  value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
};
const direction = (from, to) => {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dz) || 1;
  return { x: dx / length, z: dz / length };
};
const resolveObstacleCollision = (unit, radius = 0.45) => {
  for (const obstacle of OBSTACLES) {
    const dx = unit.x - obstacle.x;
    const dz = unit.z - obstacle.z;
    const minimum = obstacle.radius + radius;
    const gap = Math.hypot(dx, dz);
    if (gap >= minimum) continue;
    const nx = gap > 1e-6 ? dx / gap : 1;
    const nz = gap > 1e-6 ? dz / gap : 0;
    unit.x = clamp(obstacle.x + nx * minimum, -ARENA_RADIUS, ARENA_RADIUS);
    unit.z = clamp(obstacle.z + nz * minimum, -ARENA_RADIUS, ARENA_RADIUS);
  }
};
const move = (unit, vector, speed, dt, radius = 0.45) => {
  unit.x = clamp(unit.x + vector.x * speed * dt, -ARENA_RADIUS, ARENA_RADIUS);
  unit.z = clamp(unit.z + vector.z * speed * dt, -ARENA_RADIUS, ARENA_RADIUS);
  resolveObstacleCollision(unit, radius);
};
// Events are a bounded ring that is trimmed from the front. A consumer that
// tracks its position by INDEX would drift every time the ring shifts, and
// would eventually stop seeing events at all. So every event carries a
// monotonic sequence number, and a consumer remembers the last sequence it
// saw: that stays correct no matter how the ring is trimmed.
const emitEvent = (state, event) => {
  state.eventSeq += 1;
  state.events.push({ ...event, seq: state.eventSeq });
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
};
const pruneHistory = (state) => {
  if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);
  if (state.loot.length > MAX_LOOT) state.loot.splice(0, state.loot.length - MAX_LOOT);
};

export function createGameState(seed = 'dungeon') {
  const initialSeed = normalizeSeed(seed);
  return {
    version: VERSION,
    seed: String(seed),
    rng: initialSeed,
    time: 0,
    accumulator: 0,
    nextId: 1,
    chapter: 1,
    mode: 'chapters',
    status: 'playing',
    player: {
      position: { x: 0, z: 0 },
      facing: { x: 1, z: 0 },
      hp: 100,
      maxHp: 100,
      stamina: 100,
      maxStamina: 100,
      xp: 0,
      xpToNext: 50,
      level: 1,
      gold: 0,
      combo: 0,
      comboExpires: 0,
      attackReadyAt: 0,
      dashCooldown: 0,
      dashCooldownMax: 1.2,
      dashRemaining: 0,
      dashDirection: { x: 1, z: 0 },
      bowReadyAt: 0,
      invulnerable: 0,
      damageMultiplier: 1,
      speedMultiplier: 1,
      attackSpeedMultiplier: 1,
      critChance: 0.05,
      critMultiplier: 1.6,
      damageTakenMultiplier: 1,
      lifesteal: 0,
      bowRangeMultiplier: 1,
      bowStaminaMultiplier: 1,
      dead: false,
      focusCharge: 0,
      rhythmWindow: 0,
      guardUntil: 0,
      guardReadyAt: 0,
      parryWindowUntil: 0,
      phantomUntil: 0,
      phantomBonusUntil: 0,
      specialCharge: 0,
      specialReadyAt: 0,
    },
    wave: { active: false, complete: false, rewarded: false, chapter: 1, scale: 1 },
    enemies: [],
    projectiles: [],
    chests: [],
    portal: { pending: false, position: null },
    loot: [],
    obstacles: OBSTACLES.map((item) => ({ ...item })),
    blessings: [],
    events: [],
    // The sequence number of the last emitted event. A consumer tracks what
    // it has seen by comparing sequence numbers, not by indexing the ring.
    eventSeq: 0,
    // The run ledger: what the player did this run. The 2D build showed these
    // on its RUN LEDGER screen; without a win condition there was nowhere to
    // show them, because the run never ended.
    stats: { kills: 0, bossKills: 0, chestCount: 0, shotsFired: 0, meleeSwings: 0, damageTaken: 0, blessings: 0 },
    inputLatch: { dash: false, attack: false, shoot: false, guard: false, special: false },
    assistTarget: null,
    assistTargetUntil: 0,
    targetLock: null,
    pendingSpawns: [],
    settings: { autoFireReserve: 25, heat: 0 },
    heat: 0,
    arena: 'column-ring',
    oaths: { selected: 'sword', unlocked: ['sword'] },
    marks: 0,
    runHistory: [],
    codex: { enemies: [], blessings: [], duos: [], bosses: [] },
  };
}

const scaledArchetype = (archetype, chapter, heat = 0) => {
  const base = ARCHETYPES[archetype];
  const endless = Math.max(0, chapter - 10);
  const scale = 1 + (chapter - 1) * 0.12 + endless * 0.08 + heat * 0.1;
  return {
    hp: Math.round(base.hp * scale),
    speed: base.speed * Math.min(1.6, 1 + (chapter - 1) * 0.012 + heat * 0.08),
    damage: Math.round(base.damage * (1 + (chapter - 1) * 0.1 + endless * 0.05 + heat * 0.06)),
    xp: Math.round(base.xp * scale),
    gold: Math.round(base.gold * Math.sqrt(scale)),
    scale,
  };
};

const ELITES = ['armored', 'swift', 'volatile', 'vampiric'];

const safeSpawnPosition = (state, radius) => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = random(state) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const gap = Math.hypot(x - state.player.position.x, z - state.player.position.z);
    if (gap >= 6) return { x, z };
  }
  const angle = random(state) * Math.PI * 2;
  return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
};

const ARENAS = Object.freeze([
  { id: 'column-ring', label: 'Column Ring', hazard: 'none' },
  { id: 'broken-bridge', label: 'Broken Bridge', hazard: 'slow-water' },
  { id: 'brazier-court', label: 'Brazier Court', hazard: 'burning-braziers' },
  { id: 'collapsing-tiles', label: 'Collapsing Tiles', hazard: 'falling-tiles' },
  { id: 'ruined-stairs', label: 'Ruined Stairs', hazard: 'raised-platform' },
]);

export function chooseArena(state, chapter = state.chapter) {
  const arena = ARENAS[(Math.floor(random(state) * ARENAS.length) + chapter - 1) % ARENAS.length];
  state.arena = arena.id;
  emitEvent(state, { type: 'arena', id: arena.id, hazard: arena.hazard, at: state.time });
  return arena;
}

const makeEnemy = (state, archetype, chapter, index, elite = null) => {
  const heat = state.heat || state.settings?.heat || 0;
  const stats = scaledArchetype(archetype, chapter, heat);
  const pos = safeSpawnPosition(state, 14 + random(state) * 3);
  const enemy = {
    id: `enemy-${state.nextId++}`,
    archetype,
    x: pos.x,
    z: pos.z,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    damage: stats.damage,
    xp: stats.xp,
    gold: stats.gold,
    attackCooldown: random(state) * 0.4,
    shootCooldown: archetype === 'archer' ? random(state) * 0.5 : 0,
    summonCooldown: archetype === 'summoner' ? 1.5 + random(state) : 0,
    sorcererCooldown: archetype === 'sorcerer' ? 2 + random(state) : 0,
    gargoyleState: archetype === 'gargoyle' ? 'perch' : undefined,
    stun: 0,
    windup: null,
    dead: false,
    intent: 'idle',
    phase: archetype === 'boss' ? 1 : undefined,
    spawnIndex: index,
    statuses: {},
    elite: elite || null,
    blocked: archetype === 'shieldbearer',
  };
  if (elite === 'armored') { enemy.hp = Math.round(enemy.hp * 1.5); enemy.maxHp = enemy.hp; }
  if (elite === 'swift') enemy.speed *= 1.3;
  return enemy;
};

export function spawnWave(state, chapter = state.chapter) {
  if (!Number.isInteger(chapter) || chapter < 1) throw new RangeError('Chapter must be a positive integer');
  state.chapter = chapter;
  state.mode = chapter > FINAL_CHAPTER ? 'endless' : 'chapters';
  if (chapter > 1 || !state.arena) chooseArena(state, chapter);
  const roles = [];
  if (chapter % 5 === 0) roles.push('chaser', 'archer', 'tank', 'summoner', 'flanker', 'boss');
  else {
    const pool = chapter < 3 ? ['chaser', 'chaser', 'archer']
      : chapter < 5 ? ['chaser', 'archer', 'tank', 'shieldbearer']
        : chapter < 7 ? ['chaser', 'archer', 'tank', 'summoner', 'flanker', 'gargoyle']
          : ['chaser', 'archer', 'tank', 'summoner', 'flanker', 'shieldbearer', 'gargoyle', 'sorcerer', 'slimegolem', 'bomber'];
    const count = Math.min(4 + chapter, 12);
    for (let i = 0; i < count; i += 1) roles.push(pool[Math.floor(random(state) * pool.length)]);
  }
  const scale = scaledArchetype('chaser', chapter, state.heat || 0).scale;
  // Never start a wave above the live-enemy ceiling: the arena is a single
  // screen, and a wave that cannot be fought is not a difficulty curve.
  const rolesCapped = roles.slice(0, MAX_LIVE_ENEMIES);
  if (chapter >= 5 && chapter % 5 !== 0 && !rolesCapped.includes('flanker')) {
    const idx = rolesCapped.findIndex((role) => role === 'chaser');
    if (idx >= 0) rolesCapped[idx] = 'flanker';
  }
  const heat = state.heat || state.settings?.heat || 0;
  const eliteBudget = chapter >= 3 ? Math.min(2, Math.floor((chapter - 1) / 2)) : 0;
  const elites = new Set();
  while (elites.size < eliteBudget && rolesCapped.length > 3) {
    elites.add(Math.floor(random(state) * rolesCapped.length));
  }
  state.enemies = [];
  state.pendingSpawns = rolesCapped.map((role, index) => {
    const elite = elites.has(index) ? ELITES[Math.floor(random(state) * ELITES.length)] : null;
    const pos = safeSpawnPosition(state, 14 + random(state) * 3);
    return {
      archetype: role, elite, index, x: pos.x, z: pos.z,
      spawnAt: state.time + 1, announced: false,
    };
  });
  state.projectiles = [];
  state.chests = [];
  state.portal = { pending: false, position: null };
  state.wave = { active: true, complete: false, rewarded: false, chapter, scale, total: rolesCapped.length };
  state.status = 'combat';
  emitEvent(state, { type: 'wave-start', chapter, count: rolesCapped.length, at: state.time });
  return state.pendingSpawns;
}

/**
 * A hit that lands feeds a vampiric elite. Elites were cosmetic before this:
 * `armored` and `swift` changed the numbers at spawn time, but nothing ever
 * read `elite === 'vampiric'`.
 */
const healVampiricAttacker = (state, source, amount) => {
  if (!source) return 0;
  const attacker = state.enemies.find((unit) => unit.id === source && !unit.dead);
  if (!attacker || attacker.elite !== 'vampiric') return 0;
  const healed = Math.min(attacker.maxHp - attacker.hp, Math.max(1, Math.round(amount * 0.5)));
  if (healed <= 0) return 0;
  attacker.hp += healed;
  emitEvent(state, { type: 'vampiric-drain', id: attacker.id, healed, at: state.time });
  return healed;
};

/**
 * The single place a run ends. Both the ordinary path and the guard-block path
 * go through it: the guard used to zero the player's health without ever
 * setting `status: 'defeat'` or emitting the death event, which left a run
 * that was dead but still marked as combat.
 */
const resolvePlayerDeath = (state) => {
  const player = state.player;
  if (player.dead || player.hp > 0) return false;
  player.dead = true;
  state.status = 'defeat';
  emitEvent(state, { type: 'player-death', at: state.time });
  return true;
};

const damagePlayer = (state, amount, source) => {
  const player = state.player;
  if (player.dead) return false;
  // Guard: parry window reflects, guard reduces.
  if (state.time < (player.parryWindowUntil || 0)) {
    const attacker = state.enemies.find((e) => e.id === source && !e.dead);
    if (attacker) {
      attacker.stun = Math.max(attacker.stun || 0, 0.8);
      if (attacker.windup?.kind === 'projectile' && state.projectiles.length) {
        const proj = state.projectiles.find((p) => p.ownerId === attacker.id && p.source === 'enemy');
        if (proj) { proj.source = 'player'; proj.ownerId = null; proj.damage = Math.round(amount); const aim = direction(state.player.position, attacker); proj.vx = aim.x * 15; proj.vz = aim.z * 15; }
      }
    }
    player.stamina = Math.min(player.maxStamina, player.stamina + 5);
    emitEvent(state, { type: 'parry', source, at: state.time });
    return false;
  }
  if (state.time < (player.guardUntil || 0)) {
    if (player.stamina <= 0) { /* guard breaks through */ } else {
      const taken = Math.max(1, Math.round(amount * player.damageTakenMultiplier * 0.4));
      player.hp = Math.max(0, player.hp - taken);
      player.stamina = Math.max(0, player.stamina - 10);
      if (state.stats) state.stats.damageTaken += taken;
      healVampiricAttacker(state, source, taken);
      emitEvent(state, { type: 'guard-block', source, damage: taken, at: state.time });
      resolvePlayerDeath(state);
      return true;
    }
  }
  if (player.invulnerable > 0) return false;
  const taken = Math.max(1, Math.round(amount * player.damageTakenMultiplier));
  player.hp = Math.max(0, player.hp - taken);
  player.invulnerable = 0.45;
  if (state.stats) state.stats.damageTaken += taken;
  healVampiricAttacker(state, source, taken);
  emitEvent(state, { type: 'player-hit', source, amount: taken, at: state.time });
  resolvePlayerDeath(state);
  return true;
};

const levelPlayer = (player) => {
  while (player.xp >= player.xpToNext) {
    player.xp -= player.xpToNext;
    player.level += 1;
    player.xpToNext = Math.round(player.xpToNext * 1.35);
    player.maxHp += 12;
    player.hp = Math.min(player.maxHp, player.hp + 20);
    player.maxStamina += 5;
    player.stamina = player.maxStamina;
    player.damageMultiplier += 0.05;
  }
};

const killEnemy = (state, target) => {
  if (target.dead) return;
  target.dead = true;
  target.hp = 0;
  // Slime golem splits into two small golems on death.
  if (target.archetype === 'slimegolem' && !target.summonedBy) {
    for (let i = 0; i < 2; i += 1) {
      if (state.enemies.filter((e) => !e.dead).length >= MAX_LIVE_ENEMIES) break;
      const minion = makeEnemy(state, 'chaser', state.chapter, state.enemies.length);
      minion.x = clamp(target.x + (i ? 0.8 : -0.8), -ARENA_RADIUS, ARENA_RADIUS);
      minion.z = target.z;
      minion.hp = Math.round(minion.hp * 0.35);
      minion.maxHp = minion.hp;
      minion.summonedBy = target.id;
      state.enemies.push(minion);
    }
  }
  // Volatile elite explodes with a telegraph-free small blast (dodge by distance).
  if (target.elite === 'volatile') {
    const player = state.player;
    if (Math.hypot(player.position.x - target.x, player.position.z - target.z) <= 2.5) {
      damagePlayer(state, Math.round(target.damage * 0.8), target.id);
    }
  }
  state.player.xp += target.xp;
  state.player.gold += target.gold;
  levelPlayer(state.player);
  state.loot.push({ id: `loot-${state.nextId++}`, kind: 'gold', amount: target.gold,
    x: target.x, z: target.z, collected: true });
  if (state.loot.length > MAX_LOOT) state.loot.splice(0, state.loot.length - MAX_LOOT);
  emitEvent(state, { type: 'enemy-death', id: target.id, at: state.time });
  if (state.stats) {
    state.stats.kills += 1;
    if (target.archetype === 'boss') state.stats.bossKills += 1;
  }
};

export function attack(state, targetId, manual = true) {
  const player = state.player;
  if (player.dead || state.time + 1e-9 < player.attackReadyAt) {
    return { hit: false, reason: 'cooldown', chain: player.combo || 1, damage: 0, range: 0 };
  }
  if (state.time > player.comboExpires) player.combo = 0;
  const chain = player.combo % 3 + 1;
  const strike = COMBO[chain - 1];
  const target = state.enemies.find((unit) => unit.id === targetId && !unit.dead);
  // A swing at an enemy that is out of reach does not happen: it must not
  // spend the cooldown, and it must not be counted as a swing. Otherwise the
  // player watches the cooldown bar move and nothing else.
  if (!target || distance(player.position, target) > strike.range) {
    return { hit: false, reason: 'out-of-range', chain, damage: 0, range: strike.range, crit: false };
  }
  player.combo = chain;
  player.comboExpires = state.time + 0.75;
  if (state.stats) state.stats.meleeSwings += 1;
  player.attackReadyAt = state.time
    + (chain === 3 ? 0.38 : 0.22) / Math.max(0.2, player.attackSpeedMultiplier);
  const crit = random(state) < player.critChance;
  let rhythm = false;
  if (manual && player.rhythmWindow > 0 && state.time - player.rhythmWindow <= 0.12) rhythm = true;
  const phantom = state.time < (player.phantomBonusUntil || 0);
  const damageMult = (rhythm ? 1.15 : 1) * (phantom ? 1.2 : 1);
  const damage = Math.round(strike.damage * player.damageMultiplier * damageMult * (crit ? player.critMultiplier : 1));
  const result = { hit: false, chain, damage, range: strike.range, crit, rhythm, phantom };
  const wasVulnerable = (target.stun || 0) > 0.05 || target.windup;
  target.hp = Math.max(0, target.hp - damage);
  target.stun = Math.max(target.stun || 0, strike.stun);
  result.hit = true;
  // Shieldbearer frontal block: halved unless vulnerable (stunned/windup) or phantom.
  if (target.blocked && !wasVulnerable && !phantom) {
    const blockedAmount = Math.round(damage / 2);
    target.hp = Math.min(target.maxHp, target.hp + blockedAmount);
    result.blocked = blockedAmount;
    emitEvent(state, { type: 'shield-block', id: target.id, at: state.time });
  }
  player.specialCharge = Math.min(100, (player.specialCharge || 0) + Math.round(damage * 0.4));
  // Combo finisher: third swing sends a short crescent wave.
  if (chain === 3) {
    for (const other of state.enemies) {
      if (other.dead || other.id === target.id) continue;
      if (Math.hypot(other.x - player.position.x, other.z - player.position.z) <= strike.range * 1.4) {
        other.hp = Math.max(0, other.hp - Math.round(damage * 0.5));
        other.stun = Math.max(other.stun || 0, 0.4);
        if (other.hp === 0) killEnemy(state, other);
      }
    }
    emitEvent(state, { type: 'crescent', at: state.time });
  }
  if (player.lifesteal > 0) {
    const healed = Math.max(1, Math.round(damage * player.lifesteal));
    player.hp = Math.min(player.maxHp, player.hp + healed);
    result.healed = healed;
  }
  // Bloodrite duo: critical hits drink a flat share of Aizo's maximum health.
  // The duo used to be fiction: it unlocked, it showed in the codex, and it
  // changed nothing.
  if (crit && (state.duos || []).includes('bloodrite')) {
    const healed = Math.max(1, Math.round(player.maxHp * 0.04));
    player.hp = Math.min(player.maxHp, player.hp + healed);
    result.bloodrite = healed;
    emitEvent(state, { type: 'bloodrite', healed, at: state.time });
  }
  if (rhythm) {
    player.stamina = Math.min(player.maxStamina, player.stamina + 3);
    emitEvent(state, { type: 'rhythm', at: state.time });
  }
  player.rhythmWindow = state.time + (chain === 3 ? 0.38 : 0.22) / Math.max(0.2, player.attackSpeedMultiplier);
  emitEvent(state, { type: 'melee-hit', id: target.id, chain, damage, crit, at: state.time });
  if (target.hp === 0) killEnemy(state, target);
  return result;
}

const fireProjectile = (state, enemy, options = {}) => {
  const aim = direction(enemy, state.player.position);
  state.projectiles.push({
    id: `projectile-${state.nextId++}`,
    ownerId: enemy.id,
    source: 'enemy',
    x: enemy.x,
    z: enemy.z,
    vx: aim.x * (options.speed || 8),
    vz: aim.z * (options.speed || 8),
    damage: options.damage ?? enemy.damage,
    ttl: options.ttl || 3,
    radius: options.radius || 0.32,
    kind: options.kind || 'shot',
  });
};

/**
 * Aim the bow at the enemy the player is most plausibly shooting at: the
 * closest living enemy inside the bow's reach, preferring ones in front of
 * the player's facing so the shot reads as aimed rather than random.
 */
const findBowTarget = (state) => {
  const player = state.player;
  const facing = player.facing;
  // A target the player locked by hand wins whenever it is in reach: the shot
  // has to go where the player aimed, not where the scoring function prefers.
  if (state.targetLock) {
    const locked = state.enemies.find((enemy) => enemy.id === state.targetLock && !enemy.dead);
    if (locked && distance(locked, player.position) <= BOW.range * player.bowRangeMultiplier) return locked;
  }
  let best = null;
  let bestScore = Infinity;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const gap = distance(enemy, player.position);
    if (gap > BOW.range * player.bowRangeMultiplier) continue;
    // Dot product of the facing vector with the direction to the enemy:
    // 1 is dead ahead, -1 is directly behind.
    const toward = direction(player.position, enemy);
    const alignment = toward.x * facing.x + toward.z * facing.z;
    const score = gap - alignment * 4;
    if (score < bestScore) { bestScore = score; best = enemy; }
  }
  return best;
};

/**
 * Loose a bow shot at the current target. Returns a truthful result so the
 * runtime can show a distinct "no target" or "not ready" message instead of
 * pretending every pull of the string did something.
 */
export function shoot(state, options = {}) {
  const player = state.player;
  if (player.dead) return { fired: false, reason: 'dead' };
  if (state.time + 1e-9 < player.bowReadyAt) return { fired: false, reason: 'cooldown' };
  const focus = Boolean(options.focus) || player.focusCharge >= 0.6;
  const staminaCostBase = Math.max(1, Math.round(BOW.staminaCost * player.bowStaminaMultiplier));
  const staminaCost = focus ? Math.round(staminaCostBase * 1.5) : staminaCostBase;
  if (player.stamina < staminaCost) return { fired: false, reason: 'stamina' };
  const target = findBowTarget(state);
  if (!target) return { fired: false, reason: 'no-target' };
  player.stamina -= staminaCost;
  player.bowReadyAt = state.time + BOW.cooldown;
  const aim = direction(player.position, target);
  const crit = random(state) < player.critChance;
  const damageBase = focus ? BOW.damage * 2.2 : BOW.damage;
  const damage = Math.round(damageBase * player.damageMultiplier * (crit ? player.critMultiplier : 1));
  state.projectiles.push({
    id: `projectile-${state.nextId++}`,
    ownerId: target.id,
    source: 'player',
    x: player.position.x + aim.x * 0.6,
    z: player.position.z + aim.z * 0.6,
    vx: aim.x * BOW.speed,
    vz: aim.z * BOW.speed,
    damage,
    crit,
    knockback: BOW.knockback,
    ttl: 2,
    radius: BOW.radius,
    pierce: (focus ? 1 : 0) + (crit && (state.duos || []).includes('eagles-mark') ? 1 : 0),
    hitIds: [],
  });
  player.specialCharge = Math.min(100, (player.specialCharge || 0) + Math.round(damage * 0.3));
  emitEvent(state, { type: 'bow-shot', id: target.id, damage, crit, at: state.time });
  if (focus) emitEvent(state, { type: 'focus-shot', at: state.time });
  if (state.stats) state.stats.shotsFired += 1;
  player.focusCharge = 0;
  return { fired: true, targetId: target.id, damage, crit, focus };
}

const beginWindup = (state, enemy, kind, duration, range, telegraph) => {
  // `range` is the reach the attack needs to stay valid; `telegraph` is the
  // ground marker the runtime draws. They are not the same number: an archer
  // needs ten units of reach but its windup ring belongs at its own feet, and
  // a ten-unit ring painted the whole arena.
  enemy.windup = { kind, remaining: duration, duration, range, telegraph: telegraph ?? range };
  emitEvent(state, { type: 'attack-telegraph', id: enemy.id, archetype: enemy.archetype,
    attack: kind, duration, at: state.time });
};

const summonMinion = (state, enemy) => {
  // The 2D build capped the summons a single caster could have alive
  // (MAX_SUMMONS_PER_CASTER = 3). Without a cap the summoner grows the wave
  // without bound: a lone caster reached 60 live enemies in two minutes.
  const liveMinions = state.enemies.filter((unit) => !unit.dead && unit.summonedBy === enemy.id).length;
  if (liveMinions >= MAX_SUMMONS_PER_CASTER) return false;
  const minion = makeEnemy(state, 'chaser', state.chapter, state.enemies.length);
  minion.x = clamp(enemy.x + 1, -ARENA_RADIUS, ARENA_RADIUS);
  minion.z = enemy.z;
  minion.hp = Math.round(minion.hp * 0.55);
  minion.maxHp = minion.hp;
  minion.xp = Math.round(minion.xp * 0.4);
  minion.gold = Math.round(minion.gold * 0.4);
  minion.summonedBy = enemy.id;
  resolveObstacleCollision(minion);
  state.enemies.push(minion);
  emitEvent(state, { type: 'summon', id: enemy.id, minion: minion.id, at: state.time });
  return true;
};

/**
 * A bomber's fuse is a fixed clock: nothing the player does to distance
 * themselves cancels it, and the blast consumes the bomber. Dying to its own
 * blast pays no kill reward, which is what makes killing it early worth the
 * risk of walking into range.
 */
const detonateBomber = (state, enemy) => {
  enemy.windup = null;
  enemy.dead = true;
  enemy.hp = 0;
  const player = state.player;
  const gap = Math.hypot(player.position.x - enemy.x, player.position.z - enemy.z);
  emitEvent(state, { type: 'bomber-detonate', id: enemy.id, radius: BOMBER_BLAST_RADIUS, at: state.time });
  if (gap <= BOMBER_BLAST_RADIUS) damagePlayer(state, enemy.damage, enemy.id);
  emitEvent(state, { type: 'enemy-death', id: enemy.id, at: state.time });
};

const resolveWindup = (state, enemy, gap) => {
  const windup = enemy.windup;
  if (!windup) return false;
  if (enemy.stun > 0 || (!windup.fixed && gap > windup.range)) {
    enemy.windup = null;
    return true;
  }
  if (windup.remaining > 0) return true;
  enemy.windup = null;
  if (windup.kind === 'projectile') {
    fireProjectile(state, enemy);
    enemy.shootCooldown = 1.35;
  } else if (windup.kind === 'spell') {
    fireProjectile(state, enemy, {
      speed: 6.2,
      damage: Math.round(enemy.damage * 1.4),
      radius: 0.44,
      kind: 'spell',
    });
    enemy.sorcererCooldown = SORCERER_COOLDOWN;
    enemy.shootCooldown = SORCERER_COOLDOWN;
  } else if (windup.kind === 'detonate') {
    detonateBomber(state, enemy);
  } else if (windup.kind === 'summon') {
    summonMinion(state, enemy);
    enemy.summonCooldown = 4.5;
  } else {
    const multiplier = enemy.archetype === 'boss' ? 1 + ((enemy.phase || 1) - 1) * 0.35 : 1;
    damagePlayer(state, Math.round(enemy.damage * multiplier), enemy.id);
    // The cooldown is spent whether or not the blow connects. Tying it to a
    // landed hit let a dodging player be attacked again on the very next tick,
    // because the windup restarted from a zero cooldown.
    enemy.attackCooldown = enemy.archetype === 'boss' ? (enemy.phase === 3 ? 0.55 : 1)
      : enemy.archetype === 'tank' ? 1.4
        : enemy.archetype === 'slimegolem' ? 1.6
          : enemy.archetype === 'shieldbearer' ? 1.1
            : 0.8;
  }
  return true;
};

/**
 * The flanker (the 3D counterpart of the 2D build's Styx Ferryman): it orbits
 * the player at a readable distance, then commits to one lunging dash and
 * returns to the orbit. The 2D version used absolute deadlines on the scene
 * clock, so a slow machine orbits for the same wall-clock time as a fast one
 * instead of counting frames; this keeps that property.
 */
const updateFlanker = (state, enemy, gap, dt) => {
  const player = state.player;
  const orbit = enemy.orbit || (enemy.orbit = { phase: 'idle', until: 0, dir: 1 });
  const ideal = FLANKER_ORBIT;
  const toward = direction(enemy, player.position);

  if (orbit.phase === 'idle') {
    // Too far or uncomfortably close: close the distance straight on.
    if (gap < ideal * 0.6 || gap > ideal * 1.8) {
      enemy.intent = 'close';
      move(enemy, toward, enemy.speed, dt);
      return;
    }
    orbit.phase = 'orbit';
    orbit.until = state.time + FLANKER_ORBIT_MS;
    orbit.dir = random(state) < 0.5 ? -1 : 1;
    enemy.intent = 'orbit';
    return;
  }

  if (orbit.phase === 'orbit') {
    // Tangential motion around the player plus a radial correction that pulls
    // the flanker back to its ideal ring. The radial term has to dominate the
    // tangential one, otherwise the flanker spirals outward and never comes
    // back to a readable distance.
    const angle = Math.atan2(player.position.z - enemy.z, player.position.x - enemy.x);
    const tangential = angle + (Math.PI / 2) * orbit.dir;
    // `angle` points from the flanker toward the player, so the radial term
    // must be positive when the flanker is too far (gap > ideal): that pulls
    // it in. The sign here is what keeps the ring stable.
    const radial = (gap - ideal) * 2.4;
    const vector = {
      x: Math.cos(tangential) * 0.6 + Math.cos(angle) * radial,
      z: Math.sin(tangential) * 0.6 + Math.sin(angle) * radial,
    };
    const length = Math.hypot(vector.x, vector.z) || 1;
    move(enemy, { x: vector.x / length, z: vector.z / length }, enemy.speed, dt);
    enemy.intent = 'orbit';
    if (state.time >= orbit.until) {
      orbit.phase = 'lunge';
      orbit.until = state.time + FLANKER_LUNGE_MS;
      enemy.intent = 'lunge';
      // The lunge is a committed dash: it is fast, and it is telegraphed by a
      // windup the runtime draws as a ground ring.
      enemy.lungeDirection = { ...toward };
      enemy.windup = {
        kind: 'melee',
        remaining: FLANKER_LUNGE_MS * 0.5,
        duration: FLANKER_LUNGE_MS * 0.5,
        range: 1.6,
      };
    }
    return;
  }

  // Lunge: one committed dash along the locked direction, then back to orbit.
  const dash = enemy.lungeDirection || toward;
  move(enemy, dash, enemy.speed * 2.6, dt);
  // The dash itself is the attack: it connects when it reaches the player.
  if (gap <= 1.6) damagePlayer(state, enemy.damage, enemy.id);
  if (enemy.windup) {
    enemy.windup.remaining = Math.max(0, enemy.windup.remaining - dt);
    if (enemy.windup.remaining <= 0) enemy.windup = null;
  }
  if (state.time >= orbit.until) {
    orbit.phase = 'idle';
    orbit.until = 0;
    enemy.intent = 'idle';
  }
};

/**
 * The gargoyle hunts in bursts: it waits on its perch until the player comes
 * within reach, commits to one fast swoop, and then has to recover before it
 * can swoop again. The state machine runs on absolute sim-clock deadlines, so
 * a slow machine swoops for the same amount of game time as a fast one.
 */
const updateGargoyle = (state, enemy, gap, dt) => {
  const phase = enemy.gargoyleState || (enemy.gargoyleState = 'perch');
  const until = enemy.gargoyleUntil || 0;
  if (phase === 'perch') {
    enemy.intent = 'perch';
    if (gap <= GARGOYLE_PERCH_RANGE && state.time >= (enemy.gargoyleReadyAt || 0)) {
      enemy.gargoyleState = 'swoop';
      enemy.gargoyleUntil = state.time + GARGOYLE_SWOOP;
      enemy.intent = 'swoop';
      // The swoop is telegraphed by the same ground ring every other attack
      // uses, so the player can read it.
      beginWindup(state, enemy, 'melee', GARGOYLE_SWOOP, GARGOYLE_PERCH_RANGE, GARGOYLE_CONTACT_RANGE * 2);
    }
    return;
  }
  if (phase === 'swoop') {
    enemy.intent = 'swoop';
    move(enemy, direction(enemy, state.player.position), enemy.speed * 2.2, dt, 0.5);
    const contact = distance(enemy, state.player.position);
    if (contact <= GARGOYLE_CONTACT_RANGE && (enemy.attackCooldown || 0) <= 0) {
      enemy.attackCooldown = 1.2;
      enemy.gargoyleState = 'recover';
      enemy.gargoyleUntil = state.time + GARGOYLE_RECOVER;
      enemy.gargoyleReadyAt = state.time + GARGOYLE_RECOVER + GARGOYLE_REST;
      enemy.windup = null;
      damagePlayer(state, enemy.damage, enemy.id);
      return;
    }
    if (state.time >= until) {
      enemy.gargoyleState = 'recover';
      enemy.gargoyleUntil = state.time + GARGOYLE_RECOVER;
      enemy.gargoyleReadyAt = state.time + GARGOYLE_RECOVER + GARGOYLE_REST;
      enemy.windup = null;
    }
    return;
  }
  // Recover: it circles out of reach before it can perch again.
  enemy.intent = 'recover';
  move(enemy, { x: -direction(enemy, state.player.position).x, z: -direction(enemy, state.player.position).z },
    enemy.speed * 0.5, dt, 0.5);
  if (state.time >= until) {
    enemy.gargoyleState = 'perch';
    enemy.gargoyleUntil = 0;
  }
};

const updateEnemy = (state, enemy, dt) => {
  if (enemy.dead) return;
  enemy.stun = Math.max(0, (enemy.stun || 0) - dt);
  enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - dt);
  enemy.shootCooldown = Math.max(0, (enemy.shootCooldown || 0) - dt);
  enemy.summonCooldown = Math.max(0, (enemy.summonCooldown || 0) - dt);
  enemy.sorcererCooldown = Math.max(0, (enemy.sorcererCooldown || 0) - dt);
  if (enemy.stun > 0) {
    enemy.windup = null;
    enemy.intent = 'stunned';
    return;
  }
  const player = state.player;
  const gap = distance(enemy, player.position);
  // The flanker and the gargoyle drive their own windup: their window is the
  // telegraph and the action at once, so the generic path must not take over.
  if (enemy.windup && !SELF_DRIVEN_WINDUP.has(enemy.archetype)) {
    enemy.windup.remaining = Math.max(0, enemy.windup.remaining - dt);
    resolveWindup(state, enemy, gap);
    return;
  }
  const toward = direction(enemy, player.position);
  const away = { x: -toward.x, z: -toward.z };
  if (enemy.archetype === 'chaser') {
    enemy.intent = gap > 1.25 ? 'pursue' : 'strike';
    if (gap > 1.25) move(enemy, toward, enemy.speed, dt);
    else if (enemy.attackCooldown <= 0) beginWindup(state, enemy, 'melee', NORMAL_WINDUP, 1.4);
  } else if (enemy.archetype === 'archer') {
    enemy.intent = gap < 4 ? 'kite' : gap > 8 ? 'advance' : 'shoot';
    if (gap < 4) move(enemy, away, enemy.speed, dt);
    else if (gap > 8) move(enemy, toward, enemy.speed * 0.65, dt);
    if (gap >= 4 && gap <= 10 && enemy.shootCooldown <= 0) beginWindup(state, enemy, 'projectile', NORMAL_WINDUP, 10, 1.4);
  } else if (enemy.archetype === 'tank') {
    enemy.intent = gap <= 1.6 ? 'slam' : 'guard';
    if (gap > 1.6) move(enemy, toward, enemy.speed, dt, 0.6);
    else if (enemy.attackCooldown <= 0) beginWindup(state, enemy, 'slam', NORMAL_WINDUP, 1.8);
  } else if (enemy.archetype === 'summoner') {
    enemy.intent = 'summon';
    if (gap < 5) move(enemy, away, enemy.speed * 0.5, dt);
    if (gap <= 12 && enemy.summonCooldown <= 0) beginWindup(state, enemy, 'summon', NORMAL_WINDUP, 12, 1.6);
  } else if (enemy.archetype === 'flanker') {
    updateFlanker(state, enemy, gap, dt);
  } else if (enemy.archetype === 'shieldbearer') {
    // It walks in behind its shield (the `blocked` flag halves frontal hits in
    // attack()) and bashes once it is close enough.
    enemy.blocked = true;
    enemy.intent = gap <= SHIELDBEARER_RANGE ? 'bash' : 'advance';
    if (gap > SHIELDBEARER_RANGE) move(enemy, toward, enemy.speed, dt, 0.55);
    else if (enemy.attackCooldown <= 0) beginWindup(state, enemy, 'bash', 0.3, SHIELDBEARER_RANGE + 0.2);
  } else if (enemy.archetype === 'gargoyle') {
    updateGargoyle(state, enemy, gap, dt);
  } else if (enemy.archetype === 'sorcerer') {
    // It holds a casting distance: backs off when crowded, closes when out of
    // range, and lobs a heavier bolt than the skeletal archer.
    enemy.intent = 'cast';
    if (gap < 6) move(enemy, away, enemy.speed, dt);
    else if (gap > 11) move(enemy, toward, enemy.speed * 0.7, dt);
    if (gap <= SORCERER_RANGE && enemy.sorcererCooldown <= 0) {
      beginWindup(state, enemy, 'spell', SORCERER_WINDUP, SORCERER_RANGE, 1.4);
    }
  } else if (enemy.archetype === 'slimegolem') {
    // Slow, heavy, and it hits like a falling wall. It splits when it dies.
    enemy.intent = gap <= SLIMEGOLEM_RANGE ? 'engulf' : 'ooze';
    if (gap > SLIMEGOLEM_RANGE) move(enemy, toward, enemy.speed, dt, 0.6);
    else if (enemy.attackCooldown <= 0) beginWindup(state, enemy, 'engulf', 0.35, SLIMEGOLEM_RANGE + 0.3);
  } else if (enemy.archetype === 'bomber') {
    // It rushes in and lights a fuse it cannot put out.
    enemy.intent = gap <= BOMBER_BLAST_RADIUS ? 'fuse' : 'rush';
    if (gap > 1.4) move(enemy, toward, enemy.speed, dt);
    if (gap <= BOMBER_BLAST_RADIUS && enemy.attackCooldown <= 0 && !enemy.windup) {
      beginWindup(state, enemy, 'detonate', BOMBER_FUSE, BOMBER_BLAST_RADIUS);
      enemy.windup.fixed = true;
    }
  } else if (enemy.archetype === 'boss') {
    const ratio = enemy.hp / enemy.maxHp;
    enemy.phase = ratio <= 0.25 ? 3 : ratio < 0.5 ? 2 : 1;
    enemy.intent = enemy.phase === 3 ? 'enrage' : enemy.phase === 2 ? 'charge' : 'hunt';
    const speed = enemy.speed * (enemy.phase === 3 ? 1.65 : enemy.phase === 2 ? 1.3 : 1);
    if (gap > 1.8) move(enemy, toward, speed, dt, 0.8);
    else if (enemy.attackCooldown <= 0) beginWindup(state, enemy, 'boss-slam', BOSS_WINDUP, 2.1);
  }
};

const updateProjectiles = (state, dt) => {
  for (const shot of state.projectiles) {
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    shot.ttl -= dt;
    if (shot.ttl <= 0) continue;
    if (shot.source === 'player') {
      if (!Array.isArray(shot.hitIds)) shot.hitIds = [];
      // The arrow hits the first enemy it touches (not only ownerId). ownerId
      // is the intended target for aim only.
      const target = state.enemies.find((enemy) => !enemy.dead && !shot.hitIds.includes(enemy.id)
        && distance(shot, enemy) <= shot.radius + 0.55);
      if (target) {
        shot.hitIds.push(target.id);
        target.hp = Math.max(0, target.hp - shot.damage);
        target.stun = Math.max(target.stun || 0, 0.1);
        if (state.player.lifesteal > 0) {
          const healed = Math.max(1, Math.round(shot.damage * state.player.lifesteal));
          state.player.hp = Math.min(state.player.maxHp, state.player.hp + healed);
        }
        if (shot.knockback) {
          const push = direction(shot, target);
          target.x = clamp(target.x + push.x * shot.knockback, -ARENA_RADIUS, ARENA_RADIUS);
          target.z = clamp(target.z + push.z * shot.knockback, -ARENA_RADIUS, ARENA_RADIUS);
          resolveObstacleCollision(target);
        }
        emitEvent(state, { type: 'bow-hit', id: target.id, damage: shot.damage, crit: !!shot.crit, at: state.time });
        if (target.hp === 0) killEnemy(state, target);
        if ((shot.pierce || 0) > 0) {
          shot.pierce -= 1;
        } else {
          shot.ttl = 0;
        }
      }
    } else if (distance(shot, state.player.position) <= shot.radius + 0.45) {
      damagePlayer(state, shot.damage, shot.ownerId);
      shot.ttl = 0;
    }
  }
  state.projectiles = state.projectiles.filter((shot) => shot.ttl > 0);
};

const separateEntities = (state) => {
  const alive = state.enemies.filter((enemy) => !enemy.dead);
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const a = alive[i];
      const b = alive[j];
      let dx = b.x - a.x;
      let dz = b.z - a.z;
      const gap = Math.hypot(dx, dz);
      const minimum = 0.75;
      if (gap >= minimum) continue;
      let nx;
      let nz;
      let correction;
      if (gap < 1e-6) {
        nx = (i + j) % 2 ? 1 : -1;
        nz = 0;
        correction = minimum / 2;
      } else {
        nx = dx / gap;
        nz = dz / gap;
        correction = (minimum - gap) / 2;
      }
      a.x = clamp(a.x - nx * correction, -ARENA_RADIUS, ARENA_RADIUS);
      a.z = clamp(a.z - nz * correction, -ARENA_RADIUS, ARENA_RADIUS);
      b.x = clamp(b.x + nx * correction, -ARENA_RADIUS, ARENA_RADIUS);
      b.z = clamp(b.z + nz * correction, -ARENA_RADIUS, ARENA_RADIUS);
      resolveObstacleCollision(a);
      resolveObstacleCollision(b);
    }
  }
};

const rewardPosition = (state) => {
  const position = {
    x: clamp(state.player.position.x + 2, -REWARD_BOUNDARY, REWARD_BOUNDARY),
    z: clamp(state.player.position.z, -REWARD_BOUNDARY, REWARD_BOUNDARY),
  };
  resolveObstacleCollision(position, 0.7);
  position.x = clamp(position.x, -REWARD_BOUNDARY, REWARD_BOUNDARY);
  position.z = clamp(position.z, -REWARD_BOUNDARY, REWARD_BOUNDARY);
  return position;
};

const RARITY_WEIGHTS = (chapter) => {
  const bonus = Math.min(20, (chapter - 1) * 2);
  return [
    ['common', 60], ['rare', 28], ['epic', 10 + bonus * 0.4], ['mythic', 2 + bonus * 0.1],
  ];
};

const rollRarity = (state, chapter) => {
  const table = RARITY_WEIGHTS(chapter);
  const total = table.reduce((sum, [, w]) => sum + w, 0);
  let roll = random(state) * total;
  for (const [name, weight] of table) { roll -= weight; if (roll <= 0) return name; }
  return 'common';
};

const completeWave = (state) => {
  if (!state.wave.active || state.wave.rewarded) return;
  if (state.enemies.some((enemy) => !enemy.dead)) return;
  if ((state.pendingSpawns || []).length) return;
  state.wave.active = false;
  state.wave.complete = true;
  state.wave.rewarded = true;
  state.status = 'reward';
  const amount = Math.round(12 + state.wave.chapter * 4 + random(state) * 12);
  const owned = new Set(state.blessings);
  const levels = state.blessingLevels || (state.blessingLevels = {});
  const pool = BLESSING_IDS.filter((id) => (levels[id] || 0) < 3);
  const choices = [];
  const used = new Set();
  for (let i = 0; i < 3 && pool.length; i += 1) {
    const candidates = pool.filter((id) => !used.has(id));
    if (!candidates.length) break;
    const id = candidates[Math.floor(random(state) * candidates.length)];
    used.add(id);
    choices.push({ id, rarity: rollRarity(state, state.wave.chapter), level: (levels[id] || 0) + 1 });
  }
  const primary = choices[0]?.id || null;
  const fallback = primary ? null : (state.player.hp < state.player.maxHp
    ? { kind: 'heal', amount: Math.min(30, state.player.maxHp - state.player.hp), label: 'Restored health' }
    : { kind: 'gold', amount: Math.round(18 + state.wave.chapter * 3), label: 'Bonus gold' });
  const shop = [0, 1, 2].map((slot) => {
    const kind = ['heal', 'reroll', 'relic'][slot];
    const price = Math.round((kind === 'heal' ? 30 : kind === 'reroll' ? 25 : 60) * (1 + state.wave.chapter * 0.15));
    return { slot, kind, price, sold: false };
  });
  const chest = { id: `chest-${state.nextId++}`, opened: false, gold: amount, blessing: primary,
    choices, fallback, shop, rerolls: 1, position: rewardPosition(state), reachable: true };
  state.chests.push(chest);
  emitEvent(state, { type: 'wave-complete', chapter: state.wave.chapter, chest: chest.id, at: state.time });
};

const fixedUpdate = (state, input, dt) => {
  state.time += dt;
  // Materialize telegraphed spawns whose portal timer elapsed.
  if ((state.pendingSpawns || []).length) {
    const due = state.pendingSpawns.filter((spawn) => state.time >= spawn.spawnAt);
    if (due.length) {
      state.pendingSpawns = state.pendingSpawns.filter((spawn) => state.time < spawn.spawnAt);
      for (const spawn of due) {
        if (state.enemies.filter((e) => !e.dead).length >= MAX_LIVE_ENEMIES) break;
        const enemy = makeEnemy(state, spawn.archetype, state.chapter, spawn.index, spawn.elite || null);
        enemy.x = spawn.x; enemy.z = spawn.z;
        state.enemies.push(enemy);
        emitEvent(state, { type: 'enemy-spawn', id: enemy.id, archetype: enemy.archetype, at: state.time });
      }
    } else {
      for (const spawn of state.pendingSpawns) {
        if (!spawn.announced) {
          spawn.announced = true;
          emitEvent(state, { type: 'spawn-portal', archetype: spawn.archetype, x: spawn.x, z: spawn.z, at: state.time });
        }
      }
    }
  }
  const player = state.player;
  player.invulnerable = Math.max(0, player.invulnerable - dt);
  player.dashCooldown = Math.max(0, player.dashCooldown - dt);
  player.stamina = Math.min(player.maxStamina, player.stamina + 18 * dt);
  const rawX = finite(input.moveX) ? clamp(input.moveX, -1, 1) : 0;
  const rawZ = finite(input.moveZ) ? clamp(input.moveZ, -1, 1) : 0;
  const length = Math.hypot(rawX, rawZ);
  const vector = length > 0 ? { x: rawX / Math.max(1, length), z: rawZ / Math.max(1, length) }
    : { x: 0, z: 0 };
  if (length > 0) player.facing = { ...vector };
  const dashPressed = Boolean(input.dash) && !state.inputLatch.dash;
  state.inputLatch.dash = Boolean(input.dash);
  let speed = 5.2 * player.speedMultiplier;
  const dashDir = length > 0 ? vector : (player.facing ? { ...player.facing } : { x: 1, z: 0 });
  if (dashPressed && player.dashCooldown <= 0 && player.stamina >= 25) {
    player.stamina -= 25;
    player.dashCooldown = player.dashCooldownMax;
    player.dashRemaining = DASH_DURATION;
    player.dashDirection = { ...dashDir };
    player.invulnerable = Math.max(player.invulnerable, 0.28);
    // Phantom Step: dashing through the last 0.15s of a telegraph.
    const phasing = state.enemies.some((e) => !e.dead && e.windup && e.windup.remaining <= 0.15 && e.windup.remaining > 0
      && Math.hypot(e.x - player.position.x, e.z - player.position.z) <= (e.windup.range || 3) + 1);
    if (phasing) {
      player.dashCooldown = 0;
      player.stamina = Math.min(player.maxStamina, player.stamina + 10);
      player.phantomUntil = state.time + 0.35;
      player.phantomBonusUntil = state.time + 3;
      emitEvent(state, { type: 'phantom-step', at: state.time });
    }
    emitEvent(state, { type: 'dash', at: state.time });
    // Gale dancer duo: the dash cuts what it passes through, once per dash.
    if ((state.duos || []).includes('gale-dancer')) state.dashHits = [];
  }
  // Guard / parry (new button): 0.35s guard, first 0.12s parries.
  const guardPressed = Boolean(input.guard) && !state.inputLatch.guard;
  state.inputLatch.guard = Boolean(input.guard);
  if (guardPressed && state.time >= (player.guardReadyAt || 0) && player.stamina > 0) {
    player.guardUntil = state.time + 0.35;
    player.parryWindowUntil = state.time + 0.12;
    player.guardReadyAt = state.time + 0.8;
    emitEvent(state, { type: 'guard', at: state.time });
  }
  // Special ability (E): Wrath of the Temple shockwave.
  const specialPressed = Boolean(input.special) && !state.inputLatch.special;
  state.inputLatch.special = Boolean(input.special);
  if (specialPressed) fireSpecial(state);
  const dashActive = player.dashRemaining > 0;
  const movement = dashActive ? player.dashDirection : vector;
  if (dashActive) {
    speed = 13;
    player.dashRemaining = Math.max(0, player.dashRemaining - dt);
  }
  const playerUnit = { x: player.position.x, z: player.position.z };
  move(playerUnit, movement, speed, dt);
  player.position.x = playerUnit.x;
  player.position.z = playerUnit.z;
  // The gale dancer duo turns the dash into an attack: every enemy the dash
  // brushes takes damage, once. Without this the duo was a label on a card.
  if (dashActive && (state.duos || []).includes('gale-dancer')) {
    const struck = state.dashHits || (state.dashHits = []);
    for (const enemy of [...state.enemies]) {
      if (enemy.dead || struck.includes(enemy.id)) continue;
      if (Math.hypot(enemy.x - player.position.x, enemy.z - player.position.z) > 1.6) continue;
      struck.push(enemy.id);
      const damage = Math.round(12 * player.damageMultiplier);
      enemy.hp = Math.max(0, enemy.hp - damage);
      enemy.stun = Math.max(enemy.stun || 0, 0.1);
      emitEvent(state, { type: 'dash-trail', id: enemy.id, damage, at: state.time });
      if (enemy.hp === 0) killEnemy(state, enemy);
    }
  }
  // Focus charge tracking for Focus Shot.
  if (input.shoot) player.focusCharge = (player.focusCharge || 0) + dt; else player.focusCharge = 0;
  // Assist / auto flags.
  const autoAttack = Boolean(input.autoAttack);
  const autoShoot = Boolean(input.autoShoot);
  const lockTarget = input.lockTarget || null;
  if (lockTarget !== (state.targetLock || null)) {
    state.targetLock = lockTarget;
    emitEvent(state, { type: 'target-lock', id: lockTarget, at: state.time });
  }
  // One target selector for the whole game: pickTarget() owns the sticky
  // target, the threat weighting and the manual lock. This loop used to carry
  // its own copy of that scoring, which had the lock weighting inverted.
  const target = pickTarget(state, lockTarget);
  const attackPressed = Boolean(input.attack) || autoAttack;
  if (target && attackPressed) {
    tryMelee(state, target, { auto: autoAttack && !input.attack });
  }
  if (target && (input.shoot || autoShoot)) {
    tryBow(state, target, { auto: autoShoot && !input.shoot });
  }
  state.inputLatch.attack = Boolean(input.attack);
  state.inputLatch.shoot = Boolean(input.shoot);
  for (const unit of [...state.enemies]) updateEnemy(state, unit, dt);
  separateEntities(state);
  updateProjectiles(state, dt);
  completeWave(state);
  pruneHistory(state);
};

export function stepGame(state, input = {}, dt = FIXED_STEP) {
  if (!finite(dt) || dt < 0) throw new RangeError('dt must be a finite non-negative number');
  state.accumulator += dt;
  let steps = 0;
  while (state.accumulator + 1e-12 >= FIXED_STEP && steps < MAX_SUBSTEPS) {
    fixedUpdate(state, input || {}, FIXED_STEP);
    state.accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (Math.abs(state.accumulator) < 1e-12) state.accumulator = 0;
  return state;
}

export function openChest(state, chestId) {
  const chest = state.chests.find((item) => item.id === chestId);
  if (!chest || chest.opened) return { opened: false, reason: chest ? 'already-open' : 'not-found' };
  chest.opened = true;
  if (state.stats) state.stats.chestCount += 1;
  state.player.gold += chest.gold;
  if (chest.fallback?.kind === 'gold') state.player.gold += chest.fallback.amount;
  if (chest.fallback?.kind === 'heal') state.player.hp = Math.min(state.player.maxHp, state.player.hp + chest.fallback.amount);
  state.chapter += 1;
  // The 2D build had ten chapters and a victory screen when the descent was
  // complete. The 3D build had no win condition at all: the chapter counter
  // just kept climbing into an endless mode with no ending to reach.
  if (state.chapter > FINAL_CHAPTER) {
    state.mode = 'endless';
    state.status = 'between-waves';
    state.portal = { pending: true, position: { ...chest.position } };
    emitEvent(state, { type: 'chest-open', id: chest.id, gold: chest.gold, at: state.time });
    emitEvent(state, { type: 'victory', chapter: FINAL_CHAPTER, at: state.time });
    return { opened: true, gold: chest.gold, blessing: chest.blessing, fallback: chest.fallback, victory: true };
  }
  state.mode = 'chapters';
  state.status = 'between-waves';
  state.portal = { pending: true, position: { ...chest.position } };
  emitEvent(state, { type: 'chest-open', id: chest.id, gold: chest.gold, at: state.time });
  return { opened: true, gold: chest.gold, blessing: chest.blessing, fallback: chest.fallback };
}

export function chooseBlessing(state, id) {
  if (!BLESSING_IDS.includes(id)) throw new Error(`Unknown blessing: ${id}`);
  const levels = state.blessingLevels || (state.blessingLevels = {});
  const level = levels[id] || 0;
  if (level >= 3) return { chosen: false, reason: 'max-level', label: 'Bonus gold' };
  levels[id] = level + 1;
  if (!state.blessings.includes(id)) state.blessings.push(id);
  const player = state.player;
  if (id === 'vitality') {
    player.maxHp += 30;
    player.hp += 30;
  } else if (id === 'fury') player.damageMultiplier *= 1.2;
  else if (id === 'windstep') player.dashCooldownMax *= 0.75;
  else if (id === 'swiftstrike') player.attackSpeedMultiplier *= 1.18;
  else if (id === 'keeneye') player.critChance += 0.15;
  else if (id === 'honededge') player.critMultiplier += 0.35;
  else if (id === 'ironskin') player.damageTakenMultiplier *= 0.85;
  else if (id === 'vampiric') player.lifesteal += 0.18;
  else if (id === 'longrange') player.bowRangeMultiplier *= 1.3;
  else if (id === 'stormstep') player.speedMultiplier *= 1.12;
  else if (id === 'warmonger') {
    player.damageMultiplier *= 1.1;
    player.attackSpeedMultiplier *= 1.08;
  } else if (id === 'penkalasblood') player.bowStaminaMultiplier *= 0.75;
  if (state.stats) state.stats.blessings += 1;
  // Duo synergies (mythic fiction, labeled in codex).
  const duo = checkDuo(state);
  emitEvent(state, { type: 'blessing', id, level: levels[id], duo, at: state.time });
  return { chosen: true, id, level: levels[id], duo, label: BLESSINGS[id].label, hint: BLESSINGS[id].hint };
}

const DUOS = [
  { pair: ['vampiric', 'fury'], id: 'bloodrite', effect: 'crits heal 4% max hp' },
  { pair: ['longrange', 'keeneye'], id: 'eagles-mark', effect: 'bow crits pierce' },
  { pair: ['windstep', 'stormstep'], id: 'gale-dancer', effect: 'dash leaves a damaging trail' },
];

export function checkDuo(state) {
  const owned = new Set(state.blessings);
  const found = DUOS.filter((duo) => duo.pair.every((id) => owned.has(id))).map((duo) => duo.id);
  if (found.length && !state.duos?.length) state.duos = found;
  else if (found.length) state.duos = [...new Set([...(state.duos || []), ...found])];
  return found;
}

export function rerollChest(state, chestId) {
  const chest = state.chests.find((item) => item.id === chestId);
  if (!chest || chest.opened || (chest.rerolls || 0) <= 0) return { rerolled: false };
  const cost = 20 + state.chapter * 5;
  if (state.player.gold < cost) return { rerolled: false, reason: 'no-gold' };
  state.player.gold -= cost;
  chest.rerolls -= 1;
  const levels = state.blessingLevels || {};
  const pool = BLESSING_IDS.filter((id) => (levels[id] || 0) < 3 && !chest.choices?.some((c) => c.id === id));
  chest.choices = (chest.choices || []).map((choice) => {
    if (!pool.length) return choice;
    const id = pool.splice(Math.floor(random(state) * pool.length), 1)[0];
    return { id, rarity: rollRarity(state, state.chapter), level: (levels[id] || 0) + 1 };
  });
  chest.blessing = chest.choices[0]?.id || null;
  emitEvent(state, { type: 'reroll', chest: chest.id, at: state.time });
  return { rerolled: true, choices: chest.choices };
}

export function buyShopItem(state, chestId, slot) {
  const chest = state.chests.find((item) => item.id === chestId);
  const item = chest?.shop?.find((entry) => entry.slot === slot);
  if (!item || item.sold) return { bought: false };
  if (state.player.gold < item.price) return { bought: false, reason: 'no-gold' };
  state.player.gold -= item.price;
  item.sold = true;
  if (item.kind === 'heal') state.player.hp = Math.min(state.player.maxHp, state.player.hp + 50);
  if (item.kind === 'reroll') chest.rerolls = (chest.rerolls || 0) + 1;
  if (item.kind === 'relic') { state.player.damageMultiplier *= 1.05; state.player.maxHp += 10; }
  emitEvent(state, { type: 'shop-buy', chest: chest.id, slot, kind: item.kind, at: state.time });
  return { bought: true, kind: item.kind };
}

export function fireSpecial(state) {
  const player = state.player;
  if (player.dead || state.time < (player.specialReadyAt || 0)) return { fired: false, reason: 'cooldown' };
  if ((player.specialCharge || 0) < 100) return { fired: false, reason: 'not-charged' };
  player.specialCharge = 0;
  player.specialReadyAt = state.time + 12;
  let stunned = 0;
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    const gap = Math.hypot(enemy.x - player.position.x, enemy.z - player.position.z);
    if (gap <= 4.5) {
      enemy.stun = Math.max(enemy.stun || 0, enemy.archetype === 'boss' ? 1 : 3);
      const push = direction(player.position, enemy);
      enemy.x = clamp(enemy.x + push.x * 1.2, -ARENA_RADIUS, ARENA_RADIUS);
      enemy.z = clamp(enemy.z + push.z * 1.2, -ARENA_RADIUS, ARENA_RADIUS);
      stunned += 1;
    }
  }
  emitEvent(state, { type: 'special', stunned, at: state.time });
  return { fired: true, stunned };
}

export function serializeRun(state) {
  return JSON.stringify(state);
}

const validEnemy = (unit) => unit && typeof unit.id === 'string' && ARCHETYPES[unit.archetype]
  && finite(unit.x) && finite(unit.z) && finite(unit.hp) && finite(unit.maxHp) && typeof unit.dead === 'boolean';
const validState = (state) => state && state.version === VERSION && typeof state.seed === 'string'
  && Number.isInteger(state.rng) && finite(state.time) && finite(state.accumulator)
  && Number.isInteger(state.nextId) && Number.isInteger(state.chapter) && state.chapter >= 1
  && state.player && finite(state.player.hp) && finite(state.player.maxHp)
  && finite(state.player.stamina) && finite(state.player.xp) && Number.isInteger(state.player.level)
  && finite(state.player.gold) && state.player.position && finite(state.player.position.x)
  && finite(state.player.position.z) && Array.isArray(state.enemies) && state.enemies.every(validEnemy)
  && Array.isArray(state.projectiles) && Array.isArray(state.chests) && Array.isArray(state.loot)
  && Array.isArray(state.blessings) && Array.isArray(state.events) && state.wave
  && state.inputLatch && typeof state.inputLatch.dash === 'boolean'
  && typeof state.inputLatch.attack === 'boolean' && typeof state.inputLatch.shoot === 'boolean';

export function restoreRun(json) {
  let state;
  try {
    state = JSON.parse(json);
  } catch {
    throw new Error('Invalid dungeon save: malformed JSON');
  }
  if (state && state.version === 4) {
    if (state.player) {
      if (state.player.focusCharge === undefined) state.player.focusCharge = 0;
      if (state.player.rhythmWindow === undefined) state.player.rhythmWindow = 0;
      if (state.player.guardUntil === undefined) state.player.guardUntil = 0;
      if (state.player.specialCharge === undefined) state.player.specialCharge = 0;
    }
    if (!Array.isArray(state.pendingSpawns)) state.pendingSpawns = [];
    if (!state.blessingLevels) state.blessingLevels = {};
    if (!state.settings) state.settings = { autoFireReserve: 25, heat: 0 };
    if (state.heat === undefined) state.heat = state.settings.heat || 0;
    if (!state.arena) state.arena = 'column-ring';
    if (!state.oaths) state.oaths = { selected: 'sword', unlocked: ['sword'] };
    if (!Array.isArray(state.runHistory)) state.runHistory = [];
    if (!state.codex) state.codex = { enemies: [], blessings: [], duos: [], bosses: [] };
  }
  if (state && state.version === 3) {
    state.version = 4;
    if (state.player) {
      if (state.player.focusCharge === undefined) state.player.focusCharge = 0;
      if (state.player.rhythmWindow === undefined) state.player.rhythmWindow = 0;
      if (state.player.invulnerable === 0.1) state.player.invulnerable = 0.45;
      for (const key of ['guardUntil', 'guardReadyAt', 'parryWindowUntil', 'phantomUntil', 'phantomBonusUntil', 'specialCharge', 'specialReadyAt']) {
        if (state.player[key] === undefined) state.player[key] = 0;
      }
    }
    if (!Array.isArray(state.pendingSpawns)) state.pendingSpawns = [];
    if (!state.blessingLevels) state.blessingLevels = {};
    if (!state.settings) state.settings = { autoFireReserve: 25, heat: 0 };
    if (state.heat === undefined) state.heat = 0;
    if (!state.arena) state.arena = 'column-ring';
    if (!state.oaths) state.oaths = { selected: 'sword', unlocked: ['sword'] };
    if (!Array.isArray(state.runHistory)) state.runHistory = [];
    if (!state.codex) state.codex = { enemies: [], blessings: [], duos: [], bosses: [] };
  }
  if (!validState(state)) throw new Error('Invalid dungeon save: schema mismatch');
  // The event sequence counter must survive the round trip, or the runtime
  // would start counting from zero while the saved events already carry
  // higher sequence numbers, and every saved event would be replayed.
  const highest = state.events.reduce(
    (max, event) => (Number.isInteger(event?.seq) && event.seq > max ? event.seq : max),
    0,
  );
  state.eventSeq = Number.isInteger(state.eventSeq) && state.eventSeq >= highest
    ? state.eventSeq
    : highest;
  return state;
}

export function savePersistedRun(storage, state) {
  try {
    storage.setItem(DUNGEON_SAVE_KEY, serializeRun(state));
    return { saved: true };
  } catch {
    return { saved: false };
  }
}

export function loadPersistedRun(storage, seed = 'dungeon') {
  let raw = null;
  try {
    raw = storage.getItem(DUNGEON_SAVE_KEY);
  } catch {
    return { restored: false, state: createGameState(seed) };
  }
  if (raw == null) {
    // Try v3 save and migrate.
    let v3raw = null;
    try { v3raw = storage.getItem(V3_SAVE_KEY); } catch { v3raw = null; }
    if (v3raw != null) {
      try {
        const migrated = restoreRun(v3raw);
        return { restored: true, state: migrated, announcement: 'Migrated save from v3.' };
      } catch { /* fall through */ }
    }
    let legacy = null;
    try {
      legacy = storage.getItem(LEGACY_SAVE_KEY);
    } catch {
      legacy = null;
    }
    if (legacy != null) {
      return {
        restored: false,
        state: createGameState(seed),
        announcement: 'Found an older save from a previous version; started a fresh run instead.',
      };
    }
    return { restored: false, state: createGameState(seed) };
  }
  try {
    return { restored: true, state: restoreRun(raw) };
  } catch {
    return { restored: false, state: createGameState(seed) };
  }
}

export function clearPersistedRun(storage) {
  try {
    storage.removeItem(DUNGEON_SAVE_KEY);
    return { cleared: true };
  } catch {
    return { cleared: false };
  }
}

export function pickTarget(state, lockTarget = null) {
  const player = state.player;
  if (lockTarget) {
    const lt = state.enemies.find((e) => e.id === lockTarget && !e.dead);
    if (lt) return lt;
  }
  // sticky
  if (state.assistTarget && state.assistTargetUntil > state.time) {
    const t = state.enemies.find((e) => e.id === state.assistTarget && !e.dead);
    if (t) return t;
  }
  const candidates = state.enemies.filter((e) => !e.dead);
  if (!candidates.length) return null;
  let best = null; let bestScore = Infinity;
  for (const e of candidates) {
    const gap = Math.hypot(e.x - player.position.x, e.z - player.position.z);
    const toward = { x: (e.x-player.position.x)/(gap||1), z: (e.z-player.position.z)/(gap||1) };
    const alignment = toward.x * player.facing.x + toward.z * player.facing.z;
    const tb = { summoner:5, archer:3, flanker:2, boss:4, tank:0, chaser:0 }[e.archetype] || 0;
    const lowHp = (e.hp / e.maxHp < 0.25) ? 3 : 0;
    const shielded = 0;
    const score = gap - alignment*4 - tb - lowHp + shielded;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  if (best) { state.assistTarget = best.id; state.assistTargetUntil = state.time + 0.4; }
  return best;
}

export function tryMelee(state, target, options = {}) {
  const player = state.player;
  if (player.dead || player.dashRemaining > 0) return { hit: false, reason: 'busy' };
  if (state.time + 1e-9 < player.attackReadyAt) return { hit: false, reason: 'cooldown' };
  if (!target) return { hit: false, reason: 'no-target' };
  const chain = player.combo % 3 + 1;
  const strike = COMBO[chain - 1];
  const auto = Boolean(options.auto);
  const manual = !auto;
  if (Math.hypot(target.x - player.position.x, target.z - player.position.z) > strike.range) {
    return { hit: false, reason: 'out-of-range', chain, damage: 0, range: strike.range };
  }
  return attack(state, target.id, manual);
}

export function tryBow(state, target, options = {}) {
  const player = state.player;
  const auto = Boolean(options.auto);
  if (auto) {
    const meleeReach = COMBO.reduce((m, c) => Math.max(m, c.range), 0);
    const nearEnemy = state.enemies.some((e) => !e.dead && Math.hypot(e.x-player.position.x, e.z-player.position.z) <= meleeReach);
    if (nearEnemy) return { fired: false, reason: 'melee-reach' };
    const reserve = state.settings?.autoFireReserve ?? 25;
    const cost = Math.max(1, Math.round(BOW.staminaCost * player.bowStaminaMultiplier));
    if (player.stamina - cost < reserve) return { fired: false, reason: 'reserve' };
    if (!target || Math.hypot(target.x-player.position.x, target.z-player.position.z) > BOW.range * player.bowRangeMultiplier) {
      return { fired: false, reason: 'no-target' };
    }
  }
  const focus = !auto && (options.focus || player.focusCharge >= 0.6);
  const result = shoot(state, { focus });
  if (!result.fired && result.reason) {
    emitEvent(state, { type: 'bow-missed', reason: result.reason, at: state.time });
  }
  return result;
}
