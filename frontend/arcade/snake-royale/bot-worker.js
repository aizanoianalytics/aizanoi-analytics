// One worker per contestant. Regular bots load through validated importScripts.
// Inline bots are compiled by the classic Blob worker loader, not page code.
// Top-level custom bot code must not depend on Math.random: seeded randomness
// is installed at init and is available inside move(state).
'use strict';

if (!self.__ARENA_INLINE__) {
  importScripts('engine.js');
}

self.module = { exports: {} };
self.exports = self.module.exports;
self.window = self;
self.console = { log() {}, error() {}, warn() {}, info() {} };
let fn = null;

self.onmessage = (e) => {
  const m = e.data;
  if (!m || typeof m !== 'object') return;
  if (m.type === 'init') {
    try {
      const r = SnakeEngine.rng(m.seed ^ 0x9e3779b9);
      Math.random = r; // seeded, so every match replays exactly
      let exp;
      if (self.__ARENA_INLINE__) {
        if (self.__ARENA_LOAD_ERROR__ !== undefined) {
          throw new Error(self.__ARENA_LOAD_ERROR__);
        }
        exp = self.__ARENA_BOT__;
      } else {
        // Only a plain fighter id may decide which script is loaded, and it is
        // resolved against this worker's own directory, so nothing from the page
        // (or a tampered manifest) can point the import at another origin.
        const id = String(m.id || '');
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) throw new Error(`invalid fighter id: ${id}`);
        importScripts(`bots/${id}.js`);
        exp = self.module.exports;
      }
      fn = (typeof exp === 'function' && exp) || (exp && typeof exp.move === 'function' && exp.move) ||
           (typeof self.move === 'function' && self.move);
      if (!fn) throw new Error('bot does not export move(state)');
      postMessage({ type: 'ready' });
    } catch (err) {
      fn = null;
      postMessage({ type: 'fail', detail: String((err && err.message) || err).slice(0, 120) });
    }
  } else if (m.type === 'move') {
    // Preserve correlation even if the bot changes its state object.
    const turn = m.state && m.state.turn;
    let out = null;
    try { out = fn(m.state); } catch (err) { out = null; }
    postMessage({ type: 'move', turn, move: typeof out === 'string' ? out : null });
  }
};
