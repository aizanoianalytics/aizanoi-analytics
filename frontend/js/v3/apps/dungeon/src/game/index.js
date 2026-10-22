// Deterministic, renderer-agnostic dungeon simulation.
const VERSION = 3;
export const DUNGEON_SAVE_KEY = 'aizanoi.dungeon.run.v3';
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
  damage: 22,
  range: 16,
  speed: 15,
  radius: 0.34,
  cooldown: 0.62,
  staminaCost: 18,
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
const emitEvent = (state, event) => {
  state.events.push(event);
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
    inputLatch: { dash: false, attack: false, shoot: false },
  };
}

const scaledArchetype = (archetype, chapter) => {
  const base = ARCHETYPES[archetype];
  const endless = Math.max(0, chapter - 10);
  const scale = 1 + (chapter - 1) * 0.12 + endless * 0.08;
  return {
    hp: Math.round(base.hp * scale),
    speed: base.speed * Math.min(1.45, 1 + (chapter - 1) * 0.012),
    damage: Math.round(base.damage * (1 + (chapter - 1) * 0.1 + endless * 0.05)),
    xp: Math.round(base.xp * scale),
    gold: Math.round(base.gold * Math.sqrt(scale)),
    scale,
  };
};

const makeEnemy = (state, archetype, chapter, index) => {
  const stats = scaledArchetype(archetype, chapter);
  const angle = random(state) * Math.PI * 2;
  const radius = 7 + random(state) * 8;
  return {
    id: `enemy-${state.nextId++}`,
    archetype,
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius,
    hp: stats.hp,
    maxHp: stats.hp,
    speed: stats.speed,
    damage: stats.damage,
    xp: stats.xp,
    gold: stats.gold,
    attackCooldown: random(state) * 0.4,
    shootCooldown: archetype === 'archer' ? random(state) * 0.5 : 0,
    summonCooldown: archetype === 'summoner' ? 1.5 + random(state) : 0,
    stun: 0,
    windup: null,
    dead: false,
    intent: 'idle',
    phase: archetype === 'boss' ? 1 : undefined,
    spawnIndex: index,
  };
};

export function spawnWave(state, chapter = state.chapter) {
  if (!Number.isInteger(chapter) || chapter < 1) throw new RangeError('Chapter must be a positive integer');
  state.chapter = chapter;
  state.mode = chapter > 10 ? 'endless' : 'chapters';
  const roles = [];
  if (chapter % 5 === 0) roles.push('chaser', 'archer', 'tank', 'summoner', 'flanker', 'boss');
  else {
    const pool = chapter < 3 ? ['chaser', 'chaser', 'archer']
      : chapter < 6 ? ['chaser', 'archer', 'tank']
        : ['chaser', 'archer', 'tank', 'summoner', 'flanker'];
    const count = Math.min(4 + chapter, 12);
    for (let i = 0; i < count; i += 1) roles.push(pool[Math.floor(random(state) * pool.length)]);
  }
  const scale = scaledArchetype('chaser', chapter).scale;
  // Never start a wave above the live-enemy ceiling: the arena is a single
  // screen, and a wave that cannot be fought is not a difficulty curve.
  const rolesCapped = roles.slice(0, MAX_LIVE_ENEMIES);
  state.enemies = rolesCapped.map((role, index) => makeEnemy(state, role, chapter, index));
  state.projectiles = [];
  state.chests = [];
  state.portal = { pending: false, position: null };
  state.wave = { active: true, complete: false, rewarded: false, chapter, scale };
  state.status = 'combat';
  emitEvent(state, { type: 'wave-start', chapter, count: rolesCapped.length, at: state.time });
  return state.enemies;
}

const damagePlayer = (state, amount, source) => {
  const player = state.player;
  if (player.dead || player.invulnerable > 0) return false;
  const taken = Math.max(1, Math.round(amount * player.damageTakenMultiplier));
  player.hp = Math.max(0, player.hp - taken);
  player.invulnerable = 0.1;
  emitEvent(state, { type: 'player-hit', source, amount: taken, at: state.time });
  if (player.hp === 0) {
    player.dead = true;
    state.status = 'defeat';
    emitEvent(state, { type: 'player-death', at: state.time });
  }
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
  state.player.xp += target.xp;
  state.player.gold += target.gold;
  levelPlayer(state.player);
  state.loot.push({ id: `loot-${state.nextId++}`, kind: 'gold', amount: target.gold,
    x: target.x, z: target.z, collected: true });
  if (state.loot.length > MAX_LOOT) state.loot.splice(0, state.loot.length - MAX_LOOT);
  emitEvent(state, { type: 'enemy-death', id: target.id, at: state.time });
};

