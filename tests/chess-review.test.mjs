import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src = file => fs.readFileSync(
  new URL('../frontend/arcade/chess/' + file, import.meta.url), 'utf8'
);

// Preserve the engine tests' same-realm UMD loading convention.
const loadUmd = file => {
  const m = { exports: {} };
  new vm.Script(`(function(module, exports) {
${src(file)}
})`, { filename: file }).runInThisContext()(m, m.exports);
  return m.exports;
};
const Engine = loadUmd('engine.js');

function play(game, moves) {
  for (const move of moves) assert.equal(game.move(move).ok, true, move);
}

test('bot-state reconstruction preserves custom starts, repetition and isolation', () => {
  const game = Engine.create({
    fen: '6nk/8/8/3pP3/8/8/8/KN6 w - d6 0 17',
    maxPlies: 30
  });
  const cycle = ['b1a3', 'g8f6', 'a3b1', 'f6g8'];
  play(game, cycle);
  play(game, cycle);
  const state = game.botState();
  const before = structuredClone(state);
  const restored = Engine.fromBotState(state);
  assert.deepEqual(restored.botState(), state);
  assert.equal(restored.status().over, false);
  assert.equal(restored.moveNumber, 21);
  assert.equal(restored.ply, 8);
  // The position after b1a3 occurs at plies 1, 5 and 9, ending the game before g8f6.
  play(restored, [cycle[0]]);
  assert.equal(restored.ply, 9);
  assert.equal(restored.status().reason, 'threefold');
  assert.equal(restored.move(cycle[1]).ok, false);
  assert.equal(restored.ply, 9);
  assert.equal(game.status().over, false);
  assert.deepEqual(state, before);
  assert.equal(game.clone().botState().initialFen, state.initialFen);
});

test('current FEN alone loses repetition but fromBotState does not', () => {
  const game = Engine.create();
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  play(game, cycle);
  const restored = Engine.fromBotState(game.botState());
  const positionOnly = Engine.create({ fen: game.fen() });
  play(restored, cycle);
  play(positionOnly, cycle);
  assert.equal(restored.status().reason, 'threefold');
  assert.equal(positionOnly.status().over, false);
  assert.equal(game.status().over, false);
});

test('reconstruction preserves maxPlies and custom initial black turn', () => {
  const game = Engine.create({
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR b KQkq - 0 12',
    maxPlies: 2
  });
  play(game, ['e7e5']);
  const restored = Engine.fromBotState(game.botState());
  assert.equal(restored.turn, 'w');
  assert.equal(restored.moveNumber, 13);
  play(restored, ['e2e4']);
  assert.equal(restored.status().reason, 'max-plies');
  assert.equal(game.status().over, false);
});

test('history-aware state restores Chess960 castling and promotion', () => {
  const castle = Engine.create({
    variant: 'chess960',
    fen: '4k3/8/8/8/8/8/8/5KR1 w G - 0 1'
  });
  play(castle, ['f1g1']);
  assert.deepEqual(Engine.fromBotState(castle.botState()).botState(), castle.botState());
  const promotion = Engine.create({
    fen: '7k/P7/8/8/8/8/8/7K w - - 0 1'
  });
  play(promotion, ['a7a8n']);
  const copy = Engine.fromBotState(promotion.botState());
  assert.equal(copy.status().reason, 'insufficient');
  assert.deepEqual(copy.history, promotion.history);
});

test('bot-state reconstruction rejects inconsistent history and FEN', () => {
  const state = Engine.create().botState();
  assert.throws(() => Engine.fromBotState(null), TypeError);
  assert.throws(() => Engine.fromBotState({ ...state, maxPlies: 0 }), TypeError);
  assert.throws(() => Engine.fromBotState({ ...state, ply: 1 }), TypeError);
  assert.throws(() => Engine.fromBotState({
    ...state, history: ['e2e5'], ply: 1
  }), /history/);
  assert.throws(() => Engine.fromBotState({
    ...state, fen: state.fen.replace(' w ', ' b ')
  }), /mismatch/);
  const terminal = Engine.create({ maxPlies: 1 });
  play(terminal, ['e2e4']);
  const invalid = terminal.botState();
  invalid.history.push('e7e5');
  invalid.ply++;
  assert.throws(() => Engine.fromBotState(invalid), /history/);
});

test('promoted same-colour bishops are insufficient, other minor sets are not', () => {
  for (const fen of [
    '7k/8/8/8/8/4B3/8/K1B5 w - - 0 1',
    // g4 is light, unlike dark e3/c1; use g5 so all three bishops share a colour.
    '7k/8/8/6B1/8/4b3/8/K1B5 w - - 0 1'
  ]) {
    assert.equal(Engine.create({ fen }).status().reason, 'insufficient', fen);
  }
  for (const fen of [
    '7k/8/8/8/6B1/4b3/8/K1B5 w - - 0 1',
    '7k/8/8/8/8/5B2/8/K1B5 w - - 0 1',
    '7k/8/8/8/8/8/8/KNN5 w - - 0 1',
    '7k/8/8/8/8/8/8/KNB5 w - - 0 1'
  ]) {
    assert.equal(Engine.create({ fen }).status().over, false, fen);
  }
});

