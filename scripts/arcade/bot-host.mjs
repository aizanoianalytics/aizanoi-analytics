import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const globals = {
  'snake-royale': 'SnakeEngine',
  chess: 'ChessEngine',
  'maze-chase': 'MazeEngine',
  'capture-flag': 'FlagEngine',
  holdem: 'PokerEngine',
  football: 'FootballEngine',
  'anatolian-pact': 'PactEngine'
};

export function rng(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = value;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

function freshModule(context) {
  context.module = { exports: {} };
  context.exports = context.module.exports;
}

function exported(context, globalName) {
  const value = context.module.exports;
  return context[globalName] ||
    (value && (typeof value === 'function' || Object.keys(value).length) ? value : null);
}

export function loadEngine(name) {
  if (!Object.hasOwn(globals, name)) throw new Error(`Unknown game: ${name}`);
  const directory = resolve(root, 'frontend/arcade', name);
  const context = vm.createContext({
    structuredClone,
    console: Object.fromEntries(
      ['log', 'error', 'warn', 'info', 'debug', 'trace'].map(key => [key, () => {}])
    )
  });
  context.self = context;
  context.window = context;
  const run = file => {
    vm.runInContext(readFileSync(resolve(directory, file), 'utf8'), context, {
      filename: resolve(directory, file),
      timeout: 5000
    });
  };
  if (name === 'anatolian-pact') {
    freshModule(context);
    run('map-data.js');
    context.PactMapData = exported(context, 'PactMapData');
    if (!context.PactMapData) throw new Error('map-data.js did not export PactMapData');
    // Support the CommonJS branch of a UMD engine without Node require().
    context.require = id => {
      if (/^\.\/map-data(?:\.js)?$/.test(id)) return context.PactMapData;
      throw new Error(`Unsupported engine import: ${id}`);
    };
  }
  freshModule(context);
  run('engine.js');
  const engine = exported(context, globals[name]);
  if (!engine || typeof engine.create !== 'function') {
    throw new Error(`${name}/engine.js did not export an engine`);
  }
  context[globals[name]] = engine;
  delete context.require;
  return { engine, context };
}

export function plain(value) {
  const seen = new WeakSet();
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (typeof item === 'function' || typeof item === 'undefined') return undefined;
    if (typeof item === 'bigint') return item.toString();
    if (item && typeof item === 'object') {
      if (seen.has(item)) return undefined;
      seen.add(item);
      const type = Object.prototype.toString.call(item);
      if (type === '[object Set]') return [...item];
      if (type === '[object Map]') return Object.fromEntries(item);
    }
    return item;
  }));
}

export function snapshot(session, events = []) {
  const game = session.game;
  let state;
  if (typeof game.state === 'function') state = game.state();
  else if (typeof game.snapshot === 'function') state = game.snapshot();
  else state = game;
  const frame = {
    state: plain(state),
    events: plain(events),
    views: Object.fromEntries(session.seats.map(seat => [
      seat.id, plain(game.botState(seat.id))
    ]))
  };
  if (session.name === 'anatolian-pact') {
    frame.phase = game.phase;
    frame.units = plain(game.units());
    frame.owners = plain(game.owners());
  }
  return frame;
}

export function session(name, seats, seed, options, make) {
  const { engine } = loadEngine(name);
  const entries = seats.map(seat => ({ ...seat }));
  const game = make(engine, entries, { ...options, seed });
  return { name, engine, game, seats: entries, seed, options, workerSeeds: [] };
}

export function finish(session, native, extra = {}) {
  return {
    result: plain(native),
    seats: session.seats.map(({ id, name, role, team, participant }) => ({
      id, name, role, team, participant
    })),
    ...extra
  };
}

function rowsOf(result) {
  const native = result.result;
  if (Array.isArray(result.placements)) return result.placements;
  if (Array.isArray(native)) return native;
  if (!native || typeof native !== 'object') return [];
  for (const key of ['placements', 'standings', 'players', 'scores']) {
    if (Array.isArray(native[key])) return native[key];
  }
  return [];
}

// Missing engine-specific scoring fields stay null, never become invented wins.
export function summarise(result) {
  const native = result.result || {};
  const rows = rowsOf(result);
  const winner = native.winner ?? result.winner ?? null;
  const winners = Array.isArray(winner) ? winner : winner === null ? [] : [winner];
  // A finished game that reports winner: null (e.g. football 0-0, capture-flag tie) is a draw.
  const explicitlyDrawn = native.draw === true || native.result === '1/2-1/2' ||
    native.reason === 'draw' || (Object.hasOwn(native, 'winner') && native.winner === null && !winners.length);
  return result.seats.map((seat, index) => {
    const row = rows.find(item =>
      item && typeof item === 'object' &&
      (item.id === seat.id || item.power === seat.id)
    );
    const place = row?.place ?? row?.rank ?? row?.placement ?? null;
    const token = seat.color || seat.team || seat.role || seat.id;
    // Maze reports the winning side in the plural ('runners' / 'ghosts').
    const won = winners.includes(seat.id) || winners.includes(token) || winners.includes(`${token}s`);
    const known = winners.length > 0;
    const points = row?.points ?? row?.score ?? row?.stack ?? row?.chips ?? null;
    return {
      participant: seat.participant,
      id: seat.id,
      name: seat.name,
      wins: known && won ? 1 : 0,
      draws: explicitlyDrawn ? 1 : 0,
      losses: known && !won ? 1 : 0,
      place: Number.isFinite(place) ? place : null,
      points: Number.isFinite(points) ? points : null,
      errors: result.errors?.[index] || 0
    };
  });
}

