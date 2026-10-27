'use strict';

importScripts('engine.js');

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
      Math.random = PokerEngine.rng(message.seed ^ 0x9e3779b9);

      const id = String(message.id || '');
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) {
        throw new Error(`Invalid bot id: ${id}`);
      }

      importScripts(`bots/${id}.js`);

      const exported = self.module.exports;
      fn = typeof exported === 'function'
        ? exported
        : exported && typeof exported.act === 'function'
          ? exported.act.bind(exported)
          : null;

      if (!fn) throw new Error('Bot does not export act(state)');
      postMessage({ type: 'ready' });
    } catch (error) {
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
