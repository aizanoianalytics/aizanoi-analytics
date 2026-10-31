// Drives a match: isolated workers for bots, direct input for humans.
(function () {
  'use strict';
  const TIMEOUT_MS = 400;
  const INIT_TIMEOUT_MS = 5000;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function centreDirection(snake, options) {
    const [x, y] = snake.body[0];
    const dx = (options.width - 1) / 2 - x;
    const dy = (options.height - 1) / 2 - y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
    return dy >= 0 ? 'down' : 'up';
  }

  function start(entries, options) {
    if (!Array.isArray(entries) || entries.length < 2 || entries.length > 12) {
      throw new RangeError('Choose between 2 and 12 fighters');
    }
    entries = entries.map(entry => entry && ({
      ...entry,
      ...(entry.custom ? { custom: { ...entry.custom } } : {}),
    }));
    const ids = new Set();
    for (const entry of entries) {
      if (!entry || typeof entry.id !== 'string' ||
          !/^[a-z0-9][a-z0-9.-]*$/.test(entry.id) ||
          entry.id.includes('..') || ids.has(entry.id)) {
        throw new TypeError('Fighters require unique, valid ids');
      }
      if (entry.human && (!entry.input || typeof entry.input.reset !== 'function')) {
        throw new TypeError('A human fighter requires input.reset(direction)');
      }
      ids.add(entry.id);
    }

    const game = SnakeEngine.create(entries.map(e => e.id), options);
    game.snakes.forEach((snake, i) => {
      snake.name = entries[i].name || snake.id;
      if (entries[i].human) {
        entries[i].input.reset(centreDirection(snake, game.options));
      }
    });

    const seed = game.options.seed;
    const pending = new Set();
    const workers = [];
    let stopped = false;
    let inFlight = null;

    function retire(x) {
      x.ok = false;
      if (x.w && !x.terminated) {
        x.terminated = true;
        x.w.terminate();
      }
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      for (const cancel of [...pending]) cancel();
      workers.forEach(retire);
    }

    function initialize(x, entry, i) {
      const w = x.w;
      return new Promise(resolve => {
        let settled = false;
        let timer;
        const settle = data => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          w.onmessage = null;
          w.onerror = null;
          w.onmessageerror = null;
          resolve(data);
        };
        const cancel = () => settle({ type: 'stopped' });
        pending.add(cancel);
        timer = setTimeout(() => {
          retire(x);
          settle({ type: 'fail' });
        }, INIT_TIMEOUT_MS);
        w.onmessage = event => {
          const data = event.data;
          if (data && (data.type === 'ready' || data.type === 'fail')) settle(data);
        };
        w.onerror = event => {
          if (event.preventDefault) event.preventDefault();
          settle({ type: 'fail' });
        };
        w.onmessageerror = () => settle({ type: 'fail' });
        try {
          // The regular worker alone resolves this validated id to bots/<id>.js.
          w.postMessage({ type: 'init', id: entry.id, seed: seed * 31 + i });
        } catch {
          settle({ type: 'fail' });
        }
      });
    }

    function prepareCustom(x, entry, i) {
      return new Promise(resolve => {
        let settled = false;
        let timer;
        const settle = result => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          resolve(result);
        };
        const cancel = () => settle({ type: 'stopped' });
        pending.add(cancel);
        // Fetching and creating the worker is bounded independently of init.
        timer = setTimeout(() => {
          retire(x);
          settle({ type: 'fail', detail: 'worker creation timed out (5000 ms)' });
        }, INIT_TIMEOUT_MS);

        let creation;
        try {
          creation = ArenaCustomBot.createWorker({
            game: 'snake-royale',
            workerUrl: '/arcade/snake-royale/bot-worker.js',
            scripts: ['/arcade/snake-royale/engine.js'],
            code: entry.custom.code,
          });
        } catch {
          settle({ type: 'fail', detail: 'worker could not be created' });
          return;
        }

        Promise.resolve(creation).then(worker => {
          if (settled || stopped) {
            worker.terminate();
            settle({ type: 'stopped' });
            return;
          }
          x.w = worker;
          clearTimeout(timer);
          pending.delete(cancel);
          settled = true;
          // Hand cancellation and the normal init deadline to initialize().
          resolve(initialize(x, entry, i));
        }, () => {
          settle({ type: 'fail', detail: 'worker could not be created' });
        });
      });
    }

    try {
      entries.forEach((entry, i) => {
        if (entry.human) {
          workers.push({ human: true, input: entry.input, ok: true });
          return;
        }
        const x = { w: null, ready: null, ok: true, terminated: false };
        workers.push(x);
        if (entry.custom) {
          x.ready = prepareCustom(x, entry, i);
        } else {
          x.w = new Worker('/arcade/snake-royale/bot-worker.js');
          x.ready = initialize(x, entry, i);
        }
      });
    } catch (error) {
      stop();
      throw error;
    }

    const loaded = Promise.all(workers.map(async (x, i) => {
      if (x.human) return;
      const response = await x.ready;
      if (!stopped && (!response || response.type !== 'ready')) {
        retire(x);
        game.snakes[i].alive = false;
        game.snakes[i].death = { turn: 0, cause: 'load-error', by: null };
      }
    }));

    function ask(x, state) {
      if (!x.ok || stopped) return Promise.resolve(null);
      if (x.human) {
        const direction = x.input.dir;
        // Commit once per turn: buffered key presses cannot reverse into the neck.
        x.input.reset(direction);
        return Promise.resolve(direction);
      }
      return new Promise(resolve => {
        let settled = false;
        let timer;
        const settle = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          x.w.onmessage = null;
          x.w.onerror = null;
          x.w.onmessageerror = null;
          resolve(value);
        };
        const fail = () => {
          retire(x);
          settle(null);
        };
        const cancel = () => settle(null);
        pending.add(cancel);
        timer = setTimeout(fail, TIMEOUT_MS);
        x.w.onmessage = event => {
          const data = event.data;
          if (!data || data.type !== 'move' || data.turn !== state.turn) return;
          settle(typeof data.move === 'string' ? data.move : null);
        };
        x.w.onerror = event => {
          if (event.preventDefault) event.preventDefault();
          fail();
        };
        x.w.onmessageerror = fail;
        try {
          x.w.postMessage({ type: 'move', state });
        } catch {
          fail();
        }
      });
    }

    function turn() {
      if (inFlight) return inFlight;
      const task = (async () => {
        await loaded;
        if (stopped || (typeof game.finished === 'function' && game.finished())) return [];
        const moves = Object.create(null);
        // Build every snapshot before asking any participant.
        const requests = workers.map((x, i) => {
          const snake = game.snakes[i];
          return snake.alive ? { x, id: snake.id, state: game.botState(snake.id) } : null;
        }).filter(Boolean);
        await Promise.all(requests.map(async request => {
          moves[request.id] = await ask(request.x, request.state);
        }));
        if (stopped) return [];
        // Every living request contributes an explicit value, including null fallback.
        for (const request of requests) {
          if (!own(moves, request.id)) moves[request.id] = null;
        }
        return game.step(moves);
      })();
      inFlight = task.finally(() => { inFlight = null; });
      return inFlight;
    }

    return { game, turn, stop, loaded };
  }

  window.SnakeRunner = { start };
})();
