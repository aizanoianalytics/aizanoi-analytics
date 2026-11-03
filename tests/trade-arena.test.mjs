import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { appById, searchableEntries } from '../frontend/js/v3/registry.js';
import { prepareMarket } from '../frontend/arcade/trade-arena/engine/market.js';
import { runRace, DEFAULT_RULES } from '../frontend/arcade/trade-arena/engine/sim.js';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const root = 'frontend/arcade/trade-arena/';
const roster = JSON.parse(read(root + 'bots/roster.json'));

test('Trade Arena is an independent installed app and discoverable canonical route', () => {
  const app = appById('trade-arena');
  assert.equal(app.label, 'AI Trade Arena');
  assert.equal(app.module, '/js/v3/apps/trade-arena/src/index.js');
  assert.ok(searchableEntries().some(entry => entry.id === 'trade-arena'));
  assert.ok(read('frontend/arcade/index.html').includes('/arcade/trade-arena/'));
  assert.ok(read('scripts/news/build-news.mjs').includes("['/arcade/trade-arena/'"));
  assert.ok(read('frontend/sitemap.xml').includes('/arcade/trade-arena/'));
  assert.match(read(root + 'index.html'), /rel="canonical" href="https:\/\/aizanoianalytics.com\/arcade\/trade-arena\/"/);
});

