import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const path = 'frontend/js/v3/apps/games/assets/solitaire.js';

function engine() {
  assert.ok(existsSync(path), 'Solitaire engine must exist');
  const context = { window: {} };
  vm.runInNewContext(readFileSync(path, 'utf8'), context);
  return context.window.AizanoiArcadeSolitaire;
}

function mulberry(seed) {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

test('Solitaire deals a full 52-card Klondike layout', () => {
  const api = engine();
  const game = api.createGame(mulberry(7));
  assert.equal(game.tableau.length, 7);
  game.tableau.forEach((pile, index) => assert.equal(pile.length, index + 1));
  for (const pile of game.tableau) {
    assert.equal(pile.at(-1).up, true);
    assert.deepEqual(pile.slice(0, -1).map((card) => card.up), pile.slice(0, -1).map(() => false));
  }
  const all = [...game.stock, ...game.waste, ...game.foundations.flat(), ...game.tableau.flat()];
  assert.equal(all.length, 52);
  assert.equal(new Set(all.map((card) => `${card.s}-${card.r}`)).size, 52);
  assert.equal(game.stock.length, 24);
  for (const pile of game.foundations) assert.equal(pile.length, 0);
  assert.equal(game.moves, 0);
  assert.equal(game.over, null);
});

test('Solitaire enforces tableau and foundation placement rules', () => {
  const api = engine();
  const red7 = { s: 1, r: 7, up: true };
  const black8 = { s: 0, r: 8, up: true };
  const red8 = { s: 2, r: 8, up: true };
  const king = { s: 3, r: 13, up: true };
  const queen = { s: 1, r: 12, up: true };
  assert.equal(api.canTableau(red7, [black8]), true);
  assert.equal(api.canTableau(red7, [red8]), false);
  assert.equal(api.canTableau(red7, []), false);
  assert.equal(api.canTableau(king, []), true);
  assert.equal(api.canTableau(queen, []), false);
  assert.equal(api.canFoundation({ s: 0, r: 1, up: true }, []), true);
  assert.equal(api.canFoundation({ s: 0, r: 2, up: true }, []), false);
  assert.equal(api.canFoundation({ s: 0, r: 2, up: true }, [{ s: 0, r: 1, up: true }]), true);
  assert.equal(api.canFoundation({ s: 1, r: 2, up: true }, [{ s: 0, r: 1, up: true }]), false);
  assert.equal(api.canFoundation({ s: 0, r: 3, up: true }, [{ s: 0, r: 1, up: true }]), false);
});

test('Solitaire stock draws to waste, recycles, and refuses illegal moves', () => {
  const api = engine();
  const game = api.createGame(mulberry(11), { drawCount: 1 });
  assert.equal(api.draw(game), true);
  assert.equal(game.waste.length, 1);
  assert.equal(game.stock.length, 23);
  assert.equal(game.moves, 1);
  while (game.stock.length) api.draw(game);
  assert.equal(game.waste.length, 24);
  assert.equal(api.draw(game), true);
  assert.equal(game.stock.length, 24);
  assert.equal(game.waste.length, 0);
  const fresh = api.createGame(mulberry(11), { drawCount: 1 });
  assert.equal(api.toTableauFromWaste(fresh, 0), false);
  assert.equal(fresh.moves, 0);
});

test('Solitaire moves waste and tableau cards, flips exposed cards, and undoes', () => {
  const api = engine();
  const game = api.createGame(mulberry(21));
  game.waste.push({ s: 0, r: 1, up: true });
  assert.equal(api.toFoundationFromWaste(game), true);
  assert.equal(game.foundations.flat().length, 1);
  assert.equal(api.undo(game), true);
  assert.equal(game.foundations.flat().length, 0);
  assert.equal(game.waste.length, 1);
  const mover = api.createGame(mulberry(21));
  mover.tableau = [[{ s: 3, r: 13, up: true }], [], [], [], [], [], []];
  mover.stock = []; mover.waste = [];
  assert.equal(api.tableauToTableau(mover, 0, 1, 0), true);
  assert.equal(mover.tableau[1].length, 1);
  assert.equal(api.undo(mover), true);
  assert.equal(mover.tableau[0].length, 1);
  assert.equal(mover.tableau[1].length, 0);
  const flipper = api.createGame(mulberry(21));
  flipper.tableau = [[{ s: 0, r: 5, up: false }, { s: 1, r: 4, up: true }], [], [], [], [], [], []];
  flipper.stock = []; flipper.waste = [];
  flipper.foundations = [[], [], [], []];
  assert.equal(api.toFoundationFromTableau(flipper, 0), false);
  flipper.tableau[1] = [{ s: 0, r: 5, up: true }];
  assert.equal(api.tableauToTableau(flipper, 0, 1, 1), true);
  assert.equal(flipper.tableau[0].at(-1).up, true);
});

test('Solitaire detects wins, winnable progress, and dead ends', () => {
  const api = engine();
  const game = api.createGame(mulberry(3));
  assert.equal(api.isWon(game), false);
  for (const foundation of game.foundations) {
    for (let rank = 1; rank <= 13; rank++) foundation.push({ s: game.foundations.indexOf(foundation), r: rank, up: true });
  }
  game.stock = []; game.waste = []; game.tableau = [[], [], [], [], [], [], []];
  assert.equal(api.isWon(game), true);
  const live = api.createGame(mulberry(3));
  assert.equal(api.hasAnyMove(live), true);
  const stuck = api.createGame(mulberry(3));
  stuck.stock = []; stuck.waste = [{ s: 0, r: 5, up: true }];
  stuck.tableau = [[{ s: 0, r: 5, up: true }], [], [], [], [], [], []];
  stuck.foundations = [[], [], [], []];
  assert.equal(api.hasAnyMove(stuck), false);
});

test('Solitaire exposes a mount factory and rejects bad options', () => {
  const api = engine();
  assert.equal(typeof api.mount, 'function');
  assert.throws(() => api.createGame(mulberry(1), { drawCount: 5 }));
});
