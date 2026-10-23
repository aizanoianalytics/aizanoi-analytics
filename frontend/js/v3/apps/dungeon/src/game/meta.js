// Local-only meta progression. It unlocks sideways options, never raw power.
export const META_KEY = 'aizanoi.dungeon.meta.v1';
export const MAX_HISTORY = 20;

export function createMeta() {
  return { marks: 0, heatUnlocked: 0, oaths: ['sword'], arenas: ['column-ring'], relics: [], tints: [], history: [], codex: {} };
}

export function loadMeta(storage) {
  try {
    const raw = storage?.getItem?.(META_KEY);
    if (!raw) return createMeta();
    const value = JSON.parse(raw);
    const meta = { ...createMeta(), ...(value && typeof value === 'object' ? value : {}) };
    meta.marks = Number.isFinite(meta.marks) ? Math.max(0, Math.floor(meta.marks)) : 0;
    meta.history = Array.isArray(meta.history) ? meta.history.slice(-MAX_HISTORY) : [];
    return meta;
  } catch { return createMeta(); }
}

export function saveMeta(storage, meta) {
  try { storage?.setItem?.(META_KEY, JSON.stringify(meta)); return { saved: true }; }
  catch { return { saved: false }; }
}

export function marksForRun({ chapters = 0, bosses = 0, heat = 0, gold = 0 } = {}) {
  return Math.max(0, Math.floor(chapters * 5 + bosses * 25 + heat * 10 + gold / 40));
}

export function recordRun(meta, run) {
  const marks = marksForRun(run);
  const entry = { ...run, marks, recordedAt: new Date().toISOString() };
  const history = [...(Array.isArray(meta.history) ? meta.history : []), entry].slice(-MAX_HISTORY);
  return { ...meta, marks: (meta.marks || 0) + marks, history, heatUnlocked: Math.max(meta.heatUnlocked || 0, run.won ? (run.heat || 0) + 1 : meta.heatUnlocked || 0) };
}

export function unlock(meta, kind, id, cost) {
  const collection = Array.isArray(meta[kind]) ? meta[kind] : [];
  if (collection.includes(id)) return { unlocked: false, reason: 'already-unlocked', meta };
  if ((meta.marks || 0) < cost) return { unlocked: false, reason: 'no-marks', meta };
  return { unlocked: true, meta: { ...meta, marks: meta.marks - cost, [kind]: [...collection, id] } };
}