test('double forfeits are detached, cloneable and reconstructible terminal draws', () => {
  const game = Engine.create();
  const status = game.forfeitBoth('White failed; Black failed');
  assert.deepEqual(status, {
    over: true, result: '1/2-1/2', reason: 'forfeit',
    detail: 'White failed; Black failed'
  });
  status.detail = 'mutated';
  assert.equal(game.status().detail, 'White failed; Black failed');
  assert.equal(game.move('e2e4').ok, false);
  assert.deepEqual(game.clone().status(), game.status());
  assert.deepEqual(Engine.fromBotState(game.botState()).status(), game.status());
  game.forfeit('w', 'do not overwrite');
  assert.equal(game.status().result, '1/2-1/2');
  const single = Engine.create();
  single.forfeit('b', 'broken');
  assert.deepEqual(Engine.fromBotState(single.botState()).status(), single.status());
});

function bootWorker(exported) {
  const messages = [];
  const imports = [];
  const sandbox = {
    ChessEngine: Engine,
    Math: Object.create(Math),
    postMessage(message) { messages.push(message); },
    importScripts(location) {
      imports.push(location);
      if (location.startsWith('bots/')) sandbox.module.exports = exported;
    }
  };
  sandbox.self = sandbox;
  vm.runInNewContext(src('bot-worker.js'), sandbox, { filename: 'bot-worker.js' });
  sandbox.onmessage({ data: { type: 'init', id: 'test-bot', seed: 5 } });
  assert.equal(messages[0].type, 'ready');
  return { sandbox, messages, imports };
}

test('worker captures request ply before bot mutation and binds object receiver', () => {
  const bot = {
    answer: 'e2e4',
    move(state) {
      state.ply = 999;
      return this.answer;
    }
  };
  const { sandbox, messages } = bootWorker(bot);
  sandbox.onmessage({ data: { type: 'move', state: { ply: 12 } } });
  assert.equal(messages[1].ply, 12);
  assert.equal(messages[1].move, 'e2e4');
  assert.equal(messages[1].detail, undefined);
});

test('worker reports throws and invalid synchronous returns without losing correlation', () => {
  for (const bot of [
    () => undefined,
    () => ({ move: 'e2e4' }),
    () => Promise.resolve('e2e4'),
    () => { throw new Error('test exception'); }
  ]) {
    const { sandbox, messages } = bootWorker(bot);
    sandbox.onmessage({ data: { type: 'move', state: { ply: 4 } } });
    assert.equal(messages[1].ply, 4);
    assert.equal(messages[1].move, null);
    assert.match(messages[1].detail, /synchronous UCI string|bot threw: test exception/);
  }
});

function runnerHarness(behaviour = {}) {
  const instances = [];
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  class FakeWorker {
    constructor(location) {
      assert.equal(location, '/arcade/chess/bot-worker.js');
      this.messages = [];
      this.terminated = false;
      instances.push(this);
    }
    postMessage(message) {
      this.messages.push(structuredClone(message));
      if (message.type === 'init') this.id = message.id;
      const mode = behaviour[this.id] || {};
      const handler = message.type === 'init' ? mode.init : mode.move;
      queueMicrotask(() => {
        if (this.terminated) return;
        if (handler === 'silent') return;
        const data = typeof handler === 'function'
          ? handler(message)
          : handler || (message.type === 'init'
            ? { type: 'ready' }
            : { type: 'move', ply: message.state.ply, move: message.state.legalMoves[0] });
        if (data && this.onmessage) this.onmessage({ data });
      });
    }
    terminate() { this.terminated = true; }
  }
  const window = {};
  new vm.Script(`(function(window, ChessEngine, Worker, crypto, performance, setTimeout, clearTimeout) {
${src('runner.js')}
})`, { filename: 'runner.js' }).runInThisContext()(
    window, Engine, FakeWorker,
    { getRandomValues(array) { array[0] = 123; return array; } },
    { now: () => now },
    callback => { timers.set(++timerId, callback); return timerId; },
    id => timers.delete(id)
  );
  return {
    start: window.ChessRunner.start,
    instances,
    timers,
    expire() {
      now += 1000;
      for (const callback of [...timers.values()]) callback();
    },
    setNow(value) { now = value; }
  };
}

test('both initialization failures draw independently of seat order', async () => {
  for (const ids of [['first', 'second'], ['second', 'first']]) {
    const h = runnerHarness({
      first: { init: { type: 'fail', detail: 'first broken' } },
      second: { init: { type: 'fail', detail: 'second broken' } }
    });
    const match = h.start({ white: { id: ids[0] }, black: { id: ids[1] }, seed: 8 });
    await match.loaded;
    assert.equal(match.game.status().result, '1/2-1/2');
    assert.equal(match.game.status().reason, 'forfeit');
    assert.match(match.game.status().detail, /first broken/);
    assert.match(match.game.status().detail, /second broken/);
    assert.equal((await match.next()).type, 'over');
    assert.ok(h.instances.every(worker => worker.terminated));
    assert.equal(h.timers.size, 0);
  }
});

