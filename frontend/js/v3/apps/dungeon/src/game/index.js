// Deterministic, renderer-agnostic dungeon simulation.
const VERSION = 1;
const FIXED_STEP = 1 / 60;
const MAX_SUBSTEPS = 600;
const ARENA_RADIUS = 18;
const COMBO = [
  { damage: 18, range: 1.9, stun: 0.12 },
  { damage: 26, range: 2.25, stun: 0.18 },
  { damage: 42, range: 2.8, stun: 0.32 },
];
const ARCHETYPES = {
  chaser: { hp: 70, speed: 3.8, damage: 9, xp: 12, gold: 5 },
  archer: { hp: 55, speed: 3.1, damage: 8, xp: 15, gold: 7 },
  tank: { hp: 145, speed: 1.8, damage: 18, xp: 22, gold: 11 },
  summoner: { hp: 90, speed: 2.2, damage: 7, xp: 26, gold: 13 },
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
const move = (unit, vector, speed, dt) => {
  unit.x = clamp(unit.x + vector.x * speed * dt, -ARENA_RADIUS, ARENA_RADIUS);
  unit.z = clamp(unit.z + vector.z * speed * dt, -ARENA_RADIUS, ARENA_RADIUS);
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
      invulnerable: 0,
      damageMultiplier: 1,
      speedMultiplier: 1,
      dead: false,
    },
    wave: { active: false, complete: false, rewarded: false, chapter: 1, scale: 1 },
    enemies: [],
    projectiles: [],
    chests: [],
    loot: [],
    blessings: [],
    events: [],
    inputLatch: { dash: false, attack: false },
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
  if (chapter % 5 === 0) roles.push('chaser', 'archer', 'tank', 'summoner', 'boss');
  else {
    const pool = chapter < 3 ? ['chaser', 'chaser', 'archer']
      : chapter < 6 ? ['chaser', 'archer', 'tank']
        : ['chaser', 'archer', 'tank', 'summoner'];
    const count = Math.min(4 + chapter, 12);
    for (let i = 0; i < count; i += 1) roles.push(pool[Math.floor(random(state) * pool.length)]);
  }
  const scale = scaledArchetype('chaser', chapter).scale;
  state.enemies = roles.map((role, index) => makeEnemy(state, role, chapter, index));
  state.projectiles = [];
  state.chests = [];
  state.wave = { active: true, complete: false, rewarded: false, chapter, scale };
  state.status = 'combat';
  state.events.push({ type: 'wave-start', chapter, count: roles.length, at: state.time });
  return state.enemies;
}

