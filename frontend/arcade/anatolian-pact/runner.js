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
    const canonical = engine.MAP?.powers?.map(power => power.id) || [];
    const entries = Object.entries(powers).map(([power, seat]) => [
      power,
      {
        ...seat,
        ...(seat.custom ? { custom: { ...seat.custom } } : {})
      }
    ]).sort(([a], [b]) => {
      const ai = canonical.indexOf(a), bi = canonical.indexOf(b);
      if (ai >= 0 && bi >= 0) return ai - bi;
      if (ai >= 0 || bi >= 0) return ai >= 0 ? -1 : 1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
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
      if (stopped || !x || !x.ok) return Promise.resolve(null);
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

    function initialize(x, entry, power, i) {
      const index = canonical.indexOf(power);
      return exchange(x, {
        type: 'init',
        id: entry.id,
        seed: (Math.imul(seed, 31) + (index >= 0 ? index : i)) >>> 0
      }, data => data && data.type === 'ready');
    }

    function prepareCustom(x, entry, power, i) {
      return new Promise(resolve => {
        let settled = false;
        let timer;

        function settle(value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          pending.delete(cancel);
          resolve(value);
        }

        const cancel = () => {
          disable(x);
          settle(null);
        };
        pending.add(cancel);
        timer = setTimeout(cancel, 2000);

        let creation;
        try {
          creation = ArenaCustomBot.createWorker({
            game: 'anatolian-pact',
            workerUrl: '/arcade/anatolian-pact/bot-worker.js',
            scripts: [
              '/arcade/anatolian-pact/map-data.js',
              '/arcade/anatolian-pact/engine.js'
            ],
            code: entry.custom.code
          });
        } catch {
          cancel();
          return;
        }

        Promise.resolve(creation).then(worker => {
          if (settled || stopped || !x.ok) {
            worker.terminate();
            settle(null);
            return;
          }

          x.w = worker;
          clearTimeout(timer);
          pending.delete(cancel);
          // The unchanged init exchange now owns cancellation and its deadline.
          settled = true;
          resolve(initialize(x, entry, power, i));
        }, cancel);
      });
    }

    const ready = entries.map(([power, entry], i) => {
      if (entry.human) return Promise.resolve();
      const x = { w: null, ok: true };
      workers.set(power, x);

      if (entry.custom) return prepareCustom(x, entry, power, i);

      try {
        x.w = new Worker('/arcade/anatolian-pact/bot-worker.js');
        return initialize(x, entry, power, i);
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

    function apply(call, power, payload) {
      try {
        return game[methods[call]](power, payload);
      } catch {
        return { ok: false };
      }
    }

    function submitHuman(power, payload) {
      const item = humans.get(power);
      if (!item || stopped) return { ok: false, errors: ['This seat is not waiting.'] };
      if (!valid(item.call, payload)) return { ok: false, errors: ['Invalid payload.'] };
      const result = apply(item.call, power, payload);
      if (!result || result.ok === false) {
        return {
          ok: false,
          errors: result?.errors?.length ? result.errors :
            ['That selection is not legal. Review the available choices and try again.']
        };
      }
      humans.delete(power);
      item.resolve({ power, applied: true });
      return { ok: true, ...(result.normalized ? { normalized: result.normalized } : {}) };
    }

    async function run() {
      if (stopped || game.finished()) return { events: [], resolution: [] };
      const call = calls[game.phase];
      if (!call) throw new Error('Unknown game phase.');
      const tasks = entries.filter(([power]) => living(power)).map(([power, seat]) => {
        if (seat.human) {
          return new Promise(resolve => humans.set(power, { call, resolve }));
        }
        return loaded.then(async () => {
          if (stopped) return { power, payload: empty(call) };
          const key = ++serial;
          const answer = await exchange(workers.get(power), {
            type: 'call',
            call,
            key,
            state: game.botState(power)
          }, data => data && data.type === 'answer' && data.call === call && data.key === key);
          const good = answer && valid(call, answer.payload);
          return {
            power,
            payload: good ? answer.payload : fallback(call, power),
            fallback: good ? null : answer ? 'invalid-payload' : 'worker-unavailable'
          };
        });
      });
      const submissions = await Promise.all(tasks);
      if (stopped) return { events: [], resolution: [] };
      const notices = [];
      for (const item of submissions) {
        if (item.applied) continue;
        const result = apply(call, item.power, item.payload);
        if (!result || result.ok === false) {
          apply(call, item.power, fallback(call, item.power));
          item.fallback = 'invalid-payload';
        }
        if (item.fallback) notices.push({
          type: 'bot-fallback', power: item.power, call, reason: item.fallback
        });
      }
      const result = game.advance();
      result.events = notices.concat(result.events || []);
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
      for (const [power, item] of humans) item.resolve({ power, applied: true });
      humans.clear();
    }

    return {
      game, loaded, next, submitHuman, stop,
      phase: () => game.phase,
      waitingFor: () => [...humans.keys()]
    };
  }

  return { start };
});
