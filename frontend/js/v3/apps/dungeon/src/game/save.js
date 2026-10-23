import { VERSION, DUNGEON_SAVE_KEY, LEGACY_SAVE_KEY, V3_SAVE_KEY } from './config.js';

export function serializeRun(state) { return JSON.stringify(state); }

const validEnemy = (unit) => unit && typeof unit.id === 'string' && Number.isFinite(unit.x) && Number.isFinite(unit.z) && Number.isFinite(unit.hp) && Number.isFinite(unit.maxHp) && typeof unit.dead === 'boolean';

export const validState = (state) => state && (state.version === VERSION) && typeof state.seed === 'string'
  && Number.isInteger(state.rng) && Number.isFinite(state.time) && Number.isFinite(state.accumulator)
  && Number.isInteger(state.nextId) && Number.isInteger(state.chapter) && state.chapter >= 1
  && state.player && Number.isFinite(state.player.hp) && Number.isFinite(state.player.maxHp)
  && Number.isFinite(state.player.stamina) && Number.isFinite(state.player.xp) && Number.isInteger(state.player.level)
  && Number.isFinite(state.player.gold) && state.player.position && Number.isFinite(state.player.position.x)
  && Number.isFinite(state.player.position.z) && Array.isArray(state.enemies) && state.enemies.every(validEnemy)
  && Array.isArray(state.projectiles) && Array.isArray(state.chests) && Array.isArray(state.loot)
  && Array.isArray(state.blessings) && Array.isArray(state.events) && state.wave
  && state.inputLatch && typeof state.inputLatch.dash === 'boolean'
  && typeof state.inputLatch.attack === 'boolean' && typeof state.inputLatch.shoot === 'boolean';

function migrateV3(state) {
  if (state.version === 3) {
    state.version = VERSION;
    if (state.player && state.player.focusCharge === undefined) state.player.focusCharge = 0;
    if (state.player && state.player.rhythmWindow === undefined) state.player.rhythmWindow = 0;
    if (state.player && state.player.invulnerable === 0.1) state.player.invulnerable = 0.1;
  }
  return state;
}

export function restoreRun(json) {
  let state;
  try { state = JSON.parse(json); } catch { throw new Error('Invalid dungeon save: malformed JSON'); }
  if (state && state.version === 3) migrateV3(state);
  if (!validState(state)) throw new Error('Invalid dungeon save: schema mismatch');
  const highest = state.events.reduce((max, event) => (Number.isInteger(event?.seq) && event.seq > max ? event.seq : max), 0);
  state.eventSeq = Number.isInteger(state.eventSeq) && state.eventSeq >= highest ? state.eventSeq : highest;
  return state;
}

export function savePersistedRun(storage, state) {
  try { storage.setItem(DUNGEON_SAVE_KEY, serializeRun(state)); return { saved: true }; }
  catch { return { saved: false }; }
}

export function loadPersistedRun(storage, seed = 'dungeon', createGameStateFn = null) {
  let raw = null;
  try { raw = storage.getItem(DUNGEON_SAVE_KEY); } catch { return { restored: false, state: createGameStateFn ? createGameStateFn(seed) : null }; }
  if (raw == null) {
    let v3 = null;
    try { v3 = storage.getItem(V3_SAVE_KEY); } catch { v3 = null; }
    if (v3 != null) {
      try {
        const migrated = restoreRun(v3);
        return { restored: true, state: migrated, announcement: 'Migrated save from v3.' };
      } catch { /* fall through */ }
    }
    let legacy = null;
    try { legacy = storage.getItem(LEGACY_SAVE_KEY); } catch { legacy = null; }
    if (legacy != null) {
      return { restored: false, state: createGameStateFn ? createGameStateFn(seed) : null, announcement: 'Found an older save from a previous version; started a fresh run instead.' };
    }
    return { restored: false, state: createGameStateFn ? createGameStateFn(seed) : null };
  }
  try { return { restored: true, state: restoreRun(raw) }; }
  catch { return { restored: false, state: createGameStateFn ? createGameStateFn(seed) : null }; }
}

export function clearPersistedRun(storage) {
  try { storage.removeItem(DUNGEON_SAVE_KEY); return { cleared: true }; }
  catch { return { cleared: false }; }
}
