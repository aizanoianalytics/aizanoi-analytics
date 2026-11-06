/* Module-private Sudoku. Offline-authored bank; no generation on the UI thread. */
(() => {
  'use strict';
  const bank = {
  "easy": [
    {
      "puzzle": "040200760900403008825090040050720900609001802008360100310054090000036405584070600",
      "solution": "143285769967413528825697341451728936639541872278369154316854297792136485584972613",
      "searchNodes": 1,
      "clues": 40
    },
    {
      "puzzle": "080192000407680190000050000936500070870936501501804030069005340340269005010308260",
      "solution": "683192457457683192192457683936521874874936521521874936269715348348269715715348269",
      "searchNodes": 1,
      "clues": 44
    },
    {
      "puzzle": "006050132570300069013690005600185240850430000320060000700210394009500020080040007",
      "solution": "946857132578321469213694785697185243851432976324769518765218394439576821182943657",
      "searchNodes": 1,
      "clues": 40
    }
  ],
  "medium": [
    {
      "puzzle": "690270000001000000854003000160005080000167000400300700000736210000008000030000049",
      "solution": "693271458271854396854693172167425983389167524425389761948736215512948637736512849",
      "searchNodes": 1,
      "clues": 28
    },
    {
      "puzzle": "000700000000200109710030400070015000900300764000000090090150002000826007802000300",
      "solution": "246791853583264179719538426674915238951382764328647591497153682135826947862479315",
      "searchNodes": 1,
      "clues": 28
    },
    {
      "puzzle": "420080000001000000038619200500900002040030080000420003080000520000000009057003104",
      "solution": "425387691961254378738619245573968412142735986896421753389146527614572839257893164",
      "searchNodes": 1,
      "clues": 28
    }
  ],
  "hard": [
    {
      "puzzle": "003846000000002953000000080170020000002400006009000500000270490905000020200954160",
      "solution": "593846271864712953721539684176325849352498716489167532618273495945681327237954168",
      "searchNodes": 29,
      "clues": 30
    },
    {
      "puzzle": "850034020304600000007080000720800040400005008000306502070900204000000010103060007",
      "solution": "859134726314627985267589431725891643436275198981346572578913264642758319193462857",
      "searchNodes": 47,
      "clues": 30
    },
    {
      "puzzle": "046570900000604000710002000409015200050008400207940000000000540500087000092400017",
      "solution": "346571982928634751715892364469315278153728496287946135871269543534187629692453817",
      "searchNodes": 48,
      "clues": 32
    }
  ],
  "expert": [
    {
      "puzzle": "008090100000000003060400050045060000009010405100000800300007000856139002472000000",
      "solution": "528396174714852693963471258245968317689713425137524869391247586856139742472685931",
      "searchNodes": 102,
      "clues": 28
    },
    {
      "puzzle": "257006001100700000630800500901080703070000020500000000720900000400000237000300600",
      "solution": "257436981198752346634891572941285763376149825582673419723964158469518237815327694",
      "searchNodes": 331,
      "clues": 28
    },
    {
      "puzzle": "090000080805209060037500000000000000503004076040970300000030802100490630050000000",
      "solution": "492763581815249763637581249769358124583124976241976358974635812128497635356812497",
      "searchNodes": 310,
      "clues": 28
    }
  ]
};
  for (const list of Object.values(bank)) { list.forEach(Object.freeze); Object.freeze(list); }
  Object.freeze(bank);
  const peers = (a, b) => Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9 || (Math.floor(a / 27) === Math.floor(b / 27) && Math.floor(a % 9 / 3) === Math.floor(b % 9 / 3));
  function shuffled(items, random) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
  function create(level = 'easy', random = Math.random, previous = '') {
    if (!Object.hasOwn(bank, level)) throw new Error('Unknown Sudoku difficulty');
    const source = bank[level][Math.floor(random() * bank[level].length)];
    const digits = [0, ...shuffled([1,2,3,4,5,6,7,8,9], random)];
    const rows = shuffled([0,1,2], random).flatMap(b => shuffled([0,1,2], random).map(r => b * 3 + r));
    const cols = shuffled([0,1,2], random).flatMap(b => shuffled([0,1,2], random).map(c => b * 3 + c));
    const transpose = random() < 0.5;
    let transformed = rows.flatMap(r => cols.map(c => digits[Number(source.puzzle[transpose ? c * 9 + r : r * 9 + c])]));
    if (transformed.join('') === previous) transformed = transformed.map(n => n ? n % 9 + 1 : 0);
    const clues = Object.freeze(transformed);
    const values = [...clues];
    const history = [];
    function conflicts() {
      return values.flatMap((n,i) => n && values.some((v,j) => i !== j && v === n && peers(i,j)) ? [i] : []);
    }
    return { clues, values, level,
      set(i, n) {
        if (!Number.isInteger(i) || i < 0 || i >= 81 || clues[i] || !Number.isInteger(n) || n < 0 || n > 9 || values[i] === n) return false;
        history.push([i, values[i]]); values[i] = n; return true;
      },
      undo() { const move = history.pop(); if (!move) return false; values[move[0]] = move[1]; return true; },
      conflicts,
      complete() { return values.every(n => n >= 1 && n <= 9) && conflicts().length === 0; }
    };
  }
  function mount(host) {
    host.innerHTML = `<section class="ag-cab sd-cab" data-game="sudoku" aria-label="Sudoku"><div class="sd-toolbar"><label>Difficulty <select data-sudoku-level aria-label="Difficulty"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option><option value="expert">Expert</option></select></label><button type="button" class="ag-btn" data-sudoku-new>New game</button></div><p class="ag-hint" data-sudoku-description></p><div class="sd-board" role="grid" aria-label="Sudoku board" data-sudoku-board>${Array.from({length:9}, (_,r) => `<div class="sd-row" role="row">${Array.from({length:9}, (_,c) => `<button type="button" role="gridcell" class="sd-cell${c===2 || c===5 ? ' sd-right' : ''}${r===2 || r===5 ? ' sd-bottom' : ''}" data-sudoku-cell="${r*9+c}"></button>`).join('')}</div>`).join('')}</div><div class="sd-pad" role="group" aria-label="Number pad">${Array.from({length:9}, (_,i) => `<button type="button" class="ag-btn" data-sudoku-number="${i+1}" aria-label="Enter ${i+1}">${i+1}</button>`).join('')}</div><div class="sd-actions"><button type="button" class="ag-btn" data-sudoku-number="0">Erase</button><button type="button" class="ag-btn" data-sudoku-undo>Undo</button></div><p class="ag-status" role="status" aria-live="polite" data-sudoku-status></p><p class="ag-hint">Fill every row, column and 3×3 box with 1–9. Tap a cell, then a number. Keyboard: arrows to move, 1–9 to enter, Delete to erase, Ctrl/⌘+Z to undo. Changing difficulty starts a new puzzle.</p></section>`;
    const root = host.firstElementChild;
    const cells = [...root.querySelectorAll('[data-sudoku-cell]')];
    const board = root.querySelector('[data-sudoku-board]');
    const status = root.querySelector('[data-sudoku-status]');
    const select = root.querySelector('[data-sudoku-level]');
    const descriptions = {easy:'Start with direct single-candidate clues.', medium:'Look for the only place a number can go in a row, column or box.', hard:'Singles alone will not finish these puzzles. Use advanced eliminations.', expert:'The deepest puzzles in this collection. Expect longer chains of deductions.'};
    let game; let selected = 0; let disposed = false;
    function render() {
      const conflicts = new Set(game.conflicts());
      const complete = game.complete();
      board.dataset.complete = String(complete);
      cells.forEach((cell,i) => {
        cell.textContent = game.values[i] || '';
        cell.tabIndex = i === selected ? 0 : -1;
        cell.dataset.fixed = String(Boolean(game.clues[i]));
        cell.setAttribute('aria-readonly', String(Boolean(game.clues[i])));
        cell.setAttribute('aria-selected', String(i === selected));
        cell.setAttribute('aria-invalid', String(conflicts.has(i)));
        cell.setAttribute('aria-label', `Row ${Math.floor(i/9)+1}, column ${i%9+1}: ${game.values[i] || 'empty'}${game.clues[i] ? ', fixed clue' : ''}${conflicts.has(i) ? ', conflict' : ''}`);
      });
      const filled = game.values.filter(Boolean).length;
      status.textContent = complete ? 'Puzzle solved! Every row, column and box is correct.' : conflicts.size ? `${conflicts.size} cells in conflict. Repeated numbers are marked ×. ${filled}/81 filled.` : `${filled}/81 filled. ${game.clues[selected] ? 'Selected cell is a fixed clue.' : 'Choose a number for the selected cell.'}`;
      status.dataset.tone = complete ? 'good' : conflicts.size ? 'bad' : '';
    }
    function start() {
      game = create(select.value, Math.random, game?.clues.join(''));
      selected = game.clues.indexOf(0);
      board.dataset.level = select.value;
      root.querySelector('[data-sudoku-description]').textContent = descriptions[select.value];
      render();
    }
    function input(n) { if (!disposed && !game.complete()) { game.set(selected,n); render(); } }
    function choose(i, focus = false) { selected = i; render(); if (focus) cells[i].focus({preventScroll:true}); }
    function click(event) {
      const cell = event.target.closest('[data-sudoku-cell]');
      if (cell) choose(Number(cell.dataset.sudokuCell));
      const number = event.target.closest('[data-sudoku-number]');
      if (number) input(Number(number.dataset.sudokuNumber));
      if (event.target.closest('[data-sudoku-new]')) start();
      if (event.target.closest('[data-sudoku-undo]')) { game.undo(); render(); }
    }
    function keydown(event) {
      if (!event.target.closest('[data-sudoku-cell]')) return;
      const row = Math.floor(selected/9), col = selected%9;
      const movement = {ArrowLeft:row*9+Math.max(0,col-1), ArrowRight:row*9+Math.min(8,col+1), ArrowUp:Math.max(0,row-1)*9+col, ArrowDown:Math.min(8,row+1)*9+col, Home:row*9, End:row*9+8};
      if (Object.hasOwn(movement,event.key)) { event.preventDefault(); choose(movement[event.key],true); }
      else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='z') { event.preventDefault(); game.undo(); render(); }
      else if (!event.ctrlKey && !event.metaKey && !event.altKey && /^[1-9]$/.test(event.key)) { event.preventDefault(); input(Number(event.key)); }
      else if (['Backspace','Delete','0'].includes(event.key)) { event.preventDefault(); input(0); }
    }
    root.addEventListener('click',click);
    root.addEventListener('keydown',keydown);
    select.addEventListener('change',start);
    start(); cells[selected].focus({preventScroll:true});
    return () => { disposed = true; root.removeEventListener('click',click); root.removeEventListener('keydown',keydown); select.removeEventListener('change',start); host.replaceChildren(); };
  }
  window.AizanoiArcadeSudoku = Object.freeze({ bank, create, mount });
})();
