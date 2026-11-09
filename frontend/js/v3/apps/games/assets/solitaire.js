/* Module-private Klondike Solitaire. Draw-1/Draw-3, full valid-move rules, undo.
   Pure logic (createGame + move helpers) is vm-testable; mount() owns DOM only. */
(() => {
  'use strict';
  const RED = new Set([1, 2]);
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SUIT_MARKS = ['\u2660', '\u2665', '\u2666', '\u2663'];
  const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

  function card(suit, rank, up) {
    return { s: suit, r: rank, up: Boolean(up) };
  }

  function snapshot(state) {
    return {
      stock: state.stock.map((item) => ({ ...item })),
      waste: state.waste.map((item) => ({ ...item })),
      foundations: state.foundations.map((pile) => pile.map((item) => ({ ...item }))),
      tableau: state.tableau.map((pile) => pile.map((item) => ({ ...item }))),
      moves: state.moves,
      score: state.score,
      over: state.over,
    };
  }

  function restore(state, snap) {
    state.stock = snap.stock.map((item) => ({ ...item }));
    state.waste = snap.waste.map((item) => ({ ...item }));
    state.foundations = snap.foundations.map((pile) => pile.map((item) => ({ ...item })));
    state.tableau = snap.tableau.map((pile) => pile.map((item) => ({ ...item })));
    state.moves = snap.moves;
    state.score = snap.score;
    state.over = snap.over;
  }

  function commit(state) {
    state.history.push(snapshot(state));
    if (state.history.length > 200) state.history.shift();
  }

  function createGame(random = Math.random, options = {}) {
    const drawCount = options.drawCount === 3 ? 3 : 1;
    if (options.drawCount !== undefined && options.drawCount !== 1 && options.drawCount !== 3) {
      throw new Error('Solitaire drawCount must be 1 or 3');
    }
    const deck = [];
    for (let suit = 0; suit < 4; suit++) {
      for (let rank = 1; rank <= 13; rank++) deck.push(card(suit, rank, false));
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const tableau = Array.from({ length: 7 }, () => []);
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const dealt = deck.pop();
        dealt.up = row === col;
        tableau[col].push(dealt);
      }
    }
    return {
      stock: deck, waste: [], foundations: [[], [], [], []], tableau,
      drawCount, moves: 0, score: 0, over: null, history: [],
    };
  }

  function tableauTop(pile) {
    return pile.length ? pile[pile.length - 1] : null;
  }

  function canTableau(moving, pile) {
    if (!moving || !moving.up) return false;
    const top = tableauTop(pile);
    if (!top) return moving.r === 13;
    if (!top.up) return false;
    return moving.r === top.r - 1 && RED.has(moving.s) !== RED.has(top.s);
  }

  function canFoundation(moving, pile) {
    if (!moving || !moving.up) return false;
    if (!pile.length) return moving.r === 1;
    const top = pile[pile.length - 1];
    return moving.s === top.s && moving.r === top.r + 1;
  }

  function flipExposed(state, col) {
    const pile = state.tableau[col];
    const top = tableauTop(pile);
    if (top && !top.up) {
      top.up = true;
      state.score += 5;
      return true;
    }
    return false;
  }

  function draw(state) {
    if (state.over === 'win') return false;
    if (state.stock.length) {
      commit(state);
      for (let n = 0; n < state.drawCount && state.stock.length; n++) {
        const dealt = state.stock.pop();
        dealt.up = true;
        state.waste.push(dealt);
      }
      state.moves += 1;
      return true;
    }
    if (state.waste.length) {
      commit(state);
      while (state.waste.length) {
        const back = state.waste.pop();
        back.up = false;
        state.stock.push(back);
      }
      state.moves += 1;
      state.score = Math.max(0, state.score - 15);
      return true;
    }
    return false;
  }

  function toFoundationFromWaste(state) {
    const moving = state.waste[state.waste.length - 1];
    const pile = state.foundations.find((candidate) => canFoundation(moving, candidate));
    if (!moving || !pile) return false;
    commit(state);
    state.waste.pop();
    pile.push(moving);
    state.moves += 1;
    state.score += 10;
    checkWin(state);
    return true;
  }

  function toTableauFromWaste(state, col) {
    const pile = state.tableau[col];
    const moving = state.waste[state.waste.length - 1];
    if (!pile || !canTableau(moving, pile)) return false;
    commit(state);
    state.waste.pop();
    pile.push(moving);
    state.moves += 1;
    state.score += 5;
    return true;
  }

  function toFoundationFromTableau(state, col) {
    const pile = state.tableau[col];
    const moving = tableauTop(pile);
    const target = state.foundations.find((candidate) => canFoundation(moving, candidate));
    if (!pile || !moving || !target) return false;
    commit(state);
    pile.pop();
    target.push(moving);
    state.moves += 1;
    state.score += 10;
    flipExposed(state, col);
    checkWin(state);
    return true;
  }

  function tableauToTableau(state, fromCol, toCol, startIndex) {
    const from = state.tableau[fromCol];
    const to = state.tableau[toCol];
    if (!from || !to || fromCol === toCol) return false;
    if (startIndex < 0 || startIndex >= from.length) return false;
    const moving = from[startIndex];
    if (!moving.up) return false;
    for (const item of from.slice(startIndex)) {
      if (!item.up) return false;
    }
    if (!canTableau(moving, to)) return false;
    commit(state);
    const stack = from.splice(startIndex);
    for (const item of stack) to.push(item);
    state.moves += 1;
    if (stack.length > 1 || state.waste.length) state.score += 5;
    flipExposed(state, fromCol);
    return true;
  }

  function autoFoundation(state) {
    const wasteTop = state.waste[state.waste.length - 1];
    if (wasteTop && state.foundations.some((pile) => canFoundation(wasteTop, pile))) {
      return toFoundationFromWaste(state);
    }
    for (let col = 0; col < 7; col++) {
      const top = tableauTop(state.tableau[col]);
      if (top && state.foundations.some((pile) => canFoundation(top, pile))) {
        return toFoundationFromTableau(state, col);
      }
    }
    return false;
  }

  function undo(state) {
    const previous = state.history.pop();
    if (!previous) return false;
    restore(state, previous);
    return true;
  }

  function isWon(state) {
    return state.foundations.every((pile) => pile.length === 13);
  }

  function checkWin(state) {
    if (isWon(state)) state.over = 'win';
    return state.over === 'win';
  }

  function hasAnyMove(state) {
    if (isWon(state)) return false;
    if (state.stock.length || state.waste.length > 1) return true;
    const wasteTop = state.waste[state.waste.length - 1];
    if (wasteTop) {
      if (state.foundations.some((pile) => canFoundation(wasteTop, pile))) return true;
      if (state.tableau.some((pile) => canTableau(wasteTop, pile))) return true;
    }
    for (let col = 0; col < 7; col++) {
      const pile = state.tableau[col];
      const top = tableauTop(pile);
      if (top && top.up && state.foundations.some((target) => canFoundation(top, target))) return true;
      for (let start = 0; start < pile.length; start++) {
        if (!pile[start].up) continue;
        for (let dest = 0; dest < 7; dest++) {
          if (dest !== col && canTableau(pile[start], state.tableau[dest])) return true;
        }
        break;
      }
      if (top && !top.up && pile.length === 1) {
        for (let dest = 0; dest < 7; dest++) {
          if (dest !== col && canTableau(top, state.tableau[dest])) return true;
        }
      }
    }
    for (const pile of state.tableau) {
      const top = tableauTop(pile);
      if (top && !top.up) return true;
    }
    return false;
  }

  function statusText(state) {
    if (isWon(state)) return `You win! ${state.moves} moves, score ${state.score}. Deal a new game to play again.`;
    if (!hasAnyMove(state)) return 'No more moves. Undo a move or deal a new game.';
    const found = state.foundations.flat().length;
    return `${found} of 52 cards home. ${state.moves} moves, score ${state.score}.`;
  }

  function cardLabel(item) {
    return `${RANKS[item.r - 1]}${SUIT_MARKS[item.s]}`;
  }

  function mount(host) {
    let game = createGame(Math.random, { drawCount: 1 });
    let selected = null;
    let disposed = false;

    host.innerHTML = [
      '<div class="ag-cab" data-game="solitaire">',
      '<div class="ag-hud">',
      '<div class="ag-stat"><span>Moves</span><output data-sol-moves>0</output></div>',
      '<div class="ag-stat"><span>Score</span><output data-sol-score>0</output></div>',
      '<div class="ag-stat"><span>Home</span><output data-sol-home>0/52</output></div>',
      '</div>',
      '<div class="ag-toolbar"><label class="ag-draw">Draw <select data-sol-draw aria-label="Cards drawn from stock"><option value="1">1</option><option value="3">3</option></select></label>',
      '<span class="ag-spacer"></span>',
      '<button class="ag-btn" type="button" data-sol-undo>Undo</button>',
      '<button class="ag-btn" type="button" data-sol-auto>Auto-home</button>',
      '<button class="ag-btn" type="button" data-sol-new>New game</button></div>',
      '<div class="ag-sol-top" data-sol-top></div>',
      '<div class="ag-sol-table" data-sol-table></div>',
      '<p class="ag-status" data-sol-status role="status"></p>',
      '<p class="ag-hint">Tap stock to draw · tap a card then its destination · double-tap sends home · <kbd>S</kbd> draw · <kbd>F</kbd> auto-home · <kbd>U</kbd> undo · <kbd>N</kbd> new game.</p>',
      '</div>',
    ].join('');
    const cab = host.querySelector('.ag-cab');
    const top = host.querySelector('[data-sol-top]');
    const table = host.querySelector('[data-sol-table]');
    const status = host.querySelector('[data-sol-status]');
    const movesEl = host.querySelector('[data-sol-moves]');
    const scoreEl = host.querySelector('[data-sol-score]');
    const homeEl = host.querySelector('[data-sol-home]');
    const drawSelect = host.querySelector('[data-sol-draw]');

    function describe(item) {
      return `${RANKS[item.r - 1]} of ${SUIT_NAMES[item.s]}`;
    }

    function render() {
      if (disposed) return;
      top.innerHTML = '';
      const stockBtn = document.createElement('button');
      stockBtn.type = 'button';
      stockBtn.className = 'ag-card ag-stock' + (game.stock.length ? '' : ' is-empty');
      stockBtn.setAttribute('data-sol-stock', '');
      stockBtn.setAttribute('aria-label', game.stock.length ? `Stock, ${game.stock.length} cards. Activate to draw.` : 'Stock is empty. Activate to recycle the waste.');
      stockBtn.textContent = game.stock.length ? `${game.stock.length}` : '\u21BB';
      top.appendChild(stockBtn);

      const waste = document.createElement('div');
      waste.className = 'ag-pile';
      waste.setAttribute('data-sol-waste-pile', '');
      const wasteTopCard = game.waste[game.waste.length - 1];
      if (wasteTopCard) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ag-card' + (RED.has(wasteTopCard.s) ? ' is-red' : '') + (isSelected({ zone: 'waste' }) ? ' is-selected' : '');
        btn.setAttribute('data-sol-waste', '');
        btn.setAttribute('aria-label', `Waste: ${describe(wasteTopCard)}. Activate to select.`);
        btn.textContent = cardLabel(wasteTopCard);
        waste.appendChild(btn);
      } else {
        const empty = document.createElement('span');
        empty.className = 'ag-slot';
        empty.textContent = 'W';
        waste.appendChild(empty);
      }
      top.appendChild(waste);

      game.foundations.forEach((pile, index) => {
        const slot = document.createElement('div');
        slot.className = 'ag-pile';
        const topCard = pile[pile.length - 1];
        if (topCard) {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'ag-card' + (RED.has(topCard.s) ? ' is-red' : '');
          btn.setAttribute('data-sol-foundation', String(index));
          btn.setAttribute('aria-label', `Foundation ${index + 1}: ${describe(topCard)}.`);
          btn.textContent = cardLabel(topCard);
          slot.appendChild(btn);
        } else {
          const empty = document.createElement('button');
          empty.type = 'button';
          empty.className = 'ag-slot';
          empty.setAttribute('data-sol-foundation', String(index));
          empty.setAttribute('aria-label', `Foundation ${index + 1}, empty. Activate to place an ace here.`);
          empty.textContent = 'A';
          slot.appendChild(empty);
        }
        top.appendChild(slot);
      });

      table.innerHTML = '';
      game.tableau.forEach((pile, col) => {
        const column = document.createElement('div');
        column.className = 'ag-sol-col';
        column.setAttribute('role', 'group');
        column.setAttribute('aria-label', `Tableau column ${col + 1}`);
        if (!pile.length) {
          const empty = document.createElement('button');
          empty.type = 'button';
          empty.className = 'ag-slot';
          empty.setAttribute('data-sol-col', String(col));
          empty.setAttribute('data-sol-index', '-1');
          empty.setAttribute('aria-label', `Tableau column ${col + 1}, empty. Only a king may move here.`);
          empty.textContent = 'K';
          column.appendChild(empty);
        }
        pile.forEach((item, index) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          if (item.up) {
            btn.className = 'ag-card' + (RED.has(item.s) ? ' is-red' : '') + (isSelected({ zone: 'tableau', col, index }) ? ' is-selected' : '');
            btn.textContent = cardLabel(item);
            btn.setAttribute('aria-label', `Tableau column ${col + 1}: ${describe(item)}. Activate to select.`);
          } else {
            btn.className = 'ag-card is-back';
            btn.textContent = '\u00B7';
            btn.setAttribute('aria-label', `Tableau column ${col + 1}: face-down card.`);
            btn.disabled = true;
          }
          btn.setAttribute('data-sol-col', String(col));
          btn.setAttribute('data-sol-index', String(index));
          column.appendChild(btn);
        });
        table.appendChild(column);
      });

      movesEl.textContent = String(game.moves);
      scoreEl.textContent = String(game.score);
      homeEl.textContent = `${game.foundations.flat().length}/52`;
      status.textContent = statusText(game);
    }

    function isSelected(sel) {
      if (!selected) return false;
      if (selected.zone === 'waste') return sel.zone === 'waste';
      return sel.zone === 'tableau' && sel.col === selected.col && sel.index === selected.index;
    }

    function clearSelection() {
      selected = null;
    }

    function tryMoveToTableau(col) {
      let moved = false;
      if (selected && selected.zone === 'waste') moved = toTableauFromWaste(game, col);
      else if (selected && selected.zone === 'tableau') moved = tableauToTableau(game, selected.col, col, selected.index);
      if (moved) {
        clearSelection();
        render();
        return true;
      }
      return false;
    }

    function tryMoveToFoundation() {
      let moved = false;
      if (selected && selected.zone === 'waste') moved = toFoundationFromWaste(game);
      else if (selected && selected.zone === 'tableau') moved = toFoundationFromTableau(game, selected.col);
      if (moved) {
        clearSelection();
        render();
        return true;
      }
      return false;
    }

    function handleActivate(target) {
      if (target.hasAttribute('data-sol-stock')) {
        clearSelection();
        draw(game);
        render();
        return;
      }
      if (target.hasAttribute('data-sol-waste')) {
        if (selected && selected.zone === 'waste') clearSelection();
        else selected = { zone: 'waste' };
        render();
        return;
      }
      if (target.hasAttribute('data-sol-foundation')) {
        if (selected && !tryMoveToFoundation()) {
          status.textContent = 'That card cannot go home yet. ' + statusText(game);
        } else if (!selected) {
          render();
        }
        return;
      }
      if (target.hasAttribute('data-sol-col')) {
        const col = Number(target.getAttribute('data-sol-col'));
        const index = Number(target.getAttribute('data-sol-index'));
        const pile = game.tableau[col];
        if (index === -1 || !pile.length) {
          if (selected && !tryMoveToTableau(col)) status.textContent = 'Only a king (or a red-black descending stack from a king) fits there. ' + statusText(game);
          return;
        }
        const item = pile[index];
        if (!item.up) return;
        if (selected && selected.zone === 'tableau' && selected.col === col && selected.index === index) {
          if (!toFoundationFromTableau(game, col)) {
            clearSelection();
            render();
          } else {
            clearSelection();
            render();
          }
          return;
        }
        if (selected) {
          if (selected.zone === 'tableau' && selected.col === col) {
            selected = { zone: 'tableau', col, index };
            render();
            return;
          }
          if (!tryMoveToTableau(col)) {
            selected = { zone: 'tableau', col, index };
            render();
          }
          return;
        }
        selected = { zone: 'tableau', col, index };
        render();
      }
    }

    function handleClick(event) {
      const target = event.target.closest('button');
      if (!target || !cab.contains(target)) return;
      if (target.hasAttribute('data-sol-undo')) {
        if (!undo(game)) status.textContent = 'Nothing to undo yet. ' + statusText(game);
        else {
          clearSelection();
          render();
        }
        return;
      }
      if (target.hasAttribute('data-sol-new')) {
        newGame();
        return;
      }
      if (target.hasAttribute('data-sol-auto')) {
        if (!autoFoundation(game)) status.textContent = 'No card can go home right now. ' + statusText(game);
        else {
          clearSelection();
          render();
        }
        return;
      }
      handleActivate(target);
    }

    function handleDoubleClick(event) {
      const target = event.target.closest('button');
      if (!target || !cab.contains(target)) return;
      if (target.hasAttribute('data-sol-waste')) {
        clearSelection();
        selected = { zone: 'waste' };
        tryMoveToFoundation();
      } else if (target.hasAttribute('data-sol-col') && target.getAttribute('data-sol-index') !== '-1') {
        const col = Number(target.getAttribute('data-sol-col'));
        const index = Number(target.getAttribute('data-sol-index'));
        if (index === game.tableau[col].length - 1) {
          clearSelection();
          selected = { zone: 'tableau', col, index };
          tryMoveToFoundation();
        }
      }
    }

    function handleKeydown(event) {
      if (!cab.contains(document.activeElement) && document.activeElement !== document.body) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        clearSelection();
        draw(game);
        render();
      } else if (key === 'u') {
        event.preventDefault();
        if (undo(game)) {
          clearSelection();
          render();
        }
      } else if (key === 'n') {
        event.preventDefault();
        newGame();
      } else if (key === 'f') {
        event.preventDefault();
        if (autoFoundation(game)) {
          clearSelection();
          render();
        }
      } else if (key === 'escape') {
        clearSelection();
        render();
      }
    }

    function handleDrawChange() {
      game = createGame(Math.random, { drawCount: Number(drawSelect.value) });
      clearSelection();
      render();
    }

    function newGame() {
      game = createGame(Math.random, { drawCount: Number(drawSelect.value) });
      clearSelection();
      render();
      const stock = host.querySelector('[data-sol-stock]');
      if (stock) stock.focus({ preventScroll: true });
    }

    cab.addEventListener('click', handleClick);
    cab.addEventListener('dblclick', handleDoubleClick);
    document.addEventListener('keydown', handleKeydown);
    drawSelect.addEventListener('change', handleDrawChange);
    render();

    return function cleanup() {
      disposed = true;
      cab.removeEventListener('click', handleClick);
      cab.removeEventListener('dblclick', handleDoubleClick);
      document.removeEventListener('keydown', handleKeydown);
      drawSelect.removeEventListener('change', handleDrawChange);
    };
  }

  window.AizanoiArcadeSolitaire = {
    SUITS: SUIT_NAMES.slice(),
    createGame,
    canTableau,
    canFoundation,
    draw,
    toFoundationFromWaste,
    toTableauFromWaste,
    toFoundationFromTableau,
    tableauToTableau,
    autoFoundation,
    undo,
    isWon,
    hasAnyMove,
    mount,
  };
})();