test('one initialization failure loses, including against a human', async () => {
  for (const human of [true, false]) {
    const h = runnerHarness({ broken: { init: { type: 'fail', detail: 'broken' } } });
    const match = h.start({
      white: { id: 'broken' },
      black: human ? { human: true } : { id: 'working' }
    });
    await match.loaded;
    assert.equal(match.game.status().result, '0-1');
    assert.equal(match.game.status().reason, 'forfeit');
    assert.ok(h.instances.every(worker => worker.terminated));
  }
});

test('runner move failures forfeit with diagnostics and no fallback', async () => {
  for (const response of [
    { move: 'e2e5' },
    { move: null, detail: 'bot threw: test' },
    { move: { uci: 'e2e4' } }
  ]) {
    const h = runnerHarness({
      faulty: {
        move: message => ({ type: 'move', ply: message.state.ply, ...response })
      }
    });
    const match = h.start({ white: { id: 'faulty' }, black: { human: true } });
    await match.loaded;
    const event = await match.next();
    assert.equal(event.type, 'forfeit');
    assert.equal(event.status.result, '0-1');
    assert.equal(match.game.history.length, 0);
    if (response.detail) assert.equal(event.detail, response.detail);
    assert.equal(h.timers.size, 0);
    assert.ok(h.instances.every(worker => worker.terminated));
  }
});

test('wrong-ply and silent bots time out, and a response at the deadline is late', async () => {
  for (const move of [
    'silent',
    message => ({ type: 'move', ply: message.state.ply + 1, move: 'e2e4' })
  ]) {
    const h = runnerHarness({ faulty: { move } });
    const match = h.start({ white: { id: 'faulty' }, black: { human: true } });
    await match.loaded;
    const pending = match.next();
    await Promise.resolve();
    await Promise.resolve();
    h.expire();
    const event = await pending;
    assert.equal(event.type, 'forfeit');
    assert.match(event.detail, /timed out/);
    assert.equal(match.game.ply, 0);
  }
  const h = runnerHarness({ faulty: { move: 'silent' } });
  const match = h.start({ white: { id: 'faulty' }, black: { human: true } });
  await match.loaded;
  const pending = match.next();
  await Promise.resolve();
  h.setNow(1000);
  h.instances[0].onmessage({ data: { type: 'move', ply: 0, move: 'e2e4' } });
  assert.match((await pending).detail, /timed out/);
  assert.equal(match.game.ply, 0);
});

test('stop settles initialization and pending human requests without adjudicating', async () => {
  const h = runnerHarness({ silent: { init: 'silent' } });
  const loading = h.start({ white: { id: 'silent' }, black: { human: true } });
  loading.stop();
  loading.stop();
  await loading.loaded;
  assert.equal((await loading.next()).type, 'stopped');
  assert.equal(loading.game.status().over, false);
  assert.equal(h.timers.size, 0);

  const hotseat = h.start({ white: { human: true }, black: { human: true } });
  await hotseat.loaded;
  const pending = hotseat.next();
  assert.equal(hotseat.next(), pending);
  await Promise.resolve();
  assert.equal(hotseat.submitHuman('e2e5').ok, false);
  assert.equal(hotseat.game.ply, 0);
  hotseat.stop();
  assert.equal((await pending).type, 'stopped');
});

test('explicit seeds are repeatable and participant streams follow swapped seats', async () => {
  const h = runnerHarness();
  const first = h.start({ white: { id: 'a' }, black: { id: 'b' }, seed: 987 });
  await first.loaded;
  const original = h.instances.slice(0, 2).map(w => w.messages[0].seed);
  first.stop();
  const second = h.start({
    white: { id: 'b' }, black: { id: 'a' }, seed: 987, swapSeedSeats: true
  });
  await second.loaded;
  const swapped = h.instances.slice(2, 4).map(w => w.messages[0].seed);
  assert.deepEqual(swapped, [...original].reverse());
  second.stop();
  for (const seed of [-1, 1.5, 4294967296, '987']) {
    assert.throws(() => h.start({
      white: { human: true }, black: { human: true }, seed
    }), RangeError);
  }
});

test('documented example matches the engine and API docs are linked', () => {
  const game = Engine.create();
  play(game, ['e2e4']);
  const docs = src('BOT_API.md');
  const example = JSON.parse(
    docs.match(/### Complete example[\s\S]*?```json\n([\s\S]*?)\n```/)[1]
  );
  assert.deepEqual(example, game.botState());
  assert.match(src('index.md'), /\[BOT_API\.md\]\(BOT_API\.md\)/);
});
