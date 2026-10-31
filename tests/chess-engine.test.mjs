import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { performance } from 'node:perf_hooks';

// The site is plain browser JS under a "type": "module" package, so UMD files load in a vm context like the snake tests.
const src = file => fs.readFileSync(new URL('../frontend/arcade/chess/' + file, import.meta.url), 'utf8');
// Same realm (runInThisContext) so deepEqual and instanceof see the test's own prototypes.
const loadUmd = (file, ChessEngine) => {
  const m = { exports: {} };
  new vm.Script(`(function (module, exports, ChessEngine) {
${src(file)}
})`, { filename: file }).runInThisContext()(m, m.exports, ChessEngine);
  return m.exports;
};
const Engine = loadUmd('engine.js');
const { create, perft, start960, STANDARD_FEN, rng } = Engine;

function play(game, moves) {
  for (const uci of moves) assert.equal(game.move(uci).ok, true, uci);
}

function piece(game, square) {
  const { file, rank } = Engine.parseSquare(square);
  return game.board()[7 - rank][file];
}

test('reference perft counts and mailbox performance', () => {
  const start = performance.now();
  for (const [depth, expected] of [[1, 20], [2, 400], [3, 8902]]) assert.equal(perft(STANDARD_FEN, depth), expected);
  assert.ok(performance.now() - start < 2000, 'start perft depths 1–3 must finish within 2 seconds');
  const kiwipete = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
  assert.equal(perft(kiwipete, 1), 48);
  assert.equal(perft(kiwipete, 2), 2039);
  const position3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';
  for (const [depth, expected] of [[1, 14], [2, 191], [3, 2812]]) assert.equal(perft(position3, depth), expected);
  assert.equal(perft(STANDARD_FEN, 0), 1);
});

test('all Scharnagl starts are distinct and meet Chess960 constraints', () => {
  assert.equal(start960(518), STANDARD_FEN);
  const starts = new Set();
  for (let n = 0; n < 960; n++) {
    const fen = start960(n);
    starts.add(fen.split(' ')[0]);
    const game = create({ variant: 'chess960', position960: n });
    const back = game.board()[7].map(p => p[1]);
    const bishops = back.flatMap((p, i) => p === 'B' ? [i] : []);
    const rooks = back.flatMap((p, i) => p === 'R' ? [i] : []);
    assert.equal(bishops.length, 2);
    assert.notEqual(bishops[0] % 2, bishops[1] % 2);
    assert.ok(rooks[0] < back.indexOf('K') && back.indexOf('K') < rooks[1]);
    assert.deepEqual(game.board()[0].map(p => p[1]), back);
    assert.equal(create({ fen: game.fen(), variant: 'chess960' }).fen(), game.fen());
  }
  assert.equal(starts.size, 960);
  assert.throws(() => start960(-1), RangeError);
  assert.throws(() => start960(960), RangeError);
});

test('Chess960 Shredder rights and overlapping castling squares', () => {
  const game = create({ variant: 'chess960', fen: '4k3/8/8/8/8/8/8/RK5R w HA - 0 1' });
  assert.equal(game.fen().split(' ')[2], 'HA');
  assert.ok(game.legalMoves().includes('b1a1'));
  assert.ok(game.legalMoves().includes('b1h1'));
  assert.equal(game.move('b1a1').castle, 'O-O-O');
  assert.equal(piece(game, 'c1'), 'wK');
  assert.equal(piece(game, 'd1'), 'wR');
  assert.equal(piece(game, 'b1'), null);
  assert.equal(piece(game, 'a1'), null);
  assert.equal(game.fen().split(' ')[2], '-');
  for (const [back, rights, uci] of [['6KR', 'H', 'g1h1'], ['5KR1', 'G', 'f1g1'], ['4KR2', 'F', 'e1f1']]) {
    const overlap = create({ variant: 'chess960', fen: '4k3/8/8/8/8/8/8/' + back + ' w ' + rights + ' - 0 1' });
    const before = overlap.fen();
    assert.ok(overlap.legalMoves().includes(uci));
    assert.equal(overlap.fen(), before, 'legal generation restores overlapping pieces');
    assert.equal(overlap.move(uci).ok, true);
    assert.equal(piece(overlap, 'g1'), 'wK');
    assert.equal(piece(overlap, 'f1'), 'wR');
  }
  const black = create({ variant: 'chess960', fen: 'rk5r/8/8/8/8/8/8/4K3 b ha - 0 1' });
  assert.equal(black.move('b8h8').castle, 'O-O');
  assert.equal(piece(black, 'g8'), 'bK');
  assert.equal(piece(black, 'f8'), 'bR');
});

