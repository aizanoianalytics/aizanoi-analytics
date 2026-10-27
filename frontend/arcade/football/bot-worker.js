'use strict';

importScripts('engine.js');

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
      Math.random = randomGenerator((message.seed >>> 0) ^ 0x9e3779b9);
      const id = String(message.id || '');
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) {
        throw new Error('Invalid bot id');
      }
      importScripts(`bots/${id}.js`);
      const exported = self.module.exports;
      decide = typeof exported === 'function' ? exported :
        exported && typeof exported.decide === 'function' ? exported.decide : null;
      if (!decide) throw new Error('Bot must export decide(state)');
      postMessage({ type: 'ready' });
    } catch (error) {
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
  postMessage({ type: 'decide', step: message.step, input });
};
