/** Aizanoi Arcade — Blockfall (tetromino stacking, floppyy RetroGames-inspired but original implementation). */
(function () {
  'use strict';
  const SHAPES = [
    { cells: [[1, 1, 1, 1]], color: '#4ade80' },
    { cells: [[1, 1], [1, 1]], color: '#facc15' },
    { cells: [[0, 1, 0], [1, 1, 1]], color: '#c084fc' },
    { cells: [[0, 1, 1], [1, 1, 0]], color: '#38bdf8' },
    { cells: [[1, 1, 0], [0, 1, 1]], color: '#fb923c' },
    { cells: [[1, 0, 0], [1, 1, 1]], color: '#60a5fa' },
    { cells: [[0, 0, 1], [1, 1, 1]], color: '#f87171' }
  ];
  const COLS = 10, ROWS = 20, CELL = 22;

  function mount(container, onClose) {
    container.innerHTML = `
      <div class="ag-cab" data-game="blockfall">
        <div class="ag-bf">
          <div class="ag-screen"><canvas data-bf-canvas width="${COLS * CELL}" height="${ROWS * CELL}" tabindex="0" aria-label="Blockfall playfield. On touch screens, tap left or right to move, upper center to rotate, lower center to drop, and double tap for hard drop."></canvas></div>
          <div class="ag-side">
            <div class="ag-stat"><span>Score</span><output data-bf-score>0</output></div>
            <div class="ag-stat"><span>Lines</span><output data-bf-lines>0</output></div>
            <div class="ag-stat"><span>Best</span><output data-bf-best>—</output></div>
            <div class="ag-next"><span>Next</span><canvas data-bf-next width="${4 * CELL}" height="${4 * CELL}" aria-hidden="true"></canvas></div>
            <button class="ag-btn" type="button" data-bf-pause aria-pressed="false">Pause</button>
            <button class="ag-btn" type="button" data-bf-restart>New game</button>
            <button class="ag-btn" type="button" data-bf-close hidden>Close game</button>
          </div>
        </div>
        <p class="ag-status" data-bf-status></p>
        <p class="ag-hint"><kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd> rotate · <kbd>↓</kbd> drop · <kbd>Space</kbd> hard drop · <kbd>P</kbd> pause. On touch, tap the playfield; double tap for hard drop.</p>
      </div>`;

    const canvas = container.querySelector('[data-bf-canvas]');
    const nextCanvas = container.querySelector('[data-bf-next]');
    const ctx = canvas.getContext('2d');
    const nctx = nextCanvas.getContext('2d');
    const scoreEl = container.querySelector('[data-bf-score]');
    const linesEl = container.querySelector('[data-bf-lines]');
    const statusEl = container.querySelector('[data-bf-status]');
    const pauseBtn = container.querySelector('[data-bf-pause]');
    const utils = window.AizanoiGames;
    const say = utils.liveRegion(container.querySelector('.ag-cab'));
    const FONT = '"Inter", system-ui, "Segoe UI", sans-serif';
    let paused = false;

    let grid, piece, next, dropCounter, dropInterval, score, lines, over = false, raf, disposed = false;
    let lastTouchAt = 0;

    function emptyGrid() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
    function spawn() {
      const shape = next || SHAPES[Math.floor(Math.random() * SHAPES.length)];
      next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      piece = { ...shape, cells: shape.cells.map((row) => [...row]), x: Math.floor((COLS - shape.cells[0].length) / 2), y: 0 };
      drawNext();
      if (collide(piece.x, piece.y, piece.cells)) endGame();
    }
    function collide(px, py, cells) {
      for (let y = 0; y < cells.length; y++) {
        for (let x = 0; x < cells[y].length; x++) {
          if (!cells[y][x]) continue;
          const gx = px + x, gy = py + y;
          if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
          if (gy >= 0 && grid[gy][gx]) return true;
        }
      }
      return false;
    }
    function rotate() {
      const rotated = piece.cells[0].map((_, i) => piece.cells.map((row) => row[i]).reverse());
      if (!collide(piece.x, piece.y, rotated)) piece.cells = rotated;
      else if (!collide(piece.x - 1, piece.y, rotated)) { piece.x -= 1; piece.cells = rotated; }
      else if (!collide(piece.x + 1, piece.y, rotated)) { piece.x += 1; piece.cells = rotated; }
    }
    function merge() {
      piece.cells.forEach((row, y) => row.forEach((value, x) => {
        if (value && piece.y + y >= 0) grid[piece.y + y][piece.x + x] = piece.color;
      }));
    }
    function sweep() {
      let cleared = 0;
      for (let y = ROWS - 1; y >= 0; y--) {
        if (grid[y].every((cell) => cell)) {
          grid.splice(y, 1);
          grid.unshift(Array(COLS).fill(null));
          cleared++;
          y++;
        }
      }
      if (cleared) {
        lines += cleared;
        score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(lines / 10) * 0.1);
        dropInterval = Math.max(90, 620 - lines * 12);
        scoreEl.textContent = Math.floor(score);
        linesEl.textContent = lines;
      }
    }
    function drop() {
      if (!collide(piece.x, piece.y + 1, piece.cells)) piece.y++;
      else { merge(); sweep(); spawn(); }
      dropCounter = 0;
    }
    function hardDrop() { while (!collide(piece.x, piece.y + 1, piece.cells)) { piece.y++; score += 1; } drop(); scoreEl.textContent = Math.floor(score); }
    function drawCell(context, x, y, color, size = CELL) {
      context.fillStyle = color;
      context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
      context.fillStyle = 'rgba(255,255,255,.25)';
      context.fillRect(x * size + 1, y * size + 1, size - 2, 3);
    }
    function drawNext() {
      nctx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      next?.cells.forEach((row, y) => row.forEach((value, x) => { if (value) drawCell(nctx, x, y, next.color); }));
    }
    function draw() {
      ctx.fillStyle = '#0d1524';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      grid.forEach((row, y) => row.forEach((cell, x) => { if (cell) drawCell(ctx, x, y, cell); }));
      if (piece) piece.cells.forEach((row, y) => row.forEach((value, x) => { if (value && piece.y + y >= 0) drawCell(ctx, piece.x + x, piece.y + y, piece.color); }));
      if (over || paused) {
        ctx.fillStyle = 'rgba(6,10,18,.72)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#d9c2ff';
        ctx.font = `700 22px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.fillText(over ? 'Game over' : 'Paused', canvas.width / 2, canvas.height / 2 - 8);
        ctx.font = `13px ${FONT}`;
        ctx.fillStyle = '#9fb0c8';
        ctx.fillText(over ? 'Press Space or New game' : 'Press P or Resume', canvas.width / 2, canvas.height / 2 + 18);
      }
    }
    function endGame() {
      over = true;
      if (score > 0) utils.save('blockfall', Math.floor(score));
      utils.setText(container.querySelector('[data-bf-best]'), utils.best('blockfall') ?? '—');
      say(`Game over. Score ${Math.floor(score)}.`);
    }
    function loop(timestamp = 0) {
      if (disposed) return;
      const delta = timestamp - (loop.last || timestamp);
      loop.last = timestamp;
      if (!container.isConnected) { dispose(); return; }
      if (!over && !paused) {
        dropCounter += delta;
        if (dropCounter > dropInterval) drop();
      }
      draw();
      updateHud();
      raf = requestAnimationFrame(loop);
    }
    function updateHud() {
      utils.setText(scoreEl, Math.floor(score));
      utils.setText(linesEl, lines);
      const text = over ? `Game over. Final score ${Math.floor(score)}.` : paused ? 'Paused. Press P or Resume to continue.' : 'Stack the forms and clear full lines.';
      if (statusEl.dataset.text !== text) { statusEl.dataset.text = text; statusEl.textContent = text; }
    }
    function restart() {
      grid = emptyGrid();
      score = 0; lines = 0; dropCounter = 0; dropInterval = 620; over = false; paused = false;
      setPaused(false);
      next = null; spawn();
      canvas.focus({ preventScroll: true });
    }
    function setPaused(value) {
      paused = value;
      pauseBtn.textContent = paused ? 'Resume' : 'Pause';
      pauseBtn.setAttribute('aria-pressed', paused ? 'true' : 'false');
    }
    function togglePause() {
      if (over) return;
      setPaused(!paused);
      say(paused ? 'Paused' : 'Resumed');
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      say.dispose();
      document.removeEventListener('keydown', keydown);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', pointerdown);
    }
    function onVisibility() { if (document.hidden && !over && !paused) togglePause(); }

    const keydown = (event) => {
      if (!utils.acceptsKey(container, event, canvas)) return;
      const key = event.key;
      if (key.toLowerCase() === 'p' && !over) { event.preventDefault(); togglePause(); return; }
      if ((key === ' ' || key === 'Enter') && over) { event.preventDefault(); restart(); return; }
      if (over || paused) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(key)) event.preventDefault();
      if (key === 'ArrowLeft' && !collide(piece.x - 1, piece.y, piece.cells)) piece.x--;
      else if (key === 'ArrowRight' && !collide(piece.x + 1, piece.y, piece.cells)) piece.x++;
      else if (key === 'ArrowDown') drop();
      else if (key === 'ArrowUp') rotate();
      else if (key === ' ') hardDrop();
    };
    const pointerdown = (event) => {
      canvas.focus({ preventScroll: true });
      if (event.pointerType === 'mouse' || over || paused) return;
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const now = performance.now();
      if (now - lastTouchAt < 320) {
        lastTouchAt = 0;
        hardDrop();
        return;
      }
      lastTouchAt = now;
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (x < .34) {
        if (!collide(piece.x - 1, piece.y, piece.cells)) piece.x--;
      } else if (x > .66) {
        if (!collide(piece.x + 1, piece.y, piece.cells)) piece.x++;
      } else if (y < .52) rotate();
      else drop();
    };
    document.addEventListener('keydown', keydown);
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('pointerdown', pointerdown);
    const closeBtn = container.querySelector('[data-bf-close]');
    if (typeof onClose === 'function') closeBtn.addEventListener('click', onClose);
    container.querySelector('[data-bf-restart]').addEventListener('click', restart);
    pauseBtn.addEventListener('click', togglePause);

    utils.setText(container.querySelector('[data-bf-best]'), utils.best('blockfall') ?? '—');
    restart();
    raf = requestAnimationFrame(loop);
    return dispose;
  }

  window.AizanoiArcadeBlocks = { mount };
})();