test('castling aliases, checks, occupied paths and rook rights', () => {
  const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  const game = create({ fen });
  assert.ok(game.legalMoves().includes('e1h1'));
  assert.ok(!game.legalMoves().includes('e1g1'));
  assert.equal(game.move('e1g1').san, 'O-O');
  assert.equal(piece(game, 'g1'), 'wK');
  assert.equal(piece(game, 'f1'), 'wR');
  assert.equal(game.history[0].uci, 'e1h1');
  assert.equal(game.move('e8c8').san, 'O-O-O');
  assert.equal(piece(game, 'c8'), 'bK');
  assert.equal(piece(game, 'd8'), 'bR');
  for (const position of ['4kr2/8/8/8/8/8/8/4K2R w K - 0 1', '4k3/8/8/8/8/8/8/4KB1R w K - 0 1', 'k3r3/8/8/8/8/8/8/4K2R w K - 0 1']) {
    assert.ok(!create({ fen: position }).legalMoves().includes('e1h1'));
  }
  const exposed = create({ variant: 'chess960', fen: '4k3/8/8/8/8/8/8/rRK5 w B - 0 1' });
  assert.ok(!exposed.legalMoves().includes('c1b1'), 'stationary king cannot lose its rook shield');
  const moved = create({ fen });
  play(moved, ['h1h2', 'h8h7', 'h2h1', 'h7h8']);
  assert.equal(moved.fen().split(' ')[2], 'Qq');
  const taken = create({ fen });
  assert.equal(taken.move('a1a8').capture, 'bR');
  assert.equal(taken.fen().split(' ')[2], 'Kk');
  const noAlias = create({ variant: 'chess960', fen });
  assert.equal(noAlias.move('e1g1').ok, false);
});

