/** Aizanoi Arcade — Blockfall (tetromino stacking, floppyy RetroGames-inspired but original implementation). */
(function () {
  'use strict';
  const SHAPES = [
    { cells: [[1, 1, 1, 1]], color: '#4ade80' },                    // I
    { cells: [[1, 1], [1, 1]], color: '#facc15' },                  // O
    { cells: [[0, 1, 0], [1, 1, 1]], color: '#c084fc' },            // T
    { cells: [[0, 1, 1], [1, 1, 0]], color: '#38bdf8' },            // S
    { cells: [[1, 1, 0], [0, 1, 1]], color: '#fb923c' },            // Z
    { cells: [[1, 0, 0], [1, 1, 1]], color: '#60a5fa' },            // J
    { cells: [[0, 0, 1], [1, 1, 1]], color: '#f87171' }             // L
  ];
  const COLS = 10, ROWS = 20, CELL = 22;

  function mount(container, onClose) {
    container.innerHTML = `
      <section class="az-simple-card">
        <div class="az-game-stage-head">
          <h3>Blockfall</h3><span class="az-system-spacer"></span>
          <span class="az-camera-status">Score <strong data-bf-score>0</strong> · Lines <strong data-bf-lines>0</strong></span>
          <button class="az-button" type="button" data-bf-close>Close game</button>
        </div>
        <div class="az-blockfall" data-bf-wrap>
          <canvas data-bf-canvas width="${COLS * CELL}" height="${ROWS * CELL}" aria-label="Blockfall playfield"></canvas>
          <div class="az-blockfall-side">
            <strong>Next</strong>
            <canvas data-bf-next width="${4 * CELL}" height="${4 * CELL}"></canvas>
            <small>← → move · ↑ rotate · ↓ soft drop · Space hard drop</small>
            <button class="az-button" type="button" data-bf-pause>Pause</button>
            <button class="az-button" type="button" data-bf-restart>Restart</button>
          </div>
        </div>
        <div class="az-blockfall-touch" data-bf-touch aria-label="Touch controls">
          <button class="az-button" type="button" data-bf-left aria-label="Move left">◀</button>
          <button class="az-button" type="button" data-bf-rotate aria-label="Rotate">⟳</button>
          <button class="az-button" type="button" data-bf-right aria-label="Move right">▶</button>
          <button class="az-button" type="button" data-bf-down aria-label="Soft drop">▼</button>
          <button class="az-button" type="button" data-bf-drop aria-label="Hard drop">⤓</button>
        </div>
      </section>`;

    const canvas = container.querySelector('[data-bf-canvas]');
    const nextCanvas = container.querySelector('[data-bf-next]');
    const ctx = canvas.getContext('2d');
    const nctx = nextCanvas.getContext('2d');
    const scoreEl = container.querySelector('[data-bf-score]');
    const linesEl = container.querySelector('[data-bf-lines]');

    let grid, piece, next, dropCounter, dropInterval, score, lines, running = true, raf;

    function emptyGrid() { return Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
    function spawn() {
      const shape = next || SHAPES[Math.floor(Math.random() * SHAPES.length)];
      next = SHAPES[Math.floor(Math.random() * SHAPES.length)];
      piece = { ...shape, cells: shape.cells.map((row) => [...row]), x: Math.floor((COLS - shape.cells[0].length) / 2), y: 0 };
      drawNext();
      if (collide(piece.x, piece.y, piece.cells)) { running = false; window.AizanoiGames?.flashMessage?.('Game over'); }
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
      else {
        merge(); sweep(); spawn();
      }
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
      if (!running) {
        ctx.fillStyle = 'rgba(6,10,18,.72)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#7ff0c8';
        ctx.font = '700 22px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('Game over', canvas.width / 2, canvas.height / 2 - 8);
        ctx.font = '13px system-ui';
        ctx.fillStyle = '#9fb0c8';
        ctx.fillText('Press Restart', canvas.width / 2, canvas.height / 2 + 18);
      }
    }
    function loop(timestamp = 0) {
      const delta = timestamp - (loop.last || timestamp);
      loop.last = timestamp;
      if (running) {
        dropCounter += delta;
        if (dropCounter > dropInterval) drop();
        draw();
      }
      raf = requestAnimationFrame(loop);
    }
    function restart() {
      grid = emptyGrid();
      score = 0; lines = 0; dropCounter = 0; dropInterval = 620; running = true;
      next = null; spawn();
      scoreEl.textContent = '0'; linesEl.textContent = '0';
    }

    const keydown = (event) => {
      if (!container.isConnected || !running) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', ' '].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowLeft' && !collide(piece.x - 1, piece.y, piece.cells)) piece.x--;
      else if (event.key === 'ArrowRight' && !collide(piece.x + 1, piece.y, piece.cells)) piece.x++;
      else if (event.key === 'ArrowDown') drop();
      else if (event.key === 'ArrowUp') rotate();
      else if (event.key === ' ') hardDrop();
    };
    document.addEventListener('keydown', keydown);
    container.querySelector('[data-bf-close]').addEventListener('click', onClose);
    container.querySelector('[data-bf-restart]').addEventListener('click', restart);
    container.querySelector('[data-bf-pause]').addEventListener('click', (event) => {
      running = !running;
      event.target.textContent = running ? 'Pause' : 'Resume';
    });
    const touch = (event) => {
      const button = event.target.closest('[data-bf-left],[data-bf-right],[data-bf-rotate],[data-bf-down],[data-bf-drop]');
      if (!button || !running) return;
      event.preventDefault();
      if (button.dataset.bfLeft !== undefined && !collide(piece.x - 1, piece.y, piece.cells)) piece.x--;
      else if (button.dataset.bfRight !== undefined && !collide(piece.x + 1, piece.y, piece.cells)) piece.x++;
      else if (button.dataset.bfRotate !== undefined) rotate();
      else if (button.dataset.bfDown !== undefined) drop();
      else if (button.dataset.bfDrop !== undefined) hardDrop();
    };
    container.querySelector('[data-bf-touch]').addEventListener('click', touch);

    restart();
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); document.removeEventListener('keydown', keydown); };
  }

  window.AizanoiArcadeBlocks = { mount };
})();
