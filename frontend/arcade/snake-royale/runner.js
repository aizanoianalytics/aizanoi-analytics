// Drives a match: one worker per bot, engine core in the page. Exposes SnakeRunner.start(entries, options) -> Match.
(function () {
  'use strict';
  const TIMEOUT_MS = 400; // per move; a bot that answers later keeps its last direction (counted as an error)

  function start(entries, options) {
    const game = SnakeEngine.create(entries.map(e => e.id), options);
    game.snakes.forEach((s, i) => { s.name = entries[i].name; });
    const seed = game.options.seed;
    const workers = entries.map((e, i) => {
      const w = new Worker(new URL('bot-worker.js', document.baseURI).href);
      const ready = new Promise(res => {
        w.onmessage = ev => res(ev.data);
        // The worker resolves the bot file itself from its own id: a URL taken from a
        // message and handed to importScripts is a dynamic script load, which CodeQL
        // (correctly) flags as an untrusted redirect sink.
        w.postMessage({ type: 'init', id: e.id, seed: seed * 31 + i });
      });
      return { w, ready, ok: true };
    });
    const loaded = Promise.all(workers.map(async (x, i) => {
      const r = await x.ready;
      if (r.type !== 'ready') {
        x.ok = false; game.snakes[i].alive = false;
        game.snakes[i].death = { turn: 0, cause: 'load-error', by: null };
      }
    }));

    function ask(x, i, state) {
      return new Promise(res => {
        if (!x.ok) return res(null);
        const t = setTimeout(() => { x.w.onmessage = null; res(null); }, TIMEOUT_MS);
        x.w.onmessage = ev => { if (ev.data.turn !== state.turn) return; clearTimeout(t); x.w.onmessage = null; res(ev.data.move); };
        x.w.postMessage({ type: 'move', state });
      });
    }
    async function turn() {
      await loaded;
      const moves = {};
      await Promise.all(workers.map(async (x, i) => {
        const s = game.snakes[i];
        if (!s.alive) return;
        moves[s.id] = await ask(x, i, game.botState(s.id));
      }));
      return game.step(moves);
    }
    function stop() { workers.forEach(x => x.w.terminate()); }
    return { game, turn, stop, loaded };
  }
  window.SnakeRunner = { start };
})();
