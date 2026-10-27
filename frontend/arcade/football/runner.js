(function () {
  'use strict';

  const HZ = 60;
  const STEP_MS = 1000 / HZ;
  const DECISION_STEPS = 3;
  const DECISION_MS = 50;
  const EMPTY = Object.freeze({ x: 0, y: 0, kick: false });
  const SCHEMES = {
    p1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', kick: ['Space'] },
    p2: {
      left: 'ArrowLeft',
      right: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      kick: ['Enter', 'Slash']
    }
  };

  function editing(target) {
    return target instanceof Element &&
      Boolean(target.closest('input, select, textarea, button, [contenteditable]:not([contenteditable="false"])'));
  }

  function sanitize(input) {
    if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y) ||
        typeof input.kick !== 'boolean') return null;
    return {
      x: Math.max(-1, Math.min(1, input.x)),
      y: Math.max(-1, Math.min(1, input.y)),
      kick: input.kick
    };
  }

  function start(seats, options = {}) {
    if (!Array.isArray(seats) || !seats.length) throw new Error('Choose two teams');
    const ids = new Set();
    for (const seat of seats) {
      if (!/^(r|b)[1-4]$/.test(seat.id) || ids.has(seat.id) ||
          seat.team !== (seat.id[0] === 'r' ? 'red' : 'blue')) {
        throw new Error('Invalid or duplicate seat');
      }
      ids.add(seat.id);
    }
    for (const team of ['red', 'blue']) {
      const count = seats.filter(seat => seat.team === team).length;
      if (count < 1 || count > 4) throw new Error('Teams need one to four players');
    }

    const humans = seats.filter(seat => seat.human);
    const requested = options.speed === 'max' ? 'max' : Number(options.speed || 1);
    const speed = humans.length ? 1 : [1, 2, 4, 'max'].includes(requested) ? requested : 1;
    const game = FootballEngine.create(seats.map(({ id, team, name }) => ({
      id, team, name
    })), { ...options, decisionEvery: DECISION_STEPS });
    const held = new Set();
    const workers = [];
    const events = [];
    let stopped = false;
    let begun = false;
    let paused = false;
    let callback = null;
    let raf = null;
    let timer = null;
    let lastTime = null;
    let accumulator = 0;
    let askedAt = -1;
    let previous = game.state();
    let current = previous;

    function clearKeys() {
      held.clear();
    }

    function keydown(event) {
      if (!begun || paused || stopped || editing(event.target)) return;
      if (humans.length && ['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) {
        event.preventDefault();
      }
      held.add(event.code);
    }

    function keyup(event) {
      held.delete(event.code);
    }

    if (humans.length) {
      window.addEventListener('keydown', keydown);
      window.addEventListener('keyup', keyup);
      window.addEventListener('blur', clearKeys);
      document.addEventListener('visibilitychange', clearKeys);
      document.addEventListener('focusin', clearKeys);
    }

    function disableWorker(entry) {
      entry.ok = false;
      clearTimeout(entry.deadline);
      entry.pending = null;
      if (entry.worker) entry.worker.terminate();
      if (entry.settle) entry.settle(false);
    }

    function createWorker(seat, index) {
      const entry = {
        seat,
        worker: null,
        ok: false,
        input: EMPTY,
        pending: null,
        deadline: null,
        settle: null
      };
      workers.push(entry);
      return new Promise(resolve => {
        let settled = false;
        let startup;
        entry.settle = success => {
          if (settled) return;
          settled = true;
          clearTimeout(startup);
          resolve(success);
        };

        try {
          entry.worker = new Worker('/arcade/football/bot-worker.js');
          entry.worker.onmessage = event => {
            const message = event.data;
            if (!message || stopped) return;
            if (message.type === 'ready') {
              entry.ok = true;
              entry.settle(true);
              return;
            }
            if (message.type === 'fail') {
              disableWorker(entry);
              return;
            }
            const pending = entry.pending;
            if (message.type !== 'decide' || !pending || message.step !== pending.step) return;
            const onTime = performance.now() - pending.sent <= DECISION_MS;
            const inWindow = game.steps < pending.step + DECISION_STEPS;
            clearTimeout(entry.deadline);
            entry.pending = null;
            const input = sanitize(message.input);
            if (onTime && inWindow && !paused && input) {
              entry.input = FootballEngine.mirrorInput(input, seat.team);
            }
          };
          entry.worker.onerror = event => {
            event.preventDefault();
            disableWorker(entry);
          };
          startup = setTimeout(() => disableWorker(entry), 5000);
          entry.worker.postMessage({
            type: 'init',
            id: seat.botId,
            seed: ((Number(options.seed) || 1) + Math.imul(index + 1, 0x9e3779b9)) >>> 0
          });
        } catch {
          disableWorker(entry);
        }
      });
    }

    const loaded = Promise.all(seats.map((seat, index) =>
      seat.human ? Promise.resolve(true) : createWorker(seat, index)));

    function askBots() {
      const step = game.steps;
      if (step % DECISION_STEPS !== 0 || askedAt === step) return;
      askedAt = step;
      for (const entry of workers) {
        if (!entry.ok || entry.pending) continue;
        entry.pending = { step, sent: performance.now() };
        entry.deadline = setTimeout(() => {
          if (entry.pending && entry.pending.step === step) disableWorker(entry);
        }, DECISION_MS);
        try {
          entry.worker.postMessage({
            type: 'decide',
            step,
            state: game.botState(entry.seat.id)
          });
        } catch {
          disableWorker(entry);
        }
      }
    }

    function humanInput(seat) {
      const keys = typeof seat.keys === 'object' ? seat.keys : SCHEMES[seat.keys] || SCHEMES.p1;
      const focused = editing(document.activeElement);
      const pressed = code => !focused && held.has(code);
      const kickKeys = Array.isArray(keys.kick) ? keys.kick : [keys.kick];
      const touch = typeof seat.input === 'function' ? sanitize(seat.input()) || EMPTY : EMPTY;
      return {
        x: Math.max(-1, Math.min(1, Number(pressed(keys.right)) - Number(pressed(keys.left)) + touch.x)),
        y: Math.max(-1, Math.min(1, Number(pressed(keys.down)) - Number(pressed(keys.up)) + touch.y)),
        kick: kickKeys.some(pressed) || touch.kick
      };
    }

    function advance() {
      askBots();
      const inputs = {};
      for (const seat of humans) inputs[seat.id] = humanInput(seat);
      for (const entry of workers) inputs[entry.seat.id] = entry.input;
      previous = current;
      events.push(...game.step(inputs));
      current = game.state();
    }

    function report(alpha) {
      if (!callback || stopped) return;
      callback({
        previous,
        state: current,
        alpha,
        events: events.splice(0),
        result: game.finished() ? game.result() : null
      });
    }

    function cancelLoop() {
      if (raf !== null) cancelAnimationFrame(raf);
      if (timer !== null) clearTimeout(timer);
      raf = null;
      timer = null;
    }

    function normalFrame(now) {
      raf = null;
      if (stopped || paused) return;
      if (lastTime === null) lastTime = now;
      accumulator += Math.max(0, now - lastTime) * speed;
      lastTime = now;
      let batch = 0;
      while (accumulator >= STEP_MS && !game.finished() && batch < 240) {
        advance();
        accumulator -= STEP_MS;
        batch++;
      }
      report(Math.min(1, accumulator / STEP_MS));
      if (!stopped && !paused && !game.finished()) raf = requestAnimationFrame(normalFrame);
    }

    function maximumChunk() {
      timer = null;
      if (stopped || paused) return;
      const end = performance.now() + 16;
      do {
        if (game.finished()) break;
        askBots();
        if (game.steps % DECISION_STEPS === 0 &&
            workers.some(entry => entry.ok && entry.pending)) break;
        advance();
      } while (performance.now() < end);
      report(1);
      if (!stopped && !paused && !game.finished()) timer = setTimeout(maximumChunk, 0);
    }

    function schedule() {
      if (speed === 'max') timer = setTimeout(maximumChunk, 0);
      else raf = requestAnimationFrame(normalFrame);
    }

    function pause() {
      if (stopped || paused) return;
      paused = true;
      clearKeys();
      cancelLoop();
      for (const entry of workers) {
        clearTimeout(entry.deadline);
        entry.pending = null;
      }
      askedAt = -1;
    }

    function resume() {
      if (stopped || !paused || !begun || game.finished()) return;
      paused = false;
      lastTime = null;
      schedule();
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      clearKeys();
      cancelLoop();
      workers.forEach(disableWorker);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clearKeys);
      document.removeEventListener('visibilitychange', clearKeys);
      document.removeEventListener('focusin', clearKeys);
      callback = null;
    }

    return {
      game,
      loaded,
      async start(onFrame) {
        if (begun || stopped) return;
        begun = true;
        callback = onFrame;
        await loaded;
        if (stopped) return;
        report(1);
        if (!paused && !game.finished()) schedule();
      },
      pause,
      resume,
      stop
    };
  }

  window.FootballRunner = { start };
})();
