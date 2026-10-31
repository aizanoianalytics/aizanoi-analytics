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
    if (/^(bots|data)\//.test(entry.path)) assert.equal(hash, entry.sourceSha256, 'unchanged owner payload ' + entry.path);
  }
  const catalog = JSON.parse(read(root + 'data/catalog.json'));
  assert.equal(catalog.crypto.length, 35); assert.equal(catalog.stocks.length, 30); assert.equal(catalog.context.length, 7);
  assert.deepEqual(roster.bots.map(bot => bot.id), ['sonnet-5-5', 'haiku-5-5', 'momentum', 'hodl', 'monkey']);
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
  const market = prepareMarket(series, { market: 'crypto', tf: '1d', start: Date.parse('2025-01-01'), end: Date.parse('2025-02-01'), seed: 7 }, {}, {});
  const bots = roster.bots.map(bot => {
    const sandbox = { module: { exports: {} }, Math: Object.create(Math), console: { log() {} } };
    // Node-only test fixture evaluates the unchanged CommonJS contract; production never evaluates text.
    vm.runInNewContext(read(root + bot.file), sandbox, { timeout: 2000 });
    const implementation = sandbox.module.exports;
    const host = { async init(info) { try { implementation.init?.(info); return { ok: true }; } catch(error) { return { ok:false, error: error.message, fatal:true }; } }, async onBar(state) { try { return { ok:true, value: implementation.onBar(state) }; } catch(error) { return { ok:false,error:error.message }; } }, close() {} };
    return { id:bot.id, name:bot.name, host };
  });
  const result = await runRace(market, bots, DEFAULT_RULES);
  assert.equal(result.stats.length, 5);
  for (const stat of result.stats) { assert.equal(stat.errors, 0); assert.equal(stat.retired, null); assert.ok(Number.isFinite(stat.final)); assert.ok(stat.trades > 0, 'strategy must place real trades'); }
});
