// One worker per contestant. Loads the contestant's bot file with importScripts (CSP-safe, no eval) and answers move requests.
// A bot is any script that sets module.exports = move(state) / { move }  or defines a global move(state).
'use strict';
importScripts('engine.js');
self.module = { exports: {} };
self.exports = self.module.exports;
self.window = self;
self.console = { log() {}, error() {}, warn() {}, info() {} };
let fn = null;

self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      const r = SnakeEngine.rng(m.seed ^ 0x9e3779b9);
      Math.random = r; // seeded, so every match replays exactly
      // Only a plain fighter id may decide which script is loaded, and it is
      // resolved against this worker's own directory, so nothing from the page
      // (or a tampered manifest) can point the import at another origin.
      const id = String(m.id || '');
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) throw new Error(`invalid fighter id: ${id}`);
      importScripts(`bots/${id}.js`);
      const exp = self.module.exports;
      fn = (typeof exp === 'function' && exp) || (exp && typeof exp.move === 'function' && exp.move) ||
           (typeof self.move === 'function' && self.move);
      if (!fn) throw new Error('bot does not export move(state)');
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'fail', detail: String((err && err.message) || err).slice(0, 120) });
    }
  } else if (m.type === 'move') {
    let out = null;
    try { out = fn(m.state); } catch (err) { out = null; }
    postMessage({ type: 'move', turn: m.state.turn, move: typeof out === 'string' ? out : null });
  }
};
