(function () {
  'use strict';

  const DIRECTIONS = new Set(['up', 'down', 'left', 'right']);
  const TIMEOUT_MS = 150;

  function humanControl(seat) {
    const input = seat.input;
    const keys = new Map();
    const pointers = new Map();
    let pressed = false;

    const off = input.onKey((direction, event) => {
      if (!DIRECTIONS.has(direction)) return;
      input.reset(direction);
      pressed = true;
      if (event && event.code) keys.set(event.code, direction);
    });

    const keyup = event => keys.delete(event.code);
    const release = event => pointers.delete(event.pointerId);
    const clear = () => {
      keys.clear();
      pointers.clear();
      pressed = false;
    };
    const selected = () => seat.enabled !== false &&
      (!seat.touchSelected || seat.touchSelected());

    function padButton(event) {
      const button = event.target.closest && event.target.closest('button[data-dir]');
      return button && !button.disabled && seat.pad.contains(button) &&
        DIRECTIONS.has(button.dataset.dir) ? button : null;
    }

    const pointerdown = event => {
      if (!selected()) return;
      const button = padButton(event);
      if (!button) return;
      event.preventDefault();
      pointers.set(event.pointerId, button.dataset.dir);
      input.reset(button.dataset.dir);
      pressed = true;
    };

    const click = event => {
      // Pointer taps are already handled above. detail=0 covers keyboard/AT clicks.
      if (event.detail !== 0 || !selected()) return;
      const button = padButton(event);
      if (!button) return;
      input.reset(button.dataset.dir);
      pressed = true;
    };

    window.addEventListener('keyup', keyup);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    window.addEventListener('blur', clear);
    if (seat.pad) {
      seat.pad.addEventListener('pointerdown', pointerdown);
      seat.pad.addEventListener('click', click);
    }

    return {
      move() {
        if (seat.enabled === false) {
          clear();
          return 'stay';
        }
        if (seat.touchSelected && !seat.touchSelected()) pointers.clear();
        const held = [...keys.values(), ...pointers.values()];
        if (held.length) input.reset(held[held.length - 1]);
        const direction = input.dir;
        const move = (pressed || held.length) && DIRECTIONS.has(direction)
          ? direction : 'stay';
        pressed = false;
        input.reset(direction);
        return move;
      },
      destroy() {
        off();
        clear();
        window.removeEventListener('keyup', keyup);
        window.removeEventListener('pointerup', release);
        window.removeEventListener('pointercancel', release);
        window.removeEventListener('blur', clear);
        if (seat.pad) {
          seat.pad.removeEventListener('pointerdown', pointerdown);
          seat.pad.removeEventListener('click', click);
        }
        input.destroy();
      },
    };
  }

  function start(seats, options = {}) {
    const game = FlagEngine.create(
      seats.map(({ id, team, name }) => ({ id, team, name })),
      options,
    );
    const pending = new Set();
    const controls = [];
    const workers = [];
    let stopped = false;
    let inFlight = null;

    function stop() {
      if (stopped) return;
      stopped = true;
      [...pending].forEach(cancel => cancel());
      workers.forEach(worker => {
        worker.ok = false;
        if (worker.w) worker.w.terminate();
      });
      controls.forEach(control => control.destroy());
    }

    function request(worker, message, timeout, accept) {
      if (stopped || !worker.ok) return Promise.resolve(null);
      return new Promise(resolve => {
        let settled = false;
        let timer;
        const settle = value => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          worker.w.onmessage = null;
          worker.w.onerror = null;
          worker.w.onmessageerror = null;
          resolve(value);
        };
        const fail = () => {
          worker.ok = false;
          worker.w.terminate();
          settle(null);
        };
        const cancel = () => settle(null);
        pending.add(cancel);
        timer = setTimeout(fail, timeout);
        worker.w.onmessage = event => {
          if (event.data && event.data.type === 'fail') fail();
          else if (accept(event.data)) settle(event.data);
        };
        worker.w.onerror = event => {
          if (event.preventDefault) event.preventDefault();
          fail();
        };
        worker.w.onmessageerror = fail;
        try {
          worker.w.postMessage(message);
        } catch (error) {
          fail();
        }
      });
    }

    let loaded;
    try {
      const loading = seats.map((seat, index) => {
        if (seat.human) {
          const control = humanControl(seat);
          controls.push(control);
          workers.push({ human: true, control, ok: true });
          return Promise.resolve();
        }
        const worker = {
          w: new Worker('/arcade/capture-flag/bot-worker.js'),
          ok: true,
        };
        workers.push(worker);
        const seed = (
          (Number(options.seed) || 0) + Math.imul(index + 1, 0x9e3779b9)
        ) >>> 0;
        return request(
          worker,
          { type: 'init', id: seat.botId, seed },
          5000,
          data => data && data.type === 'ready',
        );
      });
      loaded = Promise.all(loading);
    } catch (error) {
      stop();
      throw error;
    }

    async function advance() {
      await loaded;
      if (stopped || game.finished()) return [];
      const tick = game.tick;
      const agents = game.agents();
      const moves = Object.create(null);
      await Promise.all(workers.map(async (worker, index) => {
        const seat = seats[index];
        const agent = agents.find(item => item.id === seat.id);
        if (!agent || agent.jailed || agent.respawnIn > 0) {
          if (worker.human) worker.control.move();
          return;
        }
        if (worker.human) {
          moves[seat.id] = worker.control.move();
          return;
        }
        const answer = await request(
          worker,
          { type: 'move', state: game.botState(seat.id) },
          TIMEOUT_MS,
          data => data && data.type === 'move' && data.tick === tick,
        );
        moves[seat.id] = answer && DIRECTIONS.has(answer.move)
          ? answer.move : 'stay';
      }));
      return stopped ? [] : game.step(moves);
    }

    function turn() {
      if (!inFlight) {
        inFlight = advance().finally(() => { inFlight = null; });
      }
      return inFlight;
    }

    return { game, loaded, turn, stop };
  }

  window.FlagRunner = { start };
})();
