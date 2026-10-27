// Drives a match: workers for bots, direct input for humans, engine core in the page.
(function () {
  'use strict';
  const TIMEOUT_MS = 400;

  function centreDirection(snake, options) {
    const [x, y] = snake.body[0];
    const dx = (options.width - 1) / 2 - x;
    const dy = (options.height - 1) / 2 - y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function start(entries, options) {
    const game = SnakeEngine.create(entries.map(e => e.id), options);
    game.snakes.forEach((s, i) => {
      s.name = entries[i].name;
      if (entries[i].human) entries[i].input.reset(centreDirection(s, game.options));
    });

    const seed = game.options.seed;
    let stopped = false;
    const pending = new Set(), workers = [];

    function stop() {
      if (stopped) return;
      stopped = true;
      for (const cancel of [...pending]) cancel();
      workers.forEach(x => { if (x.w) x.w.terminate(); });
    }

    try {
      entries.forEach((e, i) => {
        if (e.human) {
          workers.push({ human: true, input: e.input, ok: true });
          return;
        }

        const w = new Worker('/arcade/snake-royale/bot-worker.js');
        const x = { w, ready: null, ok: true };
        workers.push(x);
        x.ready = new Promise(res => {
          let settled = false;
          const settle = data => {
            if (settled) return;
            settled = true;
            pending.delete(cancel);
            w.onmessage = null;
            w.onerror = null;
            res(data);
          };
          const cancel = () => settle({ type: 'stopped' });
          pending.add(cancel);
          w.onmessage = ev => settle(ev.data);
          w.onerror = () => settle({ type: 'fail' });
          // Only the worker resolves a bot id to its script.
          try {
            w.postMessage({ type: 'init', id: e.id, seed: seed * 31 + i });
          } catch (err) {
            settle({ type: 'fail' });
          }
        });
      });
    } catch (err) {
      stop();
      throw err;
    }

    const loaded = Promise.all(workers.map(async (x, i) => {
      if (x.human) return;
      const r = await x.ready;
      if (!stopped && (!r || r.type !== 'ready')) {
        x.ok = false;
        game.snakes[i].alive = false;
        game.snakes[i].death = { turn: 0, cause: 'load-error', by: null };
      }
    }));

    function ask(x, i, state) {
      if (!x.ok || stopped) return Promise.resolve(null);
      if (x.human) {
        const dir = x.input.dir;
        // Commit once per turn, so multiple key presses cannot reverse into the neck.
        x.input.reset(dir);
        return Promise.resolve(dir);
      }

      return new Promise(res => {
        let settled = false;
        const settle = value => {
          if (settled) return;
          settled = true;
          clearTimeout(t);
          pending.delete(cancel);
          x.w.onmessage = null;
          x.w.onerror = null;
          res(value);
        };
        const cancel = () => settle(null);
        const t = setTimeout(() => settle(null), TIMEOUT_MS);
        pending.add(cancel);
        x.w.onmessage = ev => {
          if (!ev.data || ev.data.turn !== state.turn) return;
          settle(ev.data.move);
        };
        x.w.onerror = () => settle(null);
        try {
          x.w.postMessage({ type: 'move', state });
        } catch (err) {
          settle(null);
        }
      });
    }

    async function turn() {
      await loaded;
      if (stopped) return [];
      const moves = {};
      await Promise.all(workers.map(async (x, i) => {
        const s = game.snakes[i];
        if (!s.alive) return;
        moves[s.id] = await ask(x, i, game.botState(s.id));
      }));
      return stopped ? [] : game.step(moves);
    }

    return { game, turn, stop, loaded };
  }

  window.SnakeRunner = { start };
})();