test('imported runtime inventory matches bytes and preserves all strategy and data payloads', () => {
  const inventory = JSON.parse(read('docs/trade-arena-import.json'));
  assert.equal(inventory.archiveSha256, '527ccaa1dc00247cc35f1896185b47375e103434b41b9bc9ba201a07b881a5ec');
  for (const entry of inventory.files) {
    const hash = createHash('sha256').update(readFileSync(new URL('../' + root + entry.path, import.meta.url))).digest('hex');
    assert.equal(hash, entry.sha256, entry.path);
    if (entry.path === 'bots/ai/flint-40b.js') {
      // Reviewed integration repair: only make the reassigned binding mutable. Reversing that
      // exact token must recover the supplied bytes; no other strategy edits are admitted.
      assert.equal(entry.sourceSha256, '49d0a9fb25fdbd1c83ac3aaafbbbda5b78edbba02d01d0914937467709e63aa0');
      const supplied = read(root + entry.path).replace('let longs = cands.filter', 'const longs = cands.filter');
      assert.equal(createHash('sha256').update(supplied).digest('hex'), entry.sourceSha256);
    } else if (/^(bots|data)\//.test(entry.path)) assert.equal(hash, entry.sourceSha256, 'unchanged owner payload ' + entry.path);
  }
  const catalog = JSON.parse(read(root + 'data/catalog.json'));
  assert.equal(catalog.crypto.length, 35); assert.equal(catalog.stocks.length, 30); assert.equal(catalog.bist.length, 30); assert.equal(catalog.context.length, 8);
  assert.deepEqual(roster.bots.map(bot => bot.id), ['sonnet-5-5', 'haiku-5-5', 'gpt-6.1-sol', 'gpt-6-astra', 'gpt-6.1-terra', 'gpt-6-sol', 'gpt-6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'opus-5-5', 'muse-spark-1-3', 'deepseek-v4-1-flash', 'glm-5-3-flash', 'beam', 'iceman', 'mimo-v2-6-flash', 'nemotron-3-5-super', 'nemotron-3-5-lightning', 'flint-40b', 'basket', 'aizo', 'momentum', 'hodl', 'monkey']);
  // Every roster strategy must be runnable by the strict-CSP worker, and nothing else.
  const allowed = read(root + 'ui/bot-worker.js').match(/new Set\(\[([^\]]*)\]\)/)[1].split(',').map(x => x.trim().slice(1, -1));
  assert.deepEqual(allowed.sort(), roster.bots.map(bot => bot.file).sort());
  assert.ok(!readdirSync(new URL('../' + root, import.meta.url)).some(name => ['tools','docs'].includes(name)));
});

test('strict CSP adapter contains no eval, inline script/style, remote fonts or dev imports', () => {
  const entry = read(root + 'index.html');
  assert.doesNotMatch(entry, /<script>(?!<)|style=|fonts\.google/);
  for (const file of readdirSync(new URL('../' + root + 'ui/', import.meta.url)).filter(name => name.endsWith('.js'))) {
    assert.doesNotMatch(read(root + 'ui/' + file), /new Function|\beval\(|\.style\b|style="|tools\//, file);
  }
  assert.match(read(root + 'ui/bot-worker.js'), /allowed\.has\(payload\.file\)/);
  assert.match(read('frontend/js/v3/apps/trade-arena/src/index.js'), /frame\.src = 'about:blank'; frame\.remove\(\)/);
});

test('malformed historical downloads fail instead of silently dropping assets', async () => {
  const { requireSeries, requireFunding } = await import('../frontend/arcade/trade-arena/engine/universe.js');
  const good = { t: [1, 2], c: [10, 11] };
  assert.equal(requireSeries('data/raw/crypto/1d/BTC.json', good), good);
  for (const bad of [null, undefined, 0, 'x', [], {}, { t: [] }, { t: 'nope' }])
    assert.throws(() => requireSeries('data/raw/crypto/1d/BTC.json', bad), /missing or malformed payload/);
  assert.equal(requireFunding('data/raw/crypto/funding/BTC.json', { t: [1], rate: [0.01] }).rate[0], 0.01);
  for (const bad of [null, {}, { t: [1] }, { rate: [0.01] }, { t: 'x', rate: [] }])
    assert.throws(() => requireFunding('data/raw/crypto/funding/BTC.json', bad), /missing or malformed payload/);
});

test('league page tallies races under the Trade Arena history key', () => {
  assert.match(read(root + 'ui/app.js'), /localStorage\.getItem\('trade-arena:history'\)/);
  assert.match(read(root + 'ui/race-view.js'), /localStorage\.setItem\('trade-arena:history'/);
});

test('unaudited stock intraday sessions cannot produce a race', () => {
  for (const market of ['stocks','mixed']) for (const tf of ['1h','4h']) assert.throws(() => prepareMarket([], {market,tf}), /Stock intraday races are unavailable/);
});

test('a non-responsive strategy has one absolute hard deadline and close settles calls', async () => {
  const { WebHost } = await import('../frontend/arcade/trade-arena/ui/web-host.js');
  const original = globalThis.Worker; const instances = [];
  globalThis.Worker = class { constructor() { this.sent = 0; this.stopped = false; instances.push(this); } postMessage(message) { this.sent++; if (message.type !== 'bar') queueMicrotask(() => this.onmessage({data:{id:message.id,ok:true,meta:{name:'HODL'}}})); } terminate() { this.stopped = true; } };
  try {
    const host = new WebHost('bots/house/hodl.js',7,10,10);
    assert.equal((await host.init({})).ok,true);
    const first = await host.onBar({}); assert.equal(first.timeout,true);
    for (let i=0;i<10;i++) { assert.equal((await host.onBar({})).timeout,true); await new Promise(resolve => { setTimeout(resolve,180); }); }
    await new Promise(resolve => { setTimeout(resolve,350); });
    assert.equal(host.dead,true); assert.equal(instances[0].sent,3); assert.equal(instances[0].stopped,true);
    const second = new WebHost('bots/house/hodl.js',7,10,10); second.close();
    assert.equal((await second.loaded).fatal,true); assert.equal(second.pending,null);
  } finally { globalThis.Worker = original; }
});

test('all supplied strategies trade through the actual historical market and simulation engine', async () => {
  const universe = await import('../frontend/arcade/trade-arena/engine/universe.js');
  const series = universe.UNIVERSE.crypto.map(asset => ({ symbol: asset.ticker, name: asset.name, market: 'crypto', sector: 'Crypto', cols: JSON.parse(read(root + 'data/raw/crypto/1d/' + asset.ticker + '.json')) }));
  const market = prepareMarket(series, { market: 'crypto', tf: '1d', start: Date.parse('2025-01-01'), end: Date.parse('2025-07-01'), seed: 7 }, {}, {}); // six months: regime-filtered bots may sit in cash through a short bear window
  const bots = roster.bots.map(bot => {
    const sandbox = { module: { exports: {} }, Math: Object.create(Math), console: { log() {} } };
    // Node-only test fixture evaluates the unchanged CommonJS contract; production never evaluates text.
    vm.runInNewContext(read(root + bot.file), sandbox, { timeout: 2000 });
    const implementation = sandbox.module.exports;
    const host = { async init(info) { try { implementation.init?.(info); return { ok: true }; } catch(error) { return { ok:false, error: error.message, fatal:true }; } }, async onBar(state) { try { return { ok:true, value: implementation.onBar(state) }; } catch(error) { return { ok:false,error:error.message }; } }, close() {} };
    return { id:bot.id, name:bot.name, host };
  });
  const result = await runRace(market, bots, DEFAULT_RULES);
  assert.equal(result.stats.length, roster.bots.length);
  for (const stat of result.stats) { assert.equal(stat.errors, 0); assert.equal(stat.retired, null); assert.ok(Number.isFinite(stat.final)); assert.ok(stat.trades > 0, 'strategy must place real trades'); }
});

test('every roster and benchmark colour has CSP-safe colour rules (inline style is forbidden, so avatars/bars are painted by data-color rules)', () => {
  const css = read(root + 'ui/app.css').toLowerCase();
  const colours = new Set();
  for (const bot of roster.bots) for (const key of ['color', 'colorLight', 'colorDark']) if (bot[key]) colours.add(bot[key].toLowerCase());
  for (const key of ['benchmarks', 'benchmarksLight', 'benchmarksDark']) for (const value of Object.values(roster[key] || {})) colours.add(String(value).toLowerCase());
  assert.ok(colours.size >= 26, 'roster should expose light and dark colours for every bot');
  for (const colour of colours) {
    for (const attr of ['data-color', 'data-bg', 'data-ink']) assert.ok(css.includes('[' + attr + '="' + colour + '"]'), attr + ' rule missing for ' + colour);
  }
});

test('random races draw a fresh, legal battlefield after the cutoff', async () => {
  const { randomRace } = await import('../frontend/arcade/trade-arena/ui/random-race.js');
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const r = randomRace({ cutoff: '2024-12-31', dataEnd: '2026-10-30' });
    assert.ok(['crypto', 'stocks', 'mixed', 'bist'].includes(r.market));
    assert.ok(r.market === 'crypto' || r.tf === '1d', 'stock and mixed races stay on daily bars: ' + JSON.stringify(r));
    assert.ok(r.start > '2024-12-31' && r.end <= '2026-10-30' && r.start < r.end, JSON.stringify(r));
    assert.ok(Number.isInteger(r.seed) && r.seed > 0);
    seen.add(`${r.market}|${r.tf}|${r.start}|${r.seed}`);
  }
  assert.ok(seen.size > 390, 'every press draws a different race');
  // Same draws, same race: a random race is reproducible from its numbers.
  const fixed = () => { let x = 0.1; return () => (x = (x * 9301 + 0.49297) % 1); };
  assert.deepEqual(randomRace({ cutoff: '2024-12-31', dataEnd: '2026-10-30' }, fixed()), randomRace({ cutoff: '2024-12-31', dataEnd: '2026-10-30' }, fixed()));
});

test('today’s basket page is wired, labelled as not investment advice and immune to time-limit noise', () => {
  const app = read(root + 'ui/app.js'), page = read(root + 'ui/basket.js'), index = read(root + 'index.html');
  assert.match(index, /href="#\/basket" data-r="basket"/);
  assert.match(app, /r === 'basket'\) renderBasket/);
  assert.match(app, /releaseBasket\(\)/);
  assert.match(page, /Not investment advice/);
  const client = read(root + 'ui/sim-client.js');
  assert.match(page, /import \{ simulate, yearBefore \} from '\.\/sim-client\.js'/);
  assert.match(client, /new Worker\(new URL\('\.\/race-worker\.js', import\.meta\.url\)/);
  assert.match(client, /barMs = 3000/);
  assert.doesNotMatch(page, /style=|innerHTML\s*=\s*[^`'"]*\+/);
});
