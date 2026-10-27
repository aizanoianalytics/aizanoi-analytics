(function () {
  'use strict';

  const TIMEOUT_MS = 1000;

  function start(options) {
    const seats = [options.white, options.black].map(seat => ({ ...seat }));
    const game = ChessEngine.create({
      variant: options.variant || 'standard',
      position960: options.position960
    });
    const pending = new Set();
    const workers = [];
    const seed = new Uint32Array(1);
    crypto.getRandomValues(seed);

    let stopped = false;
    let active = null;
    let human = null;

    function stop() {
      if (stopped) return;
      stopped = true;
      for (const cancel of [...pending]) cancel();
      for (const seat of workers) {
        if (seat.worker) seat.worker.terminate();
      }
    }

    function exchange(seat, message, accept) {
      return new Promise(resolve => {
        let settled = false;
        let timer;

        const worker = seat.worker;
        const deadline = performance.now() + TIMEOUT_MS;

        function settle(value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          worker.onmessage = null;
          worker.onerror = null;
          worker.onmessageerror = null;
          resolve(value);
        }

        const cancel = () => settle({ type: 'stopped' });
        pending.add(cancel);

        timer = setTimeout(() => {
          settle({ type: 'fail', detail: 'timed out (1000 ms)' });
        }, TIMEOUT_MS);

        worker.onmessage = event => {
          if (performance.now() >= deadline) {
            settle({ type: 'fail', detail: 'timed out (1000 ms)' });
          } else if (accept(event.data)) {
            settle(event.data);
          }
        };

        worker.onerror = event => {
          if (event.preventDefault) event.preventDefault();
          settle({ type: 'fail', detail: 'worker error' });
        };

        worker.onmessageerror = () => {
          settle({ type: 'fail', detail: 'unreadable worker response' });
        };

        try {
          worker.postMessage(message);
        } catch (error) {
          settle({ type: 'fail', detail: 'worker communication failed' });
        }
      });
    }

    for (let index = 0; index < seats.length; index += 1) {
      const entry = seats[index];
      const seat = {
        human: Boolean(entry.human),
        worker: null,
        ready: null
      };
      workers.push(seat);

      if (seat.human) continue;

      try {
        seat.worker = new Worker('/arcade/chess/bot-worker.js');
        seat.ready = exchange(seat, {
          type: 'init',
          id: entry.id,
          seed: (seed[0] ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0
        }, data => {
          return data && (data.type === 'ready' || data.type === 'fail');
        });
      } catch (error) {
        seat.ready = Promise.resolve({
          type: 'fail',
          detail: 'worker could not be created'
        });
      }
    }

    function forfeit(color, detail) {
      if (!game.status().over) game.forfeit(color, detail);
      stop();
      return { type: 'forfeit', color, detail, status: game.status() };
    }

    const loaded = Promise.all(workers.map(seat => seat.ready)).then(results => {
      if (stopped) return;

      for (let index = 0; index < results.length; index += 1) {
        if (workers[index].human) continue;
        const result = results[index];

        if (!result || result.type !== 'ready') {
          const detail = (result && result.detail) || 'invalid response';
          forfeit(index === 0 ? 'w' : 'b', `load failed: ${detail}`);
          break;
        }
      }
    });

    function commit(uci) {
      const color = game.turn;
      const result = game.move(uci);
      if (!result.ok) return result;
      return { type: 'move', color, uci, ...result, status: game.status() };
    }

    function waitForHuman() {
      return new Promise(resolve => {
        function finish(event) {
          pending.delete(cancel);
          human = null;
          resolve(event);
        }

        const cancel = () => finish({
          type: 'stopped',
          status: game.status()
        });

        human = { finish };
        pending.add(cancel);
      });
    }

    async function advance() {
      await loaded;

      if (game.status().over) {
        return { type: 'over', status: game.status() };
      }
      if (stopped) {
        return { type: 'stopped', status: game.status() };
      }

      const color = game.turn;
      const seat = workers[color === 'w' ? 0 : 1];
      if (seat.human) return waitForHuman();

      const state = game.botState();
      const reply = await exchange(seat, { type: 'move', state }, data => {
        return data && (
          data.type === 'fail' ||
          (data.type === 'move' && data.ply === state.ply)
        );
      });

      if (stopped) {
        return { type: 'stopped', status: game.status() };
      }
      if (reply.type !== 'move') {
        return forfeit(color, reply.detail || 'bot failed');
      }
      if (typeof reply.move !== 'string' || !state.legalMoves.includes(reply.move)) {
        return forfeit(color, reply.detail || 'illegal move');
      }

      const event = commit(reply.move);
      if (!event.ok) return forfeit(color, 'illegal move');
      return event;
    }

    function next() {
      if (active) return active;
      active = advance().finally(() => { active = null; });
      return active;
    }

    function submitHuman(uci) {
      if (stopped || game.status().over) {
        return { ok: false, error: 'Game is not active' };
      }
      if (!human || !seats[game.turn === 'w' ? 0 : 1].human) {
        return { ok: false, error: 'Not waiting for a human move' };
      }
      if (typeof uci !== 'string') {
        return { ok: false, error: 'Move must be a UCI string' };
      }

      const event = commit(uci);
      if (event.ok) human.finish(event);
      return event;
    }

    return { game, loaded, next, submitHuman, stop };
  }

  window.ChessRunner = Object.freeze({ start });
})();