test('fool\'s mate and stalemate', () => {
  const game = create();
  play(game, ['f2f3', 'e7e5', 'g2g4']);
  const result = game.move('d8h4');
  assert.equal(result.san, 'Qh4#');
  assert.equal(result.check, true);
  assert.equal(result.mate, true);
  assert.deepEqual(game.status(), { over: true, result: '0-1', reason: 'checkmate' });
  assert.equal(game.move('a2a3').ok, false);
  const stale = create({ fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' });
  assert.equal(stale.inCheck(), false);
  assert.deepEqual(stale.status(), { over: true, result: '1/2-1/2', reason: 'stalemate' });
});

test('threefold repetition and independent repetition history in clones', () => {
  const game = create();
  const cycle = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];
  play(game, cycle);
  assert.equal(game.status().over, false);
  const copy = game.clone();
  play(copy, cycle);
  assert.equal(copy.status().reason, 'threefold');
  assert.equal(game.status().over, false);
  play(game, cycle);
  assert.equal(game.status().reason, 'threefold');
});

test('repetition includes en passant only when capture is legal', () => {
  for (const fen of ['6nk/8/8/3p4/8/8/8/KN6 w - d6 0 1', '4r1nk/8/8/3pP3/8/8/8/1N2K3 w - d6 0 1']) {
    const game = create({ fen });
    const cycle = ['b1a3', 'g8f6', 'a3b1', 'f6g8'];
    play(game, cycle);
    play(game, cycle);
    assert.equal(game.status().reason, 'threefold');
  }
  const legal = create({ fen: '6nk/8/8/3pP3/8/8/8/KN6 w - d6 0 1' });
  const cycle = ['b1a3', 'g8f6', 'a3b1', 'f6g8'];
  play(legal, cycle);
  play(legal, cycle);
  assert.equal(legal.status().over, false);
});

test('insufficient material, fifty-move and max-plies draws', () => {
  for (const fen of ['7k/8/8/8/8/8/8/K7 w - - 0 1', '7k/8/8/8/8/8/8/KB6 w - - 0 1', '7k/8/8/8/8/8/8/KN6 w - - 0 1', '5b1k/8/8/8/8/8/8/K1B5 w - - 0 1']) {
    assert.equal(create({ fen }).status().reason, 'insufficient');
  }
  assert.equal(create({ fen: '6bk/8/8/8/8/8/8/K1B5 w - - 0 1' }).status().over, false);
  const fifty = create({ fen: '7k/8/8/8/8/8/R7/K7 w - - 99 1' });
  play(fifty, ['a2b2']);
  assert.equal(fifty.halfmoveClock, 100);
  assert.equal(fifty.status().reason, 'fifty-move');
  const short = create({ maxPlies: 2 });
  play(short, ['e2e4', 'e7e5']);
  assert.equal(short.status().reason, 'max-plies');
});

test('en passant is immediate and cannot expose a king', () => {
  const game = create();
  play(game, ['e2e4', 'a7a6', 'e4e5', 'd7d5']);
  assert.ok(game.legalMoves().includes('e5d6'));
  const copy = game.clone();
  const result = copy.move('e5d6');
  assert.equal(result.capture, 'bP');
  assert.equal(result.san, 'exd6');
  assert.equal(piece(copy, 'd5'), null);
  assert.equal(piece(copy, 'd6'), 'wP');
  play(game, ['h2h3', 'a6a5']);
  assert.ok(!game.legalMoves().includes('e5d6'));
  const pinned = create({ fen: 'k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1' });
  assert.ok(!pinned.legalMoves().includes('e5d6'));
  const horizontal = create({ fen: '7k/8/8/r4pPK/8/8/8/8 w - f6 0 1' });
  assert.ok(!horizontal.legalMoves().includes('g5f6'));
});

test('all promotions including knight underpromotion', () => {
  const game = create({ fen: '7k/P7/8/8/8/8/8/7K w - - 0 1' });
  for (const p of ['q', 'r', 'b', 'n']) assert.ok(game.legalMoves().includes('a7a8' + p));
  const result = game.move('a7a8n');
  assert.equal(result.promotion, 'n');
  assert.equal(result.san, 'a8=N');
  assert.equal(piece(game, 'a8'), 'wN');
});

test('SAN disambiguation and captures', () => {
  const game = create({ fen: '7k/8/8/8/8/8/8/1N2KN2 w - - 0 1' });
  assert.equal(game.move('b1d2').san, 'Nbd2');
  const capture = create({ fen: '7k/8/8/8/8/8/p7/R6K w - - 0 1' });
  assert.equal(capture.move('a1a2').san, 'Rxa2');
});

test('illegal inputs do not mutate the game and API data is detached', () => {
  const game = create();
  for (const input of ['e2e5', 'e1h1', 'e7e5', 'a0a1', 'E2E4', 'e2e4q', null, {}]) {
    assert.equal(game.move(input).ok, false);
    assert.equal(game.fen(), STANDARD_FEN);
  }
  assert.deepEqual(Engine.parseSquare('h8'), { file: 7, rank: 7 });
  assert.equal(Engine.squareName(0, 0), 'a1');
  assert.equal(Engine.parseSquare('a9'), null);
  play(game, ['e2e4']);
  assert.equal(game.ply, 1);
  assert.equal(game.moveNumber, 1);
  assert.equal(game.halfmoveClock, 0);
  assert.deepEqual(game.lastMove, { from: 'e2', to: 'e4' });
  const history = game.history;
  history[0].uci = 'broken';
  game.lastMove.from = 'broken';
  const state = game.botState();
  assert.equal(state.you, 'b');
  assert.equal(state.timeLimitMs, 1000);
  state.board[0][0] = null;
  state.history.push('broken');
  state.legalMoves.length = 0;
  assert.equal(game.history[0].uci, 'e2e4');
  assert.equal(game.lastMove.from, 'e2');
  assert.equal(piece(game, 'a8'), 'bR');
  const copy = game.clone();
  play(copy, ['e7e5']);
  assert.equal(copy.moveNumber, 2);
  assert.equal(game.turn, 'b');
  assert.equal(game.history.length, 1);
  assert.deepEqual(game.legalMoves(), [...game.legalMoves()].sort());
});

test('forfeit stores detail and clones preserve terminal state', () => {
  const game = create();
  game.forfeit('w', 'Bot exceeded 1000 ms');
  assert.deepEqual(game.status(), { over: true, result: '0-1', reason: 'forfeit', detail: 'Bot exceeded 1000 ms' });
  assert.deepEqual(game.clone().status(), game.status());
  assert.equal(game.move('e2e4').ok, false);
  assert.throws(() => create().forfeit('x', 'bad'), RangeError);
});

test('rng matches mulberry32 and is repeatable', () => {
  const first = rng(123);
  const second = rng(123);
  const reference = [0.7872516233474016, 0.1785435655619949, 0.49531551403924823];
  for (const expected of reference) {
    assert.equal(first(), expected);
    assert.equal(second(), expected);
  }
});

test('sample bots return legal moves across 20 seeded positions; minimax finds mate', () => {
  const previousEngine = globalThis.ChessEngine;
  const previousRandom = Math.random;
  globalThis.ChessEngine = Engine;
  Math.random = rng(7941);
  try {
    const bots = ['sample-random', 'sample-greedy', 'sample-minimax'].map(id => { const b = loadUmd('bots/' + id + '.js', Engine); return typeof b === 'function' ? b : b.move; });
    const random = rng(2026);
    let game = create();
    const positions = [];
    while (positions.length < 20) {
      if (game.status().over) game = create();
      positions.push(game.botState());
      const legal = game.legalMoves();
      play(game, [legal[Math.floor(random() * legal.length)]]);
    }
    for (const state of positions) {
      for (const bot of bots) {
        const snapshot = structuredClone(state);
        const start = performance.now();
        assert.ok(state.legalMoves.includes(bot(state)));
        assert.ok(performance.now() - start < 1000, 'sample bot must stay within its move budget');
        assert.deepEqual(state, snapshot);
      }
    }
    const mate = create({ fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1' });
    assert.equal(bots[2](mate.botState()), 'd1d8');
    assert.equal(mate.move('d1d8').mate, true);
  } finally {
    Math.random = previousRandom;
    if (previousEngine === undefined) delete globalThis.ChessEngine;
    else globalThis.ChessEngine = previousEngine;
  }
});
