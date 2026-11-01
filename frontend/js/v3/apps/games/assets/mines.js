/** Aizanoi Arcade — Survey Mines. Explicit mount/dispose factory; styling lives in arcade.css. */
(function () {
  'use strict';
  const W = 10, H = 10, MINES = 15;

  function mount(container) {
    const utils = window.AizanoiGames;
    let board, revealed, flagged, first, over, won, startedAt, timer = null, longPressTimer = null, suppressNextClick = false;
    let paused = false, pauseStarted = 0, flagMode = false, focusX = 0, focusY = 0, disposed = false;

    container.innerHTML = `
      <div class="ag-cab" data-game="mines">
        <div class="ag-hud">
          <div class="ag-stat"><span>Mines left</span><output id="mines-counter">015</output></div>
          <div class="ag-stat"><span>Time</span><output id="mines-timer">000</output></div>
          <button class="ag-btn" type="button" data-mines-mode aria-pressed="false" aria-label="Flag mode. When on, tapping a cell places or removes a flag instead of revealing it.">Flag mode: off</button>
        </div>
        <div class="ag-mines-board"><div class="ag-mines-grid" id="mines-grid" role="group" aria-label="Survey Mines field, ${H} rows by ${W} columns. Use arrow keys to move, Enter to reveal and F to flag."></div></div>
        <p class="ag-status" id="mines-status"></p>
        <p class="ag-hint">Click or <kbd>Enter</kbd> reveals · right-click, long-press or <kbd>F</kbd> flags · arrow keys move. Your first reveal is always safe.</p>
      </div>`;
    const cab = container.querySelector('.ag-cab');
    const grid = container.querySelector('#mines-grid');
    const statusEl = container.querySelector('#mines-status');
    const counterEl = container.querySelector('#mines-counter');
    const clockEl = container.querySelector('#mines-timer');
    const modeBtn = container.querySelector('[data-mines-mode]');
    const bestFormat = (value) => value + 's';
    cab.insertBefore(utils.toolbar({ game: 'mines', lowerBetter: true, onPause: togglePause, onRestart: init, formatBest: bestFormat }), container.querySelector('.ag-mines-board'));
    const say = utils.liveRegion(cab);

    grid.style.setProperty('--ag-cols', W);
    const cells = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'ag-cell';
        cell.dataset.x = x; cell.dataset.y = y;
        grid.appendChild(cell);
        cells.push(cell);
      }
    }

    function init() {
      board = []; revealed = []; flagged = []; first = true; over = false; won = false; startedAt = 0; paused = false; pauseStarted = 0;
      stopClock();
      for (let y = 0; y < H; y++) {
        board.push(new Array(W).fill(0));
        revealed.push(new Array(W).fill(false));
        flagged.push(new Array(W).fill(false));
      }
      utils.setPauseButton(container, false);
      setMode(false);
      render(); updateStatus();
    }

    function setMode(on) {
      flagMode = on;
      modeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      modeBtn.textContent = on ? 'Flag mode: on' : 'Flag mode: off';
    }

    function stopClock() { if (timer) clearInterval(timer); timer = null; }
    function startClock() {
      if (startedAt) return;
      startedAt = Date.now();
      timer = setInterval(() => {
        if (!container.isConnected) { dispose(); return; }
        if (over) { stopClock(); return; }
        if (!paused) updateCounters();
      }, 500);
    }

    function revealAt(x, y) {
      if (over || paused || flagged[y][x] || revealed[y][x]) return;
      if (first) { first = false; placeMines(x, y); startClock(); }
      if (board[y][x] === -1) { revealed[y][x] = true; end(false); return; }
      const before = countRevealed();
      floodFill(x, y);
      const opened = countRevealed() - before;
      checkWin();
      if (!over) say(opened > 1 ? `Revealed ${opened} cells` : describe(x, y));
    }

    function toggleFlag(x, y) {
      if (over || paused || revealed[y][x]) return;
      flagged[y][x] = !flagged[y][x];
      render(); updateStatus();
      say(`${flagged[y][x] ? 'Flagged' : 'Unflagged'} row ${y + 1}, column ${x + 1}`);
    }

    function describe(x, y) {
      const v = board[y][x];
      if (v === -1) return 'Mine';
      return v > 0 ? `${v} adjacent ${v === 1 ? 'mine' : 'mines'}` : 'Empty';
    }

    function countRevealed() { let n = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (revealed[y][x]) n++; return n; }

    function onCellClick(event) {
      const cell = event.target.closest('.ag-cell');
      if (!cell) return;
      const x = +cell.dataset.x, y = +cell.dataset.y;
      setFocus(x, y, false);
      if (suppressNextClick) { suppressNextClick = false; return; }
      if (flagMode) toggleFlag(x, y); else revealAt(x, y);
    }
    function onContextMenu(event) {
      const cell = event.target.closest('.ag-cell');
      if (!cell) return;
      event.preventDefault();
      toggleFlag(+cell.dataset.x, +cell.dataset.y);
    }
    function cancelLongPress() { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; }
    function onPointerDown(event) {
      const cell = event.target.closest('.ag-cell');
      if (!cell || event.pointerType !== 'touch') return;
      const x = +cell.dataset.x, y = +cell.dataset.y;
      longPressTimer = setTimeout(() => { longPressTimer = null; suppressNextClick = true; toggleFlag(x, y); }, 480);
    }
    function setFocus(x, y, move = true) {
      const old = cells[focusY * W + focusX];
      if (old) old.tabIndex = -1;
      focusX = x; focusY = y;
      const next = cells[y * W + x];
      next.tabIndex = 0;
      if (move) next.focus();
    }
    function onGridKeydown(event) {
      const cell = event.target.closest('.ag-cell');
      if (!cell || event.ctrlKey || event.metaKey || event.altKey) return;
      let x = +cell.dataset.x, y = +cell.dataset.y;
      const key = event.key;
      if (key === 'ArrowLeft') x = Math.max(0, x - 1);
      else if (key === 'ArrowRight') x = Math.min(W - 1, x + 1);
      else if (key === 'ArrowUp') y = Math.max(0, y - 1);
      else if (key === 'ArrowDown') y = Math.min(H - 1, y + 1);
      else if (key === 'Home') x = 0;
      else if (key === 'End') x = W - 1;
      else if (key === 'f' || key === 'F') { event.preventDefault(); toggleFlag(x, y); return; }
      else return;
      event.preventDefault();
      setFocus(x, y);
    }
    function onKey(event) {
      if (!utils.acceptsKey(container, event, null)) return;
      if (event.key.toLowerCase() === 'p' && !over && !event.target.closest?.('.ag-cell')) { event.preventDefault(); togglePause(); }
    }
    function onVisibility() { if (document.hidden && !paused && !over && startedAt) togglePause(); }

    function placeMines(sx, sy) {
      let placed = 0;
      while (placed < MINES) {
        const x = Math.floor(Math.random() * W), y = Math.floor(Math.random() * H);
        if (board[y][x] === -1 || (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1)) continue;
        board[y][x] = -1; placed++;
      }
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (board[y][x] === -1) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < W && ny < H && board[ny][nx] === -1) n++;
        }
        board[y][x] = n;
      }
    }

    function floodFill(sx, sy) {
      const stack = [[sx, sy]];
      while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || y < 0 || x >= W || y >= H || revealed[y][x] || flagged[y][x]) continue;
        revealed[y][x] = true;
        if (board[y][x] === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stack.push([x + dx, y + dy]);
      }
      render();
    }

    function checkWin() {
      let safeLeft = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y][x] !== -1 && !revealed[y][x]) safeLeft++;
      if (!safeLeft) end(true);
    }

    function end(result) {
      over = true; won = result;
      stopClock();
      if (!won) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y][x] === -1) revealed[y][x] = true;
      render(); updateStatus();
      if (won) {
        const seconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        utils.save('mines', seconds);
        utils.refreshToolbar(container, 'mines', { lowerBetter: true, formatBest: bestFormat });
        say(`Field cleared in ${seconds} seconds`);
      } else say('Boom. You hit a mine.');
    }

    function togglePause() {
      if (over) return;
      paused = !paused;
      if (paused) pauseStarted = Date.now();
      else if (startedAt && pauseStarted) startedAt += Date.now() - pauseStarted;
      utils.setPauseButton(container, paused);
      say(paused ? 'Paused' : 'Resumed');
      updateStatus();
    }

    function render() {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = cells[y * W + x], v = board[y][x], r = revealed[y][x], f = flagged[y][x];
        const pos = `Row ${y + 1}, column ${x + 1}: `;
        c.tabIndex = (x === focusX && y === focusY) ? 0 : -1;
        c.toggleAttribute('data-open', r);
        c.toggleAttribute('data-mine', r && v === -1);
        c.toggleAttribute('data-flag', !r && f);
        if (r && v > 0) c.dataset.n = v; else delete c.dataset.n;
        if (r) {
          c.textContent = v === -1 ? '✹' : (v > 0 ? v : '');
          c.setAttribute('aria-label', pos + (v === -1 ? 'mine' : v > 0 ? `${v} adjacent ${v === 1 ? 'mine' : 'mines'}` : 'empty'));
        } else {
          c.textContent = f ? '⚑' : '';
          c.setAttribute('aria-label', pos + (f ? 'flagged' : 'hidden'));
        }
      }
      updateCounters();
    }

    function updateCounters() {
      let flags = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (flagged[y][x]) flags++;
      utils.setText(counterEl, String(MINES - flags).padStart(3, '0').replace(/^0-/, '-0'));
      const seconds = startedAt ? Math.min(999, Math.floor(((paused ? pauseStarted : Date.now()) - startedAt) / 1000)) : 0;
      utils.setText(clockEl, String(seconds).padStart(3, '0'));
    }

    function updateStatus() {
      statusEl.dataset.tone = '';
      if (paused) statusEl.innerHTML = '<strong>Paused.</strong> Resume when you are ready.';
      else if (over) { statusEl.dataset.tone = won ? 'good' : 'bad'; statusEl.innerHTML = won ? '<strong>Field cleared.</strong> Nice work.' : '<strong>Boom.</strong> Choose New game to try again.'; }
      else statusEl.textContent = first ? 'Choose a cell to begin. Your first reveal is always safe.' : 'Clear every safe cell without touching a mine.';
      updateCounters();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      stopClock(); cancelLongPress();
      say.dispose();
      grid.removeEventListener('click', onCellClick);
      grid.removeEventListener('contextmenu', onContextMenu);
      grid.removeEventListener('pointerdown', onPointerDown);
      grid.removeEventListener('pointerup', cancelLongPress);
      grid.removeEventListener('pointercancel', cancelLongPress);
      grid.removeEventListener('pointermove', cancelLongPress);
      grid.removeEventListener('keydown', onGridKeydown);
      modeBtn.removeEventListener('click', onMode);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    const onMode = () => setMode(!flagMode);
    grid.addEventListener('click', onCellClick);
    grid.addEventListener('contextmenu', onContextMenu);
    grid.addEventListener('pointerdown', onPointerDown);
    grid.addEventListener('pointerup', cancelLongPress);
    grid.addEventListener('pointercancel', cancelLongPress);
    grid.addEventListener('pointermove', cancelLongPress);
    grid.addEventListener('keydown', onGridKeydown);
    modeBtn.addEventListener('click', onMode);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    init();
    return dispose;
  }

  window.AizanoiArcadeMines = { mount };
})();