const damagePlayer = (state, amount, source) => {
  const player = state.player;
  if (player.dead || player.invulnerable > 0) return false;
  player.hp = Math.max(0, player.hp - amount);
  player.invulnerable = 0.1;
  state.events.push({ type: 'player-hit', source, amount, at: state.time });
  if (player.hp === 0) {
    player.dead = true;
    state.status = 'defeat';
    state.events.push({ type: 'player-death', at: state.time });
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
  state.events.push({ type: 'enemy-death', id: target.id, at: state.time });
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
  player.attackReadyAt = state.time + (chain === 3 ? 0.38 : 0.22);
  const target = state.enemies.find((unit) => unit.id === targetId && !unit.dead);
  const damage = Math.round(strike.damage * player.damageMultiplier);
  const result = { hit: false, chain, damage, range: strike.range };
  if (!target || distance(player.position, target) > strike.range) return result;
  target.hp = Math.max(0, target.hp - damage);
  target.stun = Math.max(target.stun || 0, strike.stun);
  result.hit = true;
  state.events.push({ type: 'melee-hit', id: target.id, chain, damage, at: state.time });
  if (target.hp === 0) killEnemy(state, target);
  return result;
}

const fireProjectile = (state, enemy) => {
  const aim = direction(enemy, state.player.position);
  state.projectiles.push({
    id: `projectile-${state.nextId++}`,
    ownerId: enemy.id,
    x: enemy.x,
    z: enemy.z,
    vx: aim.x * 8,
    vz: aim.z * 8,
    damage: enemy.damage,
    ttl: 3,
    radius: 0.32,
  });
};

const updateEnemy = (state, enemy, dt) => {
  if (enemy.dead) return;
  enemy.stun = Math.max(0, (enemy.stun || 0) - dt);
  enemy.attackCooldown = Math.max(0, (enemy.attackCooldown || 0) - dt);
  if (enemy.stun > 0) {
    enemy.intent = 'stunned';
    return;
  }
  const player = state.player;
  const gap = distance(enemy, player.position);
  const toward = direction(enemy, player.position);
  const away = { x: -toward.x, z: -toward.z };
  if (enemy.archetype === 'chaser') {
    enemy.intent = gap > 1.25 ? 'pursue' : 'strike';
    if (gap > 1.25) move(enemy, toward, enemy.speed, dt);
    else if (enemy.attackCooldown <= 0 && damagePlayer(state, enemy.damage, enemy.id)) enemy.attackCooldown = 0.8;
  } else if (enemy.archetype === 'archer') {
    enemy.intent = gap < 4 ? 'kite' : gap > 8 ? 'advance' : 'shoot';
    if (gap < 4) move(enemy, away, enemy.speed, dt);
    else if (gap > 8) move(enemy, toward, enemy.speed * 0.65, dt);
    enemy.shootCooldown = Math.max(0, (enemy.shootCooldown || 0) - dt);
    if (enemy.shootCooldown <= 0) {
      fireProjectile(state, enemy);
      enemy.shootCooldown = 1.35;
    }
  } else if (enemy.archetype === 'tank') {
    enemy.intent = gap <= 1.6 ? 'slam' : 'guard';
    if (gap > 1.6) move(enemy, toward, enemy.speed, dt);
    else if (enemy.attackCooldown <= 0 && damagePlayer(state, enemy.damage, enemy.id)) enemy.attackCooldown = 1.4;
  } else if (enemy.archetype === 'summoner') {
    enemy.intent = 'summon';
    if (gap < 5) move(enemy, away, enemy.speed * 0.5, dt);
    if (enemy.summonCooldown == null) enemy.summonCooldown = 1;
    else enemy.summonCooldown -= dt;
    if (enemy.summonCooldown <= 0) {
      const minion = makeEnemy(state, 'chaser', state.chapter, state.enemies.length);
      minion.x = clamp(enemy.x + 1, -ARENA_RADIUS, ARENA_RADIUS);
      minion.z = enemy.z;
      minion.hp = Math.round(minion.hp * 0.55);
      minion.maxHp = minion.hp;
      minion.xp = Math.round(minion.xp * 0.4);
      minion.gold = Math.round(minion.gold * 0.4);
      state.enemies.push(minion);
      enemy.summonCooldown = 4.5;
      state.events.push({ type: 'summon', id: enemy.id, minion: minion.id, at: state.time });
    }
  } else if (enemy.archetype === 'boss') {
    const ratio = enemy.hp / enemy.maxHp;
    enemy.phase = ratio <= 0.25 ? 3 : ratio < 0.5 ? 2 : 1;
    enemy.intent = enemy.phase === 3 ? 'enrage' : enemy.phase === 2 ? 'charge' : 'hunt';
    const speed = enemy.speed * (enemy.phase === 3 ? 1.65 : enemy.phase === 2 ? 1.3 : 1);
    if (gap > 1.8) move(enemy, toward, speed, dt);
    else if (enemy.attackCooldown <= 0 && damagePlayer(state,
      Math.round(enemy.damage * (1 + (enemy.phase - 1) * 0.35)), enemy.id)) {
      enemy.attackCooldown = enemy.phase === 3 ? 0.55 : 1;
    }
  }
};

const updateProjectiles = (state, dt) => {
  for (const shot of state.projectiles) {
    shot.x += shot.vx * dt;
    shot.z += shot.vz * dt;
    shot.ttl -= dt;
    if (shot.ttl > 0 && distance(shot, state.player.position) <= shot.radius + 0.45) {
      damagePlayer(state, shot.damage, shot.ownerId);
      shot.ttl = 0;
    }
  }
  state.projectiles = state.projectiles.filter((shot) => shot.ttl > 0);
};

const completeWave = (state) => {
  if (!state.wave.active || state.wave.rewarded || state.enemies.some((enemy) => !enemy.dead)) return;
  state.wave.active = false;
  state.wave.complete = true;
  state.wave.rewarded = true;
  state.status = 'reward';
  const amount = Math.round(12 + state.wave.chapter * 4 + random(state) * 12);
  const chest = { id: `chest-${state.nextId++}`, opened: false, gold: amount,
    blessing: ['vitality', 'fury', 'windstep'][Math.floor(random(state) * 3)] };
  state.chests.push(chest);
  state.events.push({ type: 'wave-complete', chapter: state.wave.chapter, chest: chest.id, at: state.time });
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
  if (dashPressed && player.dashCooldown <= 0 && player.stamina >= 25) {
    player.stamina -= 25;
    player.dashCooldown = player.dashCooldownMax;
    player.invulnerable = Math.max(player.invulnerable, 0.28);
    speed = 13;
    state.events.push({ type: 'dash', at: state.time });
  }
  player.position.x = clamp(player.position.x + vector.x * speed * dt, -ARENA_RADIUS, ARENA_RADIUS);
  player.position.z = clamp(player.position.z + vector.z * speed * dt, -ARENA_RADIUS, ARENA_RADIUS);
  if (input.attack && !state.inputLatch.attack) {
    const nearest = state.enemies.filter((unit) => !unit.dead)
      .sort((a, b) => distance(a, player.position) - distance(b, player.position))[0];
    if (nearest) attack(state, nearest.id);
  }
  state.inputLatch.attack = Boolean(input.attack);
  for (const unit of [...state.enemies]) updateEnemy(state, unit, dt);
  updateProjectiles(state, dt);
  completeWave(state);
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
  state.chapter += 1;
  state.mode = state.chapter > 10 ? 'endless' : 'chapters';
  state.status = 'between-waves';
  state.events.push({ type: 'chest-open', id: chest.id, gold: chest.gold, at: state.time });
  return { opened: true, gold: chest.gold, blessing: chest.blessing };
}

export function chooseBlessing(state, id) {
  if (!['vitality', 'fury', 'windstep'].includes(id)) throw new Error(`Unknown blessing: ${id}`);
  if (state.blessings.includes(id)) return { chosen: false, reason: 'already-chosen' };
  state.blessings.push(id);
  if (id === 'vitality') {
    state.player.maxHp += 30;
    state.player.hp += 30;
  } else if (id === 'fury') state.player.damageMultiplier *= 1.2;
  else state.player.dashCooldownMax *= 0.75;
  state.events.push({ type: 'blessing', id, at: state.time });
  return { chosen: true, id };
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
  && state.inputLatch && typeof state.inputLatch.dash === 'boolean';

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
