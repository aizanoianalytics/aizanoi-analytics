(function () {
  'use strict';

  const TIMEOUT_MS = 1000;
  const TYPES = new Set(['fold', 'check', 'call', 'raise', 'allin']);

  function normalize(action) {
    const value = typeof action === 'string' ? { type: action } : action;
    if (!value || !TYPES.has(value.type)) return null;
    if (value.type === 'raise') {
      if (!Number.isSafeInteger(value.amount) || value.amount < 0) return null;
      return { type: 'raise', amount: value.amount };
    }
    return { type: value.type };
  }

  function start(seats, options = {}) {
    if (!Array.isArray(seats) || seats.length < 2 || seats.length > 9) {
      throw new Error('Choose between 2 and 9 seats');
    }
    const entries = seats.map((seat, index) => ({
      ...seat,
      ...(seat.custom ? { custom: { ...seat.custom } } : {}),
      id: `s${index + 1}`,
      human: seat.kind === 'human' || seat.human === true,
      botId: seat.botId || (seat.kind === 'bot' ? seat.bot : null)
    }));
    for (const entry of entries) {
      if (!entry.human && entry.custom) {
        if (typeof entry.custom.name !== 'string' ||
            typeof entry.custom.code !== 'string') {
          throw new Error('Invalid custom bot');
        }
      } else if (!entry.human && (
        typeof entry.botId !== 'string' ||
        !/^[a-z0-9][a-z0-9.-]*$/.test(entry.botId) ||
        entry.botId.includes('..')
      )) throw new Error('Invalid bot id');
    }

    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : 1;
    if (options.botSeed !== undefined &&
        (!Number.isSafeInteger(options.botSeed) || options.botSeed < 0 || options.botSeed > 0xffffffff)) {
      throw new Error('botSeed must be an unsigned 32-bit integer');
    }
    // Never derive worker randomness from the private deck seed.
    const botSeed = options.botSeed === undefined
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : options.botSeed;
    const botRandom = PokerEngine.rng(botSeed);
    const game = PokerEngine.create(
      entries.map(({ id, name }) => ({ id, name })),
      { ...options, seed }
    );
    const pending = new Set();
    const workers = [];
    const errors = Object.fromEntries(entries.map(entry => [entry.id, 0]));
    let stopped = false;
    let begun = false;
    let decisionId = 0;
    let humanPending = null;
    let inFlight = null;

    function disable(worker) {
      worker.ok = false;
      if (!worker.w) return;
      worker.w.onmessage = null;
      worker.w.onerror = null;
      worker.w.onmessageerror = null;
      worker.w.terminate();
      worker.w = null;
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      for (const cancel of [...pending]) cancel();
      workers.forEach(disable);
      humanPending = null;
    }

    function exchange(worker, message, accept) {
      if (stopped || !worker.ok || !worker.w) return Promise.resolve(null);
      return new Promise(resolve => {
        const w = worker.w;
        const started = performance.now();
        let settled = false;
        let timer;
        function settle(value, failed = false) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          w.onmessage = null;
          w.onerror = null;
          w.onmessageerror = null;
          if (failed) disable(worker);
          resolve(value);
        }
        const cancel = () => settle(null);
        pending.add(cancel);
        timer = setTimeout(() => settle(null, true), TIMEOUT_MS);
        w.onmessage = event => {
          if (performance.now() - started >= TIMEOUT_MS) {
            settle(null, true);
          } else if (accept(event.data)) {
            settle(event.data);
          }
        };
        w.onerror = event => {
          if (event.preventDefault) event.preventDefault();
          settle(null, true);
        };
        w.onmessageerror = () => settle(null, true);
        try {
          w.postMessage(message);
        } catch (error) {
          settle(null, true);
        }
      });
    }

    function initialize(worker, entry, workerSeed) {
      return exchange(
        worker,
        { type: 'init', id: entry.botId, seed: workerSeed },
        message => message && (message.type === 'ready' || message.type === 'fail')
      ).then(message => {
        if (!message || message.type !== 'ready') disable(worker);
      });
    }

    function prepareCustom(worker, entry, workerSeed) {
      return new Promise(resolve => {
        let settled = false;
        let timer;

        function settle() {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          disable(worker);
          resolve();
        }

        const cancel = () => settle();
        pending.add(cancel);
        timer = setTimeout(settle, TIMEOUT_MS);

        let creation;
        try {
          creation = ArenaCustomBot.createWorker({
            game: 'holdem',
            workerUrl: '/arcade/holdem/bot-worker.js',
            scripts: ['/arcade/holdem/engine.js'],
            code: entry.custom.code
          });
        } catch (error) {
          settle();
          return;
        }

        Promise.resolve(creation).then(created => {
          if (settled || stopped) {
            created.terminate();
            settle();
            return;
          }
          worker.w = created;
          clearTimeout(timer);
          pending.delete(cancel);
          settled = true;
          resolve(initialize(worker, entry, workerSeed));
        }, settle);
      });
    }

    let loaded;
    try {
      const readiness = entries.map(entry => {
        if (entry.human) {
          workers.push({ human: true, ok: true, w: null });
          return Promise.resolve();
        }
        const worker = { human: false, ok: true, w: null };
        workers.push(worker);
        // Allocate in seat order, not asynchronous worker-completion order.
        const workerSeed = Math.floor(botRandom() * 4294967296);
        if (entry.custom) {
          return prepareCustom(worker, entry, workerSeed);
        }
        worker.w = new Worker('/arcade/holdem/bot-worker.js');
        return initialize(worker, entry, workerSeed);
      });
      loaded = Promise.all(readiness);
    } catch (error) {
      stop();
      throw error;
    }

    function fallback(id) {
      return { type: game.legalActions(id).canCheck ? 'check' : 'fold' };
    }

    function actionEvent(id, action, result, failed) {
      return {
        type: 'action', id, action, events: result.events || [],
        error: failed, errors: errors[id], handNumber: game.handNumber,
        handResult: game.handOver() ? game.handResult() : null
      };
    }

    function waitForHuman(id) {
      return new Promise(resolve => {
        const cancel = () => {
          pending.delete(cancel);
          humanPending = null;
          resolve({ type: 'stopped', events: [] });
        };
        pending.add(cancel);
        humanPending = {
          id,
          complete(action, result) {
            pending.delete(cancel);
            humanPending = null;
            resolve(actionEvent(id, action, result, false));
          }
        };
      });
    }

    function submitHuman(input) {
      if (stopped || !humanPending || game.toAct() !== humanPending.id) {
        return { ok: false, error: 'No human decision is pending' };
      }
      const action = normalize(input);
      if (!action) return { ok: false, error: 'Invalid action' };
      const waiting = humanPending;
      const result = game.act(waiting.id, action);
      if (result.ok) waiting.complete(action, result);
      return result;
    }

    async function advance() {
      await loaded;
      if (stopped) return { type: 'stopped', events: [] };
      if (game.finished()) return { type: 'finished', events: [], result: game.result() };
      if (!begun || game.handOver()) {
        begun = true;
        const events = game.startHand() || [];
        return {
          type: 'hand', events, handNumber: game.handNumber,
          handResult: game.handOver() ? game.handResult() : null
        };
      }
      const id = game.toAct();
      const index = entries.findIndex(entry => entry.id === id);
      if (index < 0) throw new Error('Engine has no acting seat in an active hand');
      const worker = workers[index];
      if (worker.human) return waitForHuman(id);
      const currentDecision = ++decisionId;
      const handNumber = game.handNumber;
      const message = await exchange(
        worker,
        { type: 'act', handNumber, decisionId: currentDecision, state: game.botState(id) },
        reply => reply && reply.type === 'act' &&
          reply.handNumber === handNumber && reply.decisionId === currentDecision
      );
      if (stopped) return { type: 'stopped', events: [] };
      let action = normalize(message && message.action);
      let result = action ? game.act(id, action) : null;
      const failed = !result || !result.ok;
      if (failed) {
        errors[id]++;
        action = fallback(id);
        result = game.act(id, action);
      }
      if (!result.ok) throw new Error('Engine rejected its safe fallback');
      return actionEvent(id, action, result, failed);
    }

    function next() {
      if (inFlight) return inFlight;
      inFlight = advance().finally(() => { inFlight = null; });
      return inFlight;
    }

    return { game, loaded, next, submitHuman, stop, errors };
  }

  window.HoldemRunner = { start };
})();
