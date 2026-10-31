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

self.onmessage = (event) => {
  const message = event.data || {};

  if (message.type === 'init') {
    if (initialized) return;
    initialized = true;

    try {
      // Inline top-level bot code has already run. Do not use Math.random
      // there; seeded randomness is available inside act(state).
      Math.random = PokerEngine.rng(message.seed ^ 0x9e3779b9);

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

      fn = typeof exported === 'function'
        ? exported
        : exported && typeof exported.act === 'function'
          ? exported.act.bind(exported)
          : null;

      if (!fn) throw new Error('Bot does not export act(state)');
      postMessage({ type: 'ready' });
    } catch (error) {
      fn = null;
      postMessage({
        type: 'fail',
        detail: String((error && error.message) || error).slice(0, 120),
      });
    }

    return;
  }

  if (message.type !== 'act') return;

  let action = null;

  try {
    const answer = fn && fn(message.state);
    const candidate = typeof answer === 'string' ? { type: answer } : answer;

    if (candidate && typeof candidate.type === 'string') {
      action = { type: candidate.type };
      if (typeof candidate.amount === 'number' && Number.isFinite(candidate.amount)) {
        action.amount = candidate.amount;
      }
    }
  } catch (error) {
    action = null;
  }

  postMessage({
    type: 'act',
    handNumber: message.handNumber,
    decisionId: message.decisionId,
    action,
  });
};
