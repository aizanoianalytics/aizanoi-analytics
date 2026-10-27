'use strict';

if (!self.__ARENA_INLINE__) {
  importScripts('engine.js');
}

self.module = { exports: {} };
self.exports = self.module.exports;
self.window = self;
self.console = { log() {}, error() {}, warn() {}, info() {}, debug() {} };

let decide = null;
let initialized = false;

function randomGenerator(seed) {
  let value = seed >>> 0;
  return function () {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function sanitize(input) {
  if (!input || typeof input !== 'object' ||
      !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
      typeof input.kick !== 'boolean') {
    return null;
  }
  return {
    x: Math.max(-1, Math.min(1, input.x)),
    y: Math.max(-1, Math.min(1, input.y)),
    kick: input.kick
  };
}

self.onmessage = event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'init') {
    if (initialized) return;
    initialized = true;
    try {
      // Inline top-level bot code has already run and must not depend on
      // Math.random. Seeded randomness is available inside decide(state).
      Math.random = randomGenerator((message.seed >>> 0) ^ 0x9e3779b9);
      let exported;
      if (self.__ARENA_INLINE__) {
        if (self.__ARENA_LOAD_ERROR__ !== undefined) {
          throw new Error(self.__ARENA_LOAD_ERROR__);
        }
        exported = self.__ARENA_BOT__;
      } else {
        const id = String(message.id || '');
        if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) {
          throw new Error('Invalid bot id');
        }
        importScripts(`bots/${id}.js`);
        exported = self.module.exports;
      }
      decide = typeof exported === 'function' ? exported :
        exported && typeof exported.decide === 'function' ? exported.decide : null;
      if (!decide) throw new Error('Bot must export decide(state)');
      postMessage({ type: 'ready' });
    } catch (error) {
      decide = null;
      postMessage({
        type: 'fail',
        detail: String(error && error.message || error).slice(0, 120)
      });
    }
    return;
  }

  if (message.type !== 'decide' || !decide || !message.state) return;
  let input = null;
  try {
    input = sanitize(decide(message.state));
  } catch {
    input = null;
  }
  const reply = { type: 'decide', step: message.step, input };
  if (Number.isSafeInteger(message.request)) reply.request = message.request;
  postMessage(reply);
};
