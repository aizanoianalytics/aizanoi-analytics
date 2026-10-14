// js/systems/RunSaveSystem.js
// Chapter-boundary checkpoint (NOT mid-floor world serialization).
const CHECKPOINT_KEY = 'aizanoi_dungeon_run_v1';
export const RUN_SAVE_VERSION = 1;

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (_) {}
  return null;
}
// In-memory fallback for Node/test contexts without DOM storage.
const memFallback = new Map();

export function saveCheckpoint(snapshot) {
  const payload = { version: RUN_SAVE_VERSION, savedAt: Date.now(), ...snapshot };
  const raw = JSON.stringify(payload);
  const store = storage();
  if (store) store.setItem(CHECKPOINT_KEY, raw);
  else memFallback.set(CHECKPOINT_KEY, raw);
  return payload;
}

export function loadCheckpoint() {
  const store = storage();
  let raw = null;
  try {
    raw = store ? store.getItem(CHECKPOINT_KEY) : memFallback.get(CHECKPOINT_KEY) || null;
  } catch (_) { raw = null; }
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch (_) { return null; }
  if (!data || data.version !== RUN_SAVE_VERSION) return null;
  if (!Number.isFinite(data.chapterIndex) || data.chapterIndex < 0) return null;
  return data;
}

export function hasCheckpoint() {
  return Boolean(loadCheckpoint());
}

export function clearCheckpoint() {
  const store = storage();
  try {
    if (store) store.removeItem(CHECKPOINT_KEY);
    else memFallback.delete(CHECKPOINT_KEY);
  } catch (_) {}
}

export function buildCheckpoint({ chapterIndex, isEndless, wave, seed, runLedger, blessingIds }) {
  return {
    chapterIndex: Math.max(0, Math.floor(chapterIndex || 0)),
    isEndless: Boolean(isEndless),
    wave: Number.isFinite(wave) ? wave : 1,
    seed: Number.isFinite(seed) ? seed >>> 0 : 0,
    runLedger: runLedger && typeof runLedger === 'object' ? runLedger : null,
    blessingIds: Array.isArray(blessingIds) ? blessingIds.slice(0, 64) : [],
  };
}
