// js/systems/HighScoreSystem.js
// Bounded deterministic top-N (story and endless never share a formula).
const SCORE_KEY = 'aizanoi_dungeon_scores_v1';
const MAX_ENTRIES = 10;

function storage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch (_) {}
  return null;
}
const memFallback = new Map();

export function scoreRun({ mode, wave, chaptersCleared, enemiesKilled, bossesDefeated, denariiEarned, xpEarned }) {
  if (mode === 'endless') {
    return (wave || 0) * 1000 + (enemiesKilled || 0) * 10 + (bossesDefeated || 0) * 250;
  }
  return (chaptersCleared || 0) * 1500 + (bossesDefeated || 0) * 500
    + (enemiesKilled || 0) * 8 + Math.floor((xpEarned || 0) / 10) + Math.floor((denariiEarned || 0) / 25);
}

function readAll() {
  const store = storage();
  let raw = null;
  try {
    raw = store ? store.getItem(SCORE_KEY) : memFallback.get(SCORE_KEY) || null;
  } catch (_) {}
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

function writeAll(arr) {
  const raw = JSON.stringify(arr.slice(0, MAX_ENTRIES));
  const store = storage();
  if (store) { try { store.setItem(SCORE_KEY, raw); } catch (_) {} }
  else memFallback.set(SCORE_KEY, raw);
}

export function recordScore(entry) {
  const all = readAll();
  const row = { ...entry, at: Date.now() };
  row.score = Number.isFinite(entry.score) ? entry.score : scoreRun(entry);
  all.push(row);
  all.sort((a, b) => b.score - a.score || a.at - b.at);
  const top = all.slice(0, MAX_ENTRIES);
  writeAll(top);
  return { row, top, isBest: top[0] === row || top[0]?.score === row.score };
}

export function topScores(mode = null) {
  const all = readAll();
  return mode ? all.filter((r) => r.mode === mode) : all;
}

export function clearScores() {
  const store = storage();
  try {
    if (store) store.removeItem(SCORE_KEY);
    else memFallback.delete(SCORE_KEY);
  } catch (_) {}
}

export const HIGH_SCORE_LIMIT = MAX_ENTRIES;
