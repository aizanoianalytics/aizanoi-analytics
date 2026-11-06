import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import { solve } from './fixtures/sudoku-solver.mjs';
const path = 'frontend/js/v3/apps/games/assets/sudoku.js';
function engine() {
  assert.ok(existsSync(path), 'Sudoku engine must exist');
  const context = { window: {} }; vm.runInNewContext(readFileSync(path, 'utf8'), context);
  return context.window.AizanoiArcadeSudoku;
}
test('Sudoku supplies bounded local unique puzzles for four distinct difficulty levels', () => {
  const api = engine();
  assert.deepEqual(Array.from(Object.keys(api.bank)), ['easy', 'medium', 'hard', 'expert']);
  for (const [level, puzzles] of Object.entries(api.bank)) {
    assert.equal(puzzles.length, 3);
    for (const item of puzzles) {
      assert.equal(item.puzzle.length, 81);
      const solutions = solve(Array.from(item.puzzle, Number));
      assert.equal(solutions.length, 1, `${level} unique`);
      assert.equal(solutions[0].join(''), item.solution);
    }
  }
});
test('Sudoku transformations preserve clues and uniqueness; edits protect clues, detect conflicts and require a valid finish', () => {
  const api = engine();
  for (const level of Object.keys(api.bank)) {
    const game = api.create(level, () => 0.31);
    const solutions = solve(Array.from(game.clues));
    assert.equal(solutions.length, 1);
    assert.equal(game.complete(), false);
    const fixed = game.clues.findIndex(Boolean), open = game.clues.indexOf(0);
    assert.equal(game.set(fixed, 0), false);
    assert.equal(game.set(open, 10), false);
    assert.equal(game.set(open, 1.5), false);
    const peer = game.clues.findIndex((v,i) => v && Math.floor(i/9) === Math.floor(open/9));
    if (peer >= 0) {
      game.set(open, game.clues[peer]); assert.ok(game.conflicts().includes(open));
      assert.equal(game.complete(), false); game.undo(); assert.equal(game.values[open], 0);
    }
    solutions[0].forEach((n,i) => game.set(i,n));
    assert.equal(game.complete(), true);
    assert.equal(game.conflicts().length, 0);
    game.set(open, 0); assert.equal(game.complete(), false);
    game.undo(); assert.equal(game.complete(), true);
  }
  assert.throws(() => api.create('impossible'));
});
test('Difficulty ratings are recomputed from actual solving effort, not clue counts or labels', () => {
  const { bank } = engine();
  const units = [];
  for (let r=0;r<9;r++) units.push(Array.from({length:9},(_,c)=>r*9+c));
  for (let c=0;c<9;c++) units.push(Array.from({length:9},(_,r)=>r*9+c));
  for (let r=0;r<9;r+=3) for (let c=0;c<9;c+=3) units.push(Array.from({length:9},(_,i)=>(r+Math.floor(i/3))*9+c+i%3));
  function reduce(board, hidden) {
    const a = [...board];
    while (a.includes(0)) {
      const options = new Map();
      for (let i=0;i<81;i++) if (!a[i]) {
        const used = new Set(units.filter(u=>u.includes(i)).flat().map(j=>a[j]));
        options.set(i,[1,2,3,4,5,6,7,8,9].filter(n=>!used.has(n)));
      }
      let move = [...options].find(([,ns])=>ns.length===1);
      if (!move && hidden) for (const u of units) {
        for (let n=1;n<=9;n++) {
          const places = u.filter(i=>options.get(i)?.includes(n));
          if (places.length===1) { move=[places[0],[n]]; break; }
        }
        if (move) break;
      }
      if (!move) break;
      a[move[0]]=move[1][0];
    }
    return a;
  }
  for (const [level, puzzles] of Object.entries(bank)) for (const item of puzzles) {
    const original = Array.from(item.puzzle,Number);
    const naked = reduce(original,false), logical = reduce(original,true);
    const stats = {}; solve(logical,2,stats);
    const grade = !naked.includes(0) ? 'easy' : !logical.includes(0) ? 'medium' : stats.nodes <=100 ? 'hard' : 'expert';
    assert.equal(grade,level);
    assert.equal(stats.nodes,item.searchNodes);
    assert.equal(original.filter(Boolean).length,item.clues);
  }
});
test('Even repeated random draws give a new puzzle without a generation loop', () => {
  const api = engine();
  const first = api.create('easy',()=>0.5);
  const next = api.create('easy',()=>0.5,first.clues.join(''));
  assert.notEqual(next.clues.join(''),first.clues.join(''));
  assert.equal(solve(Array.from(next.clues)).length,1);
  for (let i=0;i<81;i++) if (!next.clues[i]) next.set(i,1);
  assert.equal(next.complete(),false,'a fully filled but invalid board must not win');
});
export { solve } from './fixtures/sudoku-solver.mjs';
