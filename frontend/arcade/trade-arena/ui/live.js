// Live top-up. data/raw/ is the fixed archive shipped with the release; a private server job
// (scripts/trade-arena/update_live.py) publishes only the closed bars that came after it as small
// "tail" files under live/. No live/ folder simply means archive only. Pure module (window + workers).

const ARCHIVE_PREFIX = 'data/raw/';
const SKIP = new Set(['dividends', 'splits']);

/** Fetch and sanity-check live/manifest.json; null when absent or malformed. */
export async function loadLive(base) {
  try {
    const r = await fetch(new URL('live/manifest.json', base), { cache: 'no-store' });
    if (!r.ok) return null;
    const m = await r.json();
    if (m?.version !== 1 || typeof m.series !== 'object' || !m.end) return null;
    return m;
  } catch { return null; }
}

/** 'data/raw/crypto/1d/BTC.json' -> 'crypto/1d/BTC' (the manifest key), or null for non-archive URLs. */
export function tailKey(url) {
  return url.startsWith(ARCHIVE_PREFIX) && url.endsWith('.json') ? url.slice(ARCHIVE_PREFIX.length, -5) : null;
}

/** Append the tail's bars that are strictly newer than the archive's last bar. Columns missing in the tail get NaN. */
export function appendTail(baseCols, tail) {
  const n = baseCols?.t?.length;
  if (!n || !Array.isArray(tail?.t) || !tail.t.length) return baseCols;
  const lastT = baseCols.t[n - 1];
  const idx = [];
  for (let i = 0; i < tail.t.length; i++) if (tail.t[i] > lastT && (!idx.length || tail.t[i] > tail.t[idx[idx.length - 1]])) idx.push(i);
  if (!idx.length) return baseCols;
  const out = { ...baseCols };
  for (const [k, v] of Object.entries(baseCols)) {
    if (SKIP.has(k) || !Array.isArray(v) || v.length !== n) continue;
    const src = Array.isArray(tail[k]) && tail[k].length === tail.t.length ? tail[k] : null;
    out[k] = v.concat(idx.map(i => (src ? src[i] : NaN)));
  }
  out.liveBars = idx.length;
  return out;
}

/** Latest UTC day covered for a market, preferring live data. */
export function liveEnd(live, archiveEnd) {
  const days = [live?.end?.crypto, live?.end?.stocks].filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
  const best = days.sort().pop();
  return best && best > archiveEnd ? best : archiveEnd;
}

/**
 * Loader with optional live tails. get(url) must return parsed archive JSON (cached by the caller).
 * Tails are fetched once per URL. A failing tail throws, so a caller can fall back to archive-only
 * for the whole race instead of mixing fresh and stale assets.
 */
export function liveLoader(base, live, get) {
  const tails = new Map();
  const tail = key => {
    if (!tails.has(key)) tails.set(key, fetch(new URL(`live/raw/${key}.json`, base), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(`live ${key}: HTTP ${r.status}`); return r.json(); })
      .catch(err => { tails.delete(key); throw err; }));
    return tails.get(key);
  };
  return async url => {
    const cols = await get(url);
    const key = tailKey(url);
    if (!live || !key || !(live.series?.[key]?.bars > 0)) return cols;
    return appendTail(cols, await tail(key));
  };
}