export function attack(state, targetId) {
  const player = state.player;
  if (player.dead || state.time + 1e-9 < player.attackReadyAt) {
    return { hit: false, reason: 'cooldown', chain: player.combo || 1, damage: 0, range: 0 };
  }
  if (state.time > player.comboExpires) player.combo = 0;
  const chain = player.combo % 3 + 1;
  const strike = COMBO[chain - 1];
  player.combo = chain;
  player.comboExpires = state.time + 0.75;
  player.attackReadyAt = state.time
    + (chain === 3 ? 0.38 : 0.22) / Math.max(0.2, player.attackSpeedMultiplier);
  const target = state.enemies.find((unit) => unit.id === targetId && !unit.dead);
  const crit = random(state) < player.critChance;
  const damage = Math.round(strike.damage * player.damageMultiplier * (crit ? player.critMultiplier : 1));
  const result = { hit: false, chain, damage, range: strike.range, crit };
  if (!target || distance(player.position, target) > strike.range) return result;
  target.hp = Math.max(0, target.hp - damage);
  target.stun = Math.max(target.stun || 0, strike.stun);
  result.hit = true;
  if (player.lifesteal > 0) {
    const healed = Math.max(1, Math.round(damage * player.lifesteal));
    player.hp = Math.min(player.maxHp, player.hp + healed);
    result.healed = healed;
  }
  emitEvent(state, { type: 'melee-hit', id: target.id, chain, damage, crit, at: state.time });
  if (target.hp === 0) killEnemy(state, target);
  return result;
}

