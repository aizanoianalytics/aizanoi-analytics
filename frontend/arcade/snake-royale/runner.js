// Drives a match: one worker per bot, engine core in the page. Exposes SnakeRunner.start(entries, options) -> Match.
(function () {
  'use strict';
  const TIMEOUT_MS = 400; // per move; a bot that answers later keeps its last direction (counted as an error)

  function start(entries, options) {
    const game = SnakeEngine.create(entries.map(e => e.id), options);
    game.snakes.forEach((s, i) => { s.name = entries[i].name; });
    const seed = game.options.seed;
    let stopped = false;
    const pending = new Set();
    const workers = entries.map((e, i) => {
      const w = new Worker('/arcade/snake-royale/bot-worker.js');
      const ready = new Promise(res => {
        const settle = data => { pending.delete(cancel); w.onmessage = null; res(data); };
        const cancel = () => settle({ type: 'stopped' });
        pending.add(cancel);
        w.onmessage = ev => settle(ev.data);
        w.onerror = () => settle({ type: 'fail' });
        // The worker resolves the bot file itself from its own id: a URL taken from a
        // message and handed to importScripts is a dynamic script load, which CodeQL
        // (correctly) flags as an untrusted redirect sink.
        w.postMessage({ type: 'init', id: e.id, seed: seed * 31 + i });
      });
      return { w, ready, ok: true };
    });
    const loaded = Promise.all(workers.map(async (x, i) => {
      const r = await x.ready;
      if (!stopped && r.type !== 'ready') {
        x.ok = false; game.snakes[i].alive = false;
        game.snakes[i].death = { turn: 0, cause: 'load-error', by: null };
      }
    }));

    function ask(x, i, state) {
      return new Promise(res => {
        if (!x.ok || stopped) return res(null);
        const settle = value => { clearTimeout(t); pending.delete(cancel); x.w.onmessage = null; res(value); };
        const cancel = () => settle(null);
        const t = setTimeout(() => settle(null), TIMEOUT_MS);
        pending.add(cancel);
        x.w.onmessage = ev => { if (ev.data.turn !== state.turn) return; settle(ev.data.move); };
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
      return stopped ? [] : game.step(moves);
    }
    function stop() {
      if (stopped) return;
      stopped = true;
      for (const cancel of [...pending]) cancel();
      workers.forEach(x => x.w.terminate());
    }
    return { game, turn, stop, loaded };
  }
  window.SnakeRunner = { start };
})();
