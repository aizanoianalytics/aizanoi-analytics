(function () {
  'use strict';

  const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
  const TIMEOUT_MS = 150;

  function start(seats, options = {}) {
    const entries = seats.slice();
    const seed = Number(options.seed ?? 1) >>> 0;
    const game = MazeEngine.create(entries.map(({ id, role, name }) => ({ id, role, name })), {
      ...options, seed,
    });
    const pending = new Set();
    const workers = [];
    let stopped = false;
    let turning = false;

    function retire(x) {
      x.ok = false;
      x.w.onmessage = null;
      x.w.onerror = null;
      x.w.onmessageerror = null;
      x.w.terminate();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      [...pending].forEach(cancel => cancel());
      workers.forEach(x => { if (x.w) retire(x); });
    }

    function exchange(x, message, timeout, accept) {
      if (stopped || !x.ok) return Promise.resolve(null);
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
        const cancel = () => settle(null);
        const fail = () => {
          settle(null);
          retire(x);
        };
        pending.add(cancel);
        timer = setTimeout(fail, timeout);
        x.w.onmessage = event => {
          if (accept(event.data)) settle(event.data);
        };
        x.w.onerror = event => {
          if (event.preventDefault) event.preventDefault();
          fail();
        };
        x.w.onmessageerror = fail;
        try {
          x.w.postMessage(message);
        } catch {
          fail();
        }
      });
    }

    let loaded;
    try {
      const agents = game.agents();
      entries.forEach((entry, index) => {
        if (entry.human) {
          const agent = agents.find(a => a.id === entry.id);
          entry.input.reset(DIRECTIONS.has(agent?.dir) ? agent.dir : 'up');
          workers.push({ human: true, input: entry.input, ok: true });
          return;
        }
        const x = { w: new Worker('/arcade/maze-chase/bot-worker.js'), ok: true };
        workers.push(x);
        x.ready = exchange(x, {
          type: 'init', id: entry.botId, seed: (Math.imul(seed, 31) + index) >>> 0,
        }, 5000, data => data && (data.type === 'ready' || data.type === 'fail'))
          .then(data => {
            if (data?.type !== 'ready' && x.ok) retire(x);
          });
      });
      loaded = Promise.all(workers.map(x => x.ready));
    } catch (error) {
      stop();
      throw error;
    }

    async function turn() {
      if (turning) throw new Error('A turn is already pending');
      turning = true;
      try {
        await loaded;
        if (stopped || game.finished()) return [];
        const moves = Object.create(null);
        const agents = game.agents();
        await Promise.all(entries.map(async (entry, index) => {
          const agent = agents.find(a => a.id === entry.id);
          if (!agent || !agent.alive || agent.respawnIn > 0) return;
          const x = workers[index];
          if (x.human) {
            const dir = DIRECTIONS.has(x.input.dir) ? x.input.dir : null;
            if (dir) x.input.reset(dir);
            moves[entry.id] = dir;
            return;
          }
          const state = game.botState(entry.id);
          const answer = await exchange(x, { type: 'move', state }, TIMEOUT_MS,
            data => data && data.type === 'move' && data.tick === state.tick);
          moves[entry.id] = answer && (DIRECTIONS.has(answer.move) || answer.move === 'stay')
            ? answer.move : null;
        }));
        return stopped ? [] : game.step(moves);
      } finally {
        turning = false;
      }
    }

    return { game, loaded, turn, stop };
  }

  window.MazeRunner = { start };
})();