const fireProjectile = (state, enemy) => {
  const aim = direction(enemy, state.player.position);
  state.projectiles.push({
    id: `projectile-${state.nextId++}`,
    ownerId: enemy.id,
    source: 'enemy',
    x: enemy.x,
    z: enemy.z,
    vx: aim.x * 8,
    vz: aim.z * 8,
    damage: enemy.damage,
    ttl: 3,
    radius: 0.32,
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
export function shoot(state) {
  const player = state.player;
  if (player.dead) return { fired: false, reason: 'dead' };
  if (state.time + 1e-9 < player.bowReadyAt) return { fired: false, reason: 'cooldown' };
  const staminaCost = Math.max(1, Math.round(BOW.staminaCost * player.bowStaminaMultiplier));
  if (player.stamina < staminaCost) return { fired: false, reason: 'stamina' };
  const target = findBowTarget(state);
  if (!target) return { fired: false, reason: 'no-target' };
  player.stamina -= staminaCost;
  player.bowReadyAt = state.time + BOW.cooldown;
  const aim = direction(player.position, target);
  const crit = random(state) < player.critChance;
  const damage = Math.round(BOW.damage * player.damageMultiplier * (crit ? player.critMultiplier : 1));
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
  });
  emitEvent(state, { type: 'bow-shot', id: target.id, damage, crit, at: state.time });
  return { fired: true, targetId: target.id, damage, crit };
}

const beginWindup = (state, enemy, kind, duration, range) => {
  enemy.windup = { kind, remaining: duration, duration, range };
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

const resolveWindup = (state, enemy, gap) => {
  const windup = enemy.windup;
  if (!windup) return false;
  if (enemy.stun > 0 || gap > windup.range) {
    enemy.windup = null;
    return true;
  }
  if (windup.remaining > 0) return true;
  enemy.windup = null;
  if (windup.kind === 'projectile') {
    fireProjectile(state, enemy);
    enemy.shootCooldown = 1.35;
  } else if (windup.kind === 'summon') {
    summonMinion(state, enemy);
    enemy.summonCooldown = 4.5;
  } else {
    const multiplier = enemy.archetype === 'boss' ? 1 + ((enemy.phase || 1) - 1) * 0.35 : 1;
    if (damagePlayer(state, Math.round(enemy.damage * multiplier), enemy.id)) {
      enemy.attackCooldown = enemy.archetype === 'boss' ? (enemy.phase === 3 ? 0.55 : 1)
        : enemy.archetype === 'tank' ? 1.4 : 0.8;
    }
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

const updateEnemy = (state, enemy, dt) => {
  if (enemy.dead) return;
  enemy.stun = Math.max(0, (enemy.stun || 0) - dt);
  enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - dt);
  enemy.shootCooldown = Math.max(0, (enemy.shootCooldown || 0) - dt);
  enemy.summonCooldown = Math.max(0, (enemy.summonCooldown || 0) - dt);
  if (enemy.stun > 0) {
    enemy.windup = null;
    enemy.intent = 'stunned';
    return;
  }
  const player = state.player;
  const gap = distance(enemy, player.position);
  // The flanker drives its own windup: its lunge window is the telegraph and
  // the dash, so it must not be short-circuited by the generic windup path.
  if (enemy.windup && enemy.archetype !== 'flanker') {
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
    if (gap >= 4 && gap <= 10 && enemy.shootCooldown <= 0) beginWindup(state, enemy, 'projectile', NORMAL_WINDUP, 10);
  } else if (enemy.archetype === 'tank') {
    enemy.intent = gap <= 1.6 ? 'slam' : 'guard';
    if (gap > 1.6) move(enemy, toward, enemy.speed, dt, 0.6);
    else if (enemy.attackCooldown <= 0) beginWindup(state, enemy, 'slam', NORMAL_WINDUP, 1.8);
  } else if (enemy.archetype === 'summoner') {
    enemy.intent = 'summon';
    if (gap < 5) move(enemy, away, enemy.speed * 0.5, dt);
    if (gap <= 12 && enemy.summonCooldown <= 0) beginWindup(state, enemy, 'summon', NORMAL_WINDUP, 12);
  } else if (enemy.archetype === 'flanker') {
    updateFlanker(state, enemy, gap, dt);
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
      // The player's arrow stops on the first enemy it reaches.
      const target = state.enemies.find((enemy) => !enemy.dead && enemy.id === shot.ownerId);
      if (target && distance(shot, target) <= shot.radius + 0.55) {
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
        emitEvent(state, { type: 'melee-hit', id: target.id, chain: 1, damage: shot.damage, ranged: true, crit: !!shot.crit, at: state.time });
        if (target.hp === 0) killEnemy(state, target);
        shot.ttl = 0;
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

const completeWave = (state) => {
  if (!state.wave.active || state.wave.rewarded || state.enemies.some((enemy) => !enemy.dead)) return;
  state.wave.active = false;
  state.wave.complete = true;
  state.wave.rewarded = true;
  state.status = 'reward';
  const amount = Math.round(12 + state.wave.chapter * 4 + random(state) * 12);
  const available = BLESSING_IDS.filter((id) => !state.blessings.includes(id));
  const blessing = available.length ? available[Math.floor(random(state) * available.length)] : null;
  const fallback = blessing ? null : (state.player.hp < state.player.maxHp
    ? { kind: 'heal', amount: Math.min(30, state.player.maxHp - state.player.hp), label: 'Restored health' }
    : { kind: 'gold', amount: Math.round(18 + state.wave.chapter * 3), label: 'Bonus gold' });
  const chest = { id: `chest-${state.nextId++}`, opened: false, gold: amount, blessing,
    fallback, position: rewardPosition(state), reachable: true };
  state.chests.push(chest);
  emitEvent(state, { type: 'wave-complete', chapter: state.wave.chapter, chest: chest.id, at: state.time });
};

const fixedUpdate = (state, input, dt) => {
  state.time += dt;
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
  if (dashPressed && player.dashCooldown <= 0 && player.stamina >= 25 && length > 0) {
    player.stamina -= 25;
    player.dashCooldown = player.dashCooldownMax;
    player.dashRemaining = DASH_DURATION;
    player.dashDirection = { ...vector };
    player.invulnerable = Math.max(player.invulnerable, 0.28);
    emitEvent(state, { type: 'dash', at: state.time });
  }
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
  if (input.attack && !state.inputLatch.attack) {
    const nearest = state.enemies.filter((unit) => !unit.dead)
      .sort((a, b) => distance(a, player.position) - distance(b, player.position))[0];
    if (nearest) attack(state, nearest.id);
  }
  state.inputLatch.attack = Boolean(input.attack);
  if (input.shoot && !state.inputLatch.shoot) shoot(state);
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
  state.player.gold += chest.gold;
  if (chest.fallback?.kind === 'gold') state.player.gold += chest.fallback.amount;
  if (chest.fallback?.kind === 'heal') state.player.hp = Math.min(state.player.maxHp, state.player.hp + chest.fallback.amount);
  state.chapter += 1;
  state.mode = state.chapter > 10 ? 'endless' : 'chapters';
  state.status = 'between-waves';
  state.portal = { pending: true, position: { ...chest.position } };
  emitEvent(state, { type: 'chest-open', id: chest.id, gold: chest.gold, at: state.time });
  return { opened: true, gold: chest.gold, blessing: chest.blessing, fallback: chest.fallback };
}

export function chooseBlessing(state, id) {
  if (!BLESSING_IDS.includes(id)) throw new Error(`Unknown blessing: ${id}`);
  if (state.blessings.includes(id)) return { chosen: false, reason: 'already-chosen', label: 'Bonus gold' };
  state.blessings.push(id);
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
  emitEvent(state, { type: 'blessing', id, at: state.time });
  return { chosen: true, id, label: BLESSINGS[id].label, hint: BLESSINGS[id].hint };
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
  if (!validState(state)) throw new Error('Invalid dungeon save: schema mismatch');
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
