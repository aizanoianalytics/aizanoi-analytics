'use strict';

importScripts('engine.js');

self.module = { exports: {} };
self.exports = self.module.exports;
self.window = self;
self.console = { log() {}, error() {}, warn() {}, info() {} };

let fn = null;
let initialized = false;

function detail(error) {
  return String((error && error.message) || error).slice(0, 120);
}

self.onmessage = event => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'init') {
    try {
      if (initialized) throw new Error('bot is already initialized');
      initialized = true;
      Math.random = ChessEngine.rng(message.seed ^ 0x9e3779b9);

      // The page supplies an identifier, never a script location.
      const id = String(message.id || '');
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(id) || id.includes('..')) {
        throw new Error(`invalid fighter id: ${id}`);
      }
      importScripts(`bots/${id}.js`);

      const exported = self.module.exports;
      fn = (typeof exported === 'function' && exported) ||
        (exported && typeof exported.move === 'function' &&
          exported.move.bind(exported)) ||
        (typeof self.move === 'function' && self.move);

      if (!fn) throw new Error('bot does not export move(state)');
      postMessage({ type: 'ready' });
    } catch (error) {
      fn = null;
      postMessage({ type: 'fail', detail: detail(error) });
    }
    return;
  }

  if (message.type === 'move') {
    // Never read correlation data back from a bot-mutable state object.
    const ply = message.state && message.state.ply;
    let move = null;
    let failure = null;
    try {
      if (!fn) throw new Error('bot is not initialized');
      const returned = fn(message.state);
      if (typeof returned !== 'string') {
        failure = 'bot must return a synchronous UCI string';
      } else {
        move = returned;
      }
    } catch (error) {
      failure = `bot threw: ${detail(error)}`;
    }
    const answer = { type: 'move', ply, move };
    if (failure) answer.detail = failure;
    postMessage(answer);
  }
};
