'use strict';
importScripts('engine.js');
self.module = { exports: {} };
self.exports = self.module.exports;
self.window = self;
self.console = { log() {}, error() {}, warn() {}, info() {}, debug() {}, trace() {} };

const allowed = ['propose', 'answer', 'orders', 'retreats', 'builds'];
let bot = null;
let initialized = false;

self.onmessage = event => {
  const m = event.data;
  if (!m || typeof m !== 'object') return;

  if (m.type === 'init' && !initialized) {
    initialized = true;
    try {
      Math.random = PactEngine.rng(m.seed ^ 0x9e3779b9);
      const id = String(m.id || '');
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) {
        throw new Error('Invalid bot id.');
      }
      importScripts(`bots/${id}.js`);
      bot = self.module.exports;
      if (!bot || typeof bot.orders !== 'function') {
        throw new Error('Bot must export orders(state).');
      }
      postMessage({ type: 'ready' });
    } catch (error) {
      bot = null;
      postMessage({
        type: 'fail',
        detail: String(error.message || error).slice(0, 120)
      });
    }
    return;
  }

  if (m.type !== 'call' || !allowed.includes(m.call)) return;
  let payload = null;
  try {
    if (bot && typeof bot[m.call] === 'function') {
      payload = bot[m.call](m.state);
    }
  } catch {
    payload = null;
  }
  try {
    postMessage({ type: 'answer', call: m.call, key: m.key, payload });
  } catch {
    postMessage({ type: 'answer', call: m.call, key: m.key, payload: null });
  }
};
