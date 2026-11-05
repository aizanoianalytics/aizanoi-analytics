// One-shot simulation in the race worker, for pages that only need the end state (Basket, Advisor).
// Same worker, rules and bot sandbox as a race; nothing leaves the browser.

export const yearBefore = day => { const d = new Date(day + 'T00:00:00Z'); d.setUTCFullYear(d.getUTCFullYear() - 1); return d.toISOString().slice(0, 10); };

/**
 * Run bots over [start, end] (daily bars) and resolve with { meta, first, last, stats, done, lastTradeK, notes }.
 * onStatus(text) receives progress lines. Returns { promise, cancel }.
 */
export function simulate({ market, start, end, bots, short = false, gross = 1, live = null, advice = null, seed = 7, tf = '1d', blind = false, noise = 0, sample = 1, barMs = 3000, usdAssetsOnly = false }, onStatus = () => {}) {
  const worker = new Worker(new URL('./race-worker.js', import.meta.url), { type: 'module' });
  let timer = 0, settled = false;
  const cancel = () => { clearTimeout(timer); worker.terminate(); };
  const promise = new Promise((resolve, reject) => {
    const fail = message => { if (settled) return; settled = true; cancel(); reject(new Error(message)); };
    let meta = null, first = null, last = null;
    const lastTradeK = bots.map(() => null), notes = bots.map(() => null);
    timer = setTimeout(() => fail('the simulation did not start within 15 seconds.'), 15000);
    worker.onerror = e => { e.preventDefault(); fail(e.message || 'worker failed to load'); };
    worker.onmessageerror = () => fail('invalid worker message');
    worker.onmessage = ({ data }) => {
      clearTimeout(timer);
      if (data.type === 'status') onStatus(`${data.text} ${Math.round((data.progress || 0) * 100)}%`);
      else if (data.type === 'meta') { meta = data; onStatus('Simulating the last 12 months…'); }
      else if (data.type === 'frames') for (const f of data.frames) {
        first ??= f; last = f;
        f.acc.forEach((a, i) => { if (a.trades.length) lastTradeK[i] = f.k; if (a.notes.length) notes[i] = a.notes[a.notes.length - 1]; });
      }
      else if (data.type === 'done') {
        if (settled) return; settled = true; cancel();
        if (!meta || !last) { reject(new Error('no bars in this period')); return; }
        resolve({ meta, first, last, stats: data.stats, done: data, lastTradeK, notes });
      }
      else if (data.type === 'error') fail(String(data.error).split('\n')[0].replace(/^Error:\s*/, ''));
    };
  });
  worker.postMessage({
    cfg: { market, tf, start: Date.parse(start), end: Date.parse(end) + 86399999, blind, seed, sample, usdAssetsOnly },
    bots: bots.map(b => ({ id: b.id, name: b.name, file: b.file })),
    // Not a contest: a generous time budget so a busy device cannot skip bars and change the answer.
    rules: { allowShort: !!short, maxGross: gross, initMs: 20000, barMs, noise, noiseSeed: seed },
    live, advice,
  });
  return { promise, cancel };
}

/** Compare the viewer's weights with a target book. Differences under `band` are "keep". */
export function diffBaskets(mine, target, band = 0.01) {
  const syms = new Set([...Object.keys(mine), ...Object.keys(target)]);
  const rows = [];
  for (const s of syms) {
    const a = mine[s] || 0, b = target[s] || 0, d = b - a;
    if (Math.abs(a) < 1e-4 && Math.abs(b) < 1e-4) continue;
    let action;
    if (Math.abs(d) < band) action = a ? 'keep' : 'skip';
    else if (a && !b) action = a > 0 ? 'close' : 'cover';
    else if (!a && b) action = b > 0 ? 'open' : 'short';
    else if (Math.sign(a) !== Math.sign(b)) action = 'flip';
    else action = Math.abs(b) > Math.abs(a) ? 'add' : 'trim';
    if (action !== 'skip') rows.push({ s, mine: a, target: b, delta: d, action });
  }
  const order = { close: 0, cover: 0, flip: 1, trim: 2, add: 3, open: 4, short: 4, keep: 5 };
  return rows.sort((x, y) => order[x.action] - order[y.action] || Math.abs(y.delta) - Math.abs(x.delta));
}

export const ACTION_LABEL = { close: 'Close', cover: 'Cover short', flip: 'Flip side', trim: 'Trim', add: 'Add', open: 'Open', short: 'Open short', keep: 'Keep' };