export class BotHost {
  constructor(name, seat, seed, timeoutMs, initTimeoutMs = 5000) {
    this.errors = 0;
    this.ok = true;
    this.pending = null;
    this.serial = 0;
    this.timeoutMs = timeoutMs;
    this.worker = new Worker(new URL('./bot-host.mjs', import.meta.url), {
      workerData: { name, file: seat.file, seed },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true
    });
    // A contestant must not corrupt the CLI's machine-readable output.
    this.worker.stdout.resume();
    this.worker.stderr.resume();
    this.worker.on('message', message => this.receive(message));
    this.worker.on('error', () => this.disable('worker error'));
    this.worker.on('exit', () => {
      if (this.ok) this.disable('worker exited');
    });
    this.ready = this.exchange('init', null, initTimeoutMs).then(reply => {
      if (!reply?.ok) this.disable(reply?.detail || 'load failed');
      return Boolean(reply?.ok);
    });
  }

  receive(message) {
    const pending = this.pending;
    if (!pending || message?.request !== pending.request) return;
    if (performance.now() >= pending.deadline) {
      this.disable('timeout');
      return;
    }
    if (!message.ok) {
      this.errors++;
      pending.settle(message);
    } else {
      pending.settle(message);
    }
  }

  exchange(call, state, timeoutMs) {
    if (!this.ok) return Promise.resolve(null);
    if (this.pending) throw new Error('Concurrent requests to one bot seat');
    return new Promise(resolvePromise => {
      const request = ++this.serial;
      let timer;
      const settle = value => {
        if (this.pending?.request !== request) return;
        clearTimeout(timer);
        this.pending = null;
        resolvePromise(value);
      };
      this.pending = {
        request, settle,
        deadline: performance.now() + timeoutMs
      };
      timer = setTimeout(() => this.disable('timeout'), timeoutMs);
      try {
        this.worker.postMessage({ request, call, state });
      } catch {
        this.disable('unreadable request');
      }
    });
  }

  async ask(call, state) {
    if (!this.ok) return null;
    const reply = await this.exchange(call, state, this.timeoutMs);
    return reply?.ok ? reply.value : null;
  }

  disable(detail) {
    if (!this.ok) return;
    this.ok = false;
    this.errors++;
    if (this.pending) this.pending.settle({ ok: false, detail });
    void this.worker.terminate();
  }

  async close() {
    this.ok = false;
    if (this.pending) this.pending.settle(null);
    await this.worker.terminate();
  }
}

if (!isMainThread) {
  let context;
  let contestant;
  let engine;
  let initialized = false;
  const name = workerData.name;
  const detail = error => String(error?.message || error).slice(0, 120);

  function load() {
    ({ context, engine } = loadEngine(name));
    const random = name === 'football' ? rng : engine.rng;
    if (typeof random !== 'function') throw new Error('Engine has no rng(seed)');
    context.__random = random(workerData.seed ^ 0x9e3779b9);
    vm.runInContext('Math.random = __random;', context);
    delete context.__random;
    freshModule(context);
    vm.runInContext(readFileSync(workerData.file, 'utf8'), context, {
      filename: workerData.file
    });
    const exp = context.module.exports;
    if (name === 'anatolian-pact') {
      if (!exp || typeof exp.orders !== 'function') {
        throw new Error('Bot must export orders(state)');
      }
      contestant = exp;
      return;
    }
    const method = name === 'holdem' ? 'act' : name === 'football' ? 'decide' : 'move';
    if (typeof exp === 'function') contestant = exp;
    else if (exp && typeof exp[method] === 'function') {
      contestant = ['snake-royale', 'football'].includes(name)
        ? exp[method] : exp[method].bind(exp);
    } else if (method === 'move' && typeof context.move === 'function') {
      contestant = context.move;
    }
    if (!contestant) throw new Error(`Bot must export ${method}(state)`);
  }

  function invoke(call, state) {
    let answer;
    if (name === 'anatolian-pact') {
      if (!['propose', 'answer', 'orders', 'retreats', 'builds'].includes(call)) {
        throw new Error('Invalid pact call');
      }
      answer = typeof contestant[call] === 'function' ? contestant[call](state) : null;
      return answer;
    }
    answer = contestant(name === 'maze-chase' ? structuredClone(state) : state);
    if (name === 'holdem') {
      const candidate = typeof answer === 'string' ? { type: answer } : answer;
      if (!candidate || typeof candidate.type !== 'string') return null;
      const action = { type: candidate.type };
      if (typeof candidate.amount === 'number' && Number.isFinite(candidate.amount)) {
        action.amount = candidate.amount;
      }
      return action;
    }
    if (name === 'football') {
      if (!answer || !Number.isFinite(answer.x) || !Number.isFinite(answer.y) ||
          typeof answer.kick !== 'boolean') return null;
      return {
        x: Math.max(-1, Math.min(1, answer.x)),
        y: Math.max(-1, Math.min(1, answer.y)),
        kick: answer.kick
      };
    }
    return typeof answer === 'string' ? answer : null;
  }

  parentPort.on('message', message => {
    try {
      if (message.call === 'init') {
        if (initialized) throw new Error('Already initialized');
        initialized = true;
        load();
        parentPort.postMessage({ request: message.request, ok: true });
        return;
      }
      const value = invoke(message.call, message.state);
      try {
        parentPort.postMessage({ request: message.request, ok: true, value });
      } catch {
        parentPort.postMessage({ request: message.request, ok: false, value: null });
      }
    } catch (error) {
      parentPort.postMessage({
        request: message.request, ok: false, value: null, detail: detail(error)
      });
    }
  });
}
