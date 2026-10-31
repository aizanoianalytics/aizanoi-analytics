import { WebHost } from './web-host.js';
// Race worker: loads data, prepares the market, runs the bots (each in its own nested worker) and streams frames.
import { prepareMarket } from '../engine/market.js';
import { runRace, benchmarks, stats, DEFAULT_RULES } from '../engine/sim.js';
import { to4h } from '../engine/bars.js';
import { UNIVERSE, requireSeries, requireFunding } from '../engine/universe.js';

const BASE = new URL('../', import.meta.url);
const cache = new Map();
async function get(url) {
  if (!cache.has(url)) cache.set(url, fetch(new URL(url, BASE)).then(r => { if (!r.ok) throw new Error(`Required historical file ${url}: HTTP ${r.status}`); return r.json(); }).catch(error => { cache.delete(url); throw error; }));
  return cache.get(url);
}

async function loadUniverse(market, tf, progress) {
  const jobs = [];
  if (market !== 'stocks') for (const a of UNIVERSE.crypto) jobs.push(['crypto', a, `data/raw/crypto/${tf}/${a.ticker}.json`]);
  if (market !== 'crypto') for (const a of UNIVERSE.stocks) jobs.push(['stocks', a, `data/raw/stocks/${tf === '4h' ? '1h' : tf}/${a.ticker}.json`]);
  let done = 0;
  const total = jobs.length + UNIVERSE.context.length + (market !== 'stocks' ? UNIVERSE.crypto.length : 0);
  const tick = () => progress(++done / total);
  const series = await Promise.all(jobs.map(async ([mk, a, url]) => {
    let cols = requireSeries(url, await get(url)); tick();
    if (mk === 'stocks' && tf === '4h') cols = to4h(cols);
    return { symbol: a.ticker, name: a.name, market: mk, sector: a.sector || 'Crypto', cols };
  }));
  const context = {}, funding = {};
  await Promise.all(UNIVERSE.context.map(async a => { const url = `data/raw/context/1d/${a.ticker}.json`; const c = await get(url); tick(); context[a.ticker] = requireSeries(url, c); }));
  if (market !== 'stocks') await Promise.all(UNIVERSE.crypto.map(async a => { const url = `data/raw/crypto/funding/${a.ticker}.json`; const f = await get(url); tick(); funding[a.ticker] = requireFunding(url, f); }));
  return { series, context, funding };
}

self.onmessage = async ({ data: { cfg, bots, rules: rulesIn } }) => {
  let hosts = [];
  try {
    if (cfg.market !== 'crypto' && cfg.tf !== '1d') throw new Error('Stock intraday races are unavailable; use daily bars.');
    const post = (type, body) => self.postMessage({ type, ...body });
    post('status', { text: 'Loading market data…', progress: 0 });
    const { series, context, funding } = await loadUniverse(cfg.market, cfg.tf, p => post('status', { text: 'Loading market data…', progress: p }));
    post('status', { text: 'Computing 140 features per asset…', progress: 1 });
    const m = prepareMarket(series, cfg, context, funding);
    if (m.timeline.length < 2) throw new Error('No bars in this period for this market.');
    const rules = { ...DEFAULT_RULES, ...rulesIn };
    const bench = benchmarks(m, rules);
    hosts = bots.map((b, i) => new WebHost(b.file, (cfg.seed * 7919 + i) >>> 0, rules.initMs, rules.barMs));
    const assets = m.assets.map(a => ({ id: a.id, symbol: a.symbol, name: a.name, market: a.market, sector: a.sector, scale: a.scale }));
    post('meta', { timeline: m.timeline, assets, bench, blind: !!cfg.blind });
    let lastTrades = bots.map(() => 0), lastNotes = bots.map(() => 0);
    let buffer = [];
    const flush = () => { if (buffer.length) { post('frames', { frames: buffer }); buffer = []; } };
    const res = await runRace(m, bots.map((b, i) => ({ id: b.id, name: b.name, host: hosts[i] })), rules, async (k, snap, accounts) => {
      const prices = {};
      for (const [id, a] of Object.entries(snap.assets)) prices[id] = [a.bar.o, a.bar.h, a.bar.l, a.bar.c, a.f.ret1];
      buffer.push({
        k, prices, breadth: snap.market.breadth50,
        acc: accounts.map((a, i) => {
          const trades = a.trades.slice(lastTrades[i]).map(t => ({ s: t.s, side: t.side, value: t.value, price: t.price, qty: t.qty }));
          const notes = a.notes.slice(lastNotes[i]).map(n => n.text);
          lastTrades[i] = a.trades.length; lastNotes[i] = a.notes.length;
          const pos = {};
          for (const [s, p] of Object.entries(a.positions || {})) pos[s] = +p.weight.toFixed(4);
          return { e: a.equity, cash: a.cash, x: a.exposure, pos, trades, notes, fees: a.fees, dd: a.equity / a.peak - 1, err: a.errors, retired: a.retired };
        }),
      });
      if (buffer.length >= 40) { flush(); await new Promise(r => { setTimeout(r, 0); }); }
    });
    flush();
    if (res.accounts.some(account => account.initError || account.retired)) throw new Error('Strategy initialization failed or strategy retired; no result recorded.');
    post('done', { stats: res.stats, logs: hosts.map(h => h.logs.slice(0, 50)), names: hosts.map(h => h.meta?.name || null),
      errors: res.accounts.map(a => a.initError || a.lastError || null) });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err?.stack || err) });
  } finally { for (const host of hosts) host.close(); }
};
