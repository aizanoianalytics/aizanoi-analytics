'use strict';

if (!self.__ARENA_INLINE__) {
  importScripts('engine.js');
}

self.module = { exports: {} };
self.exports = self.module.exports;
self.window = self;
self.console = { log() {}, error() {}, warn() {}, info() {} };

let fn = null;
let initialized = false;

self.onmessage = event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'init') {
    if (initialized) return;
    initialized = true;

    try {
      // Inline bot top-level code has already run and must not depend on
      // Math.random. Seeded randomness is available inside move(state).
      Math.random = FlagEngine.rng(message.seed ^ 0x9e3779b9);

      let exported;
      if (self.__ARENA_INLINE__) {
        if (self.__ARENA_LOAD_ERROR__ !== undefined) {
          throw new Error(self.__ARENA_LOAD_ERROR__);
        }
        exported = self.__ARENA_BOT__;
      } else {
        const id = String(message.id || '');
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) {
          throw new Error(`Invalid bot id: ${id}`);
        }

        importScripts(`bots/${id}.js`);

        exported = self.module.exports;
      }

      fn = (typeof exported === 'function' && exported) ||
        (exported && typeof exported.move === 'function' && exported.move.bind(exported)) ||
        (typeof self.move === 'function' && self.move);

      if (!fn) throw new Error('Bot does not export move(state)');
      postMessage({ type: 'ready' });
    } catch (error) {
      fn = null;
      postMessage({
        type: 'fail',
        detail: String((error && error.message) || error).slice(0, 120),
      });
    }
  } else if (message.type === 'move' && message.state) {
    // Capture correlation data before handing the mutable state to the bot.
    const tick = message.state.tick;
    let move = null;
    try {
      if (fn) move = fn(message.state);
    } catch (error) {
      move = null;
    }

    postMessage({
      type: 'move',
      tick,
      move: typeof move === 'string' ? move : null,
    });
  }
};
