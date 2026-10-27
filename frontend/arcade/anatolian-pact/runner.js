(function (root, factory) {
  'use strict';
  const api = factory(typeof PactEngine !== 'undefined' ? PactEngine : root.PactEngine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PactRunner = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (engine) {
  'use strict';

  const calls = {
    'negotiate-propose': 'propose',
    'negotiate-answer': 'answer',
    orders: 'orders',
    retreats: 'retreats',
    builds: 'builds'
  };
  const methods = {
    propose: 'submitProposals',
    answer: 'submitAnswers',
    orders: 'submitOrders',
    retreats: 'submitRetreats',
    builds: 'submitBuilds'
  };
  const empty = call => call === 'answer' || call === 'retreats' ? {} : [];
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

  function valid(call, value) {
    if (call === 'answer') {
      return record(value) && Object.values(value).every(v => v === 'accept' || v === 'reject');
    }
    if (call === 'retreats') {
      return record(value) && Object.values(value).every(v => v === null || typeof v === 'string');
    }
    if (!Array.isArray(value)) return false;
    if (call === 'propose') {
      return value.length <= 6 && value.every(p => record(p) && typeof p.to === 'string' &&
        ['peace', 'alliance', 'support', 'dmz', 'request-support'].includes(p.type) && record(p.terms));
    }
    if (call === 'orders') {
      return value.every(o => record(o) && typeof o.unit === 'string' &&
        ['hold', 'move', 'support'].includes(o.type) &&
        ['dest', 'target', 'targetDest'].every(k => o[k] === undefined || typeof o[k] === 'string'));
    }
    return value.every(o => record(o) && (typeof o.disband === 'string' ||
      (['army', 'fleet'].includes(o.type) && typeof o.at === 'string')));
  }

  function start(powers, options = {}) {
    const seed = Number.isFinite(options.seed) ? options.seed >>> 0 : Date.now() >>> 0;
    const game = engine.create({ ...options, seed });
    const entries = Object.entries(powers);
    const workers = new Map();
    const pending = new Set();
    const humans = new Map();
    let stopped = false;
    let flight = null;
    let serial = 0;

    function disable(x) {
      x.ok = false;
      if (x.w) x.w.terminate();
    }

    function exchange(x, message, accepts) {
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
        const fail = () => {
          disable(x);
          settle(null);
        };
        const cancel = () => settle(null);
        pending.add(cancel);
        timer = setTimeout(fail, 2000);
        x.w.onmessage = event => {
          if (accepts(event.data)) settle(event.data);
          else if (event.data && event.data.type === 'fail') fail();
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

    const ready = entries.map(([power, seat], i) => {
      if (seat.human) return Promise.resolve();
      const x = { w: null, ok: true };
      workers.set(power, x);
      try {
        x.w = new Worker('/arcade/anatolian-pact/bot-worker.js');
        return exchange(x, {
          type: 'init',
          id: seat.id,
          seed: (seed * 31 + i) >>> 0
        }, data => data && data.type === 'ready');
      } catch {
        disable(x);
        return Promise.resolve(null);
      }
    });
    const loaded = Promise.all(ready);

    function living(power) {
      return game.units().some(u => u.power === power) ||
        Object.values(game.owners()).includes(power) ||
        Boolean(game.botState(power).retreats?.length);
    }

    function fallback(call, power) {
      if (call !== 'retreats') return empty(call);
      return Object.fromEntries((game.botState(power).retreats || []).map(unit =>
        [unit.at, [...(unit.options || [])].sort()[0] || null]));
    }

    function submitHuman(power, payload) {
      const item = humans.get(power);
      if (!item || stopped) return { ok: false, errors: ['This seat is not waiting.'] };
      if (!valid(item.call, payload)) return { ok: false, errors: ['Invalid payload.'] };
      humans.delete(power);
      item.resolve(payload);
      return { ok: true };
    }

    async function run() {
      if (stopped || game.finished()) return { events: [], resolution: [] };
      const call = calls[game.phase];
      if (!call) throw new Error('Unknown game phase.');
      const tasks = entries.filter(([power]) => living(power)).map(([power, seat]) => {
        if (seat.human) {
          return new Promise(resolve => humans.set(power, { call, resolve }))
            .then(payload => [power, payload]);
        }
        return loaded.then(async () => {
          if (stopped) return [power, empty(call)];
          const key = ++serial;
          const answer = await exchange(workers.get(power), {
            type: 'call',
            call,
            key,
            state: game.botState(power)
          }, data => data && data.type === 'answer' && data.call === call && data.key === key);
          return [power, answer && valid(call, answer.payload) ? answer.payload : fallback(call, power)];
        });
      });
      const submissions = await Promise.all(tasks);
      if (stopped) return { events: [], resolution: [] };
      for (const [power, payload] of submissions) {
        try {
          const result = game[methods[call]](power, payload);
          if (result && result.ok === false) game[methods[call]](power, fallback(call, power));
        } catch {
          game[methods[call]](power, fallback(call, power));
        }
      }
      const result = game.advance();
      if (game.finished()) stop();
      return result;
    }

    function next() {
      if (!flight) flight = run().finally(() => { flight = null; });
      return flight;
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      for (const cancel of [...pending]) cancel();
      for (const x of workers.values()) disable(x);
      for (const item of humans.values()) item.resolve(empty(item.call));
      humans.clear();
    }

    return {
      game,
      loaded,
      next,
      submitHuman,
      stop,
      phase: () => game.phase,
      waitingFor: () => [...humans.keys()]
    };
  }

  return { start };
});
