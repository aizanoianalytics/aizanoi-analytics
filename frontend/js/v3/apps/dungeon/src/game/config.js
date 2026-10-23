// Deterministic dungeon simulation — configuration tables.
// Extracted from game/index.js so the simulation, the runtime and the tests
// can share one source of truth for every tuning number.

export const VERSION = 4;
export const DUNGEON_SAVE_KEY = 'aizanoi.dungeon.run.v4';
export const LEGACY_SAVE_KEY = 'aizanoi.dungeon.run.v2';
export const V3_SAVE_KEY = 'aizanoi.dungeon.run.v3';
export const FIXED_STEP = 1 / 60;
export const MAX_SUBSTEPS = 600;
export const ARENA_RADIUS = 18;
export const REWARD_BOUNDARY = 16;
export const MAX_EVENTS = 128;
export const MAX_LOOT = 64;
export const DASH_DURATION = 0.22;
export const NORMAL_WINDUP = 0.25;
export const BOSS_WINDUP = 0.45;
export const MAX_SUMMONS_PER_CASTER = 3;
export const FINAL_CHAPTER = 10;
export const MAX_LIVE_ENEMIES = 40;
export const DASH_RESERVE = 25;
export const RHYTHM_WINDOW = 0.12;
export const RHYTHM_DAMAGE_BONUS = 0.15;
export const RHYTHM_STAMINA_REFUND = 3;
export const FOCUS_SHOT_HOLD = 0.6;
export const FOCUS_SHOT_MULTIPLIER = 2.2;
export const FOCUS_SHOT_STAMINA_MULTIPLIER = 1.5;

export const OBSTACLES = Object.freeze([
  ...[-12, -6, 6, 12].flatMap((x) => [-12, 12].map((z) => ({ x, z, radius: 1.25, kind: 'column' }))),
  ...[-8, 8].map((x) => ({ x, z: -15, radius: 0.8, kind: 'brazier' })),
]);

export const COMBO = Object.freeze([
  { damage: 18, range: 1.9, stun: 0.12 },
  { damage: 26, range: 2.25, stun: 0.18 },
  { damage: 42, range: 2.8, stun: 0.32 },
]);

export const BOW = Object.freeze({
  damage: 28,
  range: 16,
  speed: 15,
  radius: 0.34,
  cooldown: 0.62,
  staminaCost: 8,
  knockback: 0.55,
});

export const FLANKER_ORBIT = 5.5;
export const FLANKER_ORBIT_MS = 1.4;
export const FLANKER_LUNGE_MS = 0.32;

export const ARCHETYPES = Object.freeze({
  chaser: { hp: 70, speed: 3.8, damage: 9, xp: 12, gold: 5 },
  archer: { hp: 55, speed: 3.1, damage: 8, xp: 15, gold: 7 },
  tank: { hp: 145, speed: 1.8, damage: 18, xp: 22, gold: 11 },
  summoner: { hp: 90, speed: 2.2, damage: 7, xp: 26, gold: 13 },
  flanker: { hp: 80, speed: 3.4, damage: 12, xp: 18, gold: 9 },
  boss: { hp: 650, speed: 2.7, damage: 24, xp: 150, gold: 80 },
});

export const BLESSINGS = Object.freeze({
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
export const BLESSING_IDS = Object.freeze(Object.keys(BLESSINGS));
export const BLESSING_LABELS = Object.freeze(Object.fromEntries(
  BLESSING_IDS.map((id) => [id, Object.freeze({ label: BLESSINGS[id].label, hint: BLESSINGS[id].hint })]),
));

export const THREAT_BONUS = Object.freeze({
  summoner: 5,
  archer: 3,
  flanker: 2,
  boss: 4,
  tank: 0,
  chaser: 0,
});

export const ASSIST_MODES = Object.freeze(['manual', 'assist', 'auto']);