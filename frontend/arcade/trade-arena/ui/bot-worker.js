// One shipped, allowlisted strategy per classic worker. Not an untrusted-code sandbox.
(() => {
let bot = null, loadError = null, logs = 0;
const allowed = new Set(['bots/ai/sonnet-5-5.js','bots/ai/haiku-5-5.js','bots/house/hodl.js','bots/house/monkey.js','bots/house/momentum.js']);
self.onmessage = ({ data: { id, type, payload } }) => {
  if (type === 'load') {
    let a = payload.seed >>> 0;
    Math.random = () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const log = (...args) => { if (logs++ < 200) self.postMessage({ log: args.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ').slice(0, 300) }); };
    self.console = { log, info: log, warn: log, error: log, debug() {} };
    self.module = { exports: {} };
    try {
      if (!allowed.has(payload.file)) throw new Error('Unknown shipped strategy');
      importScripts(new URL('../' + payload.file, self.location.href).href);
      bot = typeof self.module.exports === 'function' ? { onBar: self.module.exports } : self.module.exports;
      if (!bot || typeof bot.onBar !== 'function') throw new Error('bot must export onBar(state)');
    } catch (err) { loadError = String(err?.message || err); }
    return self.postMessage({ id, ok: !loadError, error: loadError, meta: { name: typeof bot?.name === 'string' ? bot.name.slice(0, 40) : null } });
  }
  const t0 = performance.now();
  try {
    let value = type === 'init' ? (bot.init ? (bot.init(payload), null) : null) : bot.onBar(payload);
    value = value === undefined ? null : JSON.parse(JSON.stringify(value));
    self.postMessage({ id, ok: true, value, ms: performance.now() - t0 });
  } catch (err) { self.postMessage({ id, ok: false, error: String(err?.message || err).slice(0, 300), fatal: type === 'init', ms: performance.now() - t0 }); }
};
})();
