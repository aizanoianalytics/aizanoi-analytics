(function() {
  const container = document.getElementById('game-mines-container');
  if (!container) return;
  const W = 10, H = 10, MINES = 15;
  let board, revealed, flagged, first, over, won;
  const SIZE = 28;

  function init() {
    board = []; revealed = []; flagged = []; first = true; over = false; won = false;
    for (let y = 0; y < H; y++) {
      board.push(new Array(W).fill(0));
      revealed.push(new Array(W).fill(false));
      flagged.push(new Array(W).fill(false));
    }
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + W + ',' + SIZE + 'px);gap:1px;background:#888;padding:1px;width:fit-content;';
    grid.id = 'mines-grid';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell = document.createElement('div');
        cell.style.cssText = 'width:' + SIZE + 'px;height:' + SIZE + 'px;background:#bbb;display:flex;align-items:center;justify-content:center;font-weight:bold;font-size:14px;cursor:pointer;user-select:none;font-family:Tahoma;';
        cell.dataset.x = x; cell.dataset.y = y;
        cell.addEventListener('click', onLClick);
        cell.addEventListener('contextmenu', (e) => { e.preventDefault(); onRClick(x, y); });
        grid.appendChild(cell);
      }
    }
    container.appendChild(grid);
    const status = document.createElement('div');
    status.id = 'mines-status';
    status.style.cssText = 'margin-top:8px;font-family:Tahoma,sans-serif;font-size:11px;';
    status.textContent = 'Left-click: reveal · Right-click: flag · Find all non-mines to win';
    container.appendChild(status);
    const btn = document.createElement('button');
    btn.textContent = 'New Game';
    btn.style.cssText = 'margin-top:6px;font-family:Tahoma,sans-serif;font-size:11px;padding:4px 12px;';
    btn.onclick = init;
    container.appendChild(btn);
    updateStatus();
  }

  function onLClick(e) {
    if (over) return;
    const x = +e.currentTarget.dataset.x;
    const y = +e.currentTarget.dataset.y;
    if (flagged[y][x]) return;
    if (first) { first = false; placeMines(x, y); }
    if (board[y][x] === -1) { reveal(x, y); end(false); return; }
    floodFill(x, y);
    checkWin();
  }

  function onRClick(x, y) {
    if (over || first) return;
    if (revealed[y][x]) return;
    flagged[y][x] = !flagged[y][x];
    render();
    updateStatus();
  }

  function placeMines(sx, sy) {
    let placed = 0;
    while (placed < MINES) {
      const x = Math.floor(Math.random() * W);
      const y = Math.floor(Math.random() * H);
      if (board[y][x] === -1) continue;
      if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
      board[y][x] = -1;
      placed++;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (board[y][x] === -1) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (board[ny][nx] === -1) n++;
      }
      board[y][x] = n;
    }
  }

  function floodFill(sx, sy) {
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (revealed[y][x] || flagged[y][x]) continue;
      revealed[y][x] = true;
      if (board[y][x] === 0) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          stack.push([x + dx, y + dy]);
        }
      }
    }
    render();
  }

  function reveal(x, y) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (board[ny][nx] === -1) revealed[ny][nx] = true;
    }
    render();
  }

  function checkWin() {
    let unrevealed = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!revealed[y][x]) unrevealed++;
    }
    if (unrevealed === MINES) end(true);
  }

  function end(won_) {
    over = true; won = won_;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) revealed[y][x] = true;
    render();
    updateStatus();
    if (won_) saveScore('mines', 'W');
  }

  function render() {
    const grid = document.getElementById('mines-grid');
    if (!grid) return;
    const cells = grid.children;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = cells[y * W + x];
      const v = board[y][x];
      const r = revealed[y][x];
      const f = flagged[y][x];
      if (r) {
        c.style.background = v === -1 ? '#cc0000' : '#ddd';
        if (v === -1) { c.textContent = '✱'; c.style.color = '#fff'; }
        else if (v > 0) { c.textContent = v; c.style.color = ['#1a5fd6','#0a7c0a','#b30000','#0d3fb0','#800000','#008080','#000','#888'][v-1]; }
        else c.textContent = '';
      } else if (f) {
        c.style.background = '#bbb'; c.textContent = '⚑'; c.style.color = '#b30000';
      } else {
        c.style.background = '#bbb'; c.textContent = ''; c.style.color = '#000';
      }
    }
  }

  function updateStatus() {
    const s = document.getElementById('mines-status');
    if (!s) return;
    if (over) s.textContent = won ? 'You found all safe cells. WIN.' : 'BOOM — game over.';
    else {
      let f = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (flagged[y][x]) f++;
      s.textContent = 'Mines: ' + MINES + ' · Flags: ' + f + ' · Left-click: reveal · Right-click: flag';
    }
  }

  function saveScore(game, result) {
    try {
      const key = 'aizanoi-games';
      const scores = JSON.parse(localStorage.getItem(key) || '{}');
      if (!scores[game]) scores[game] = [];
      scores[game].push({ result, at: new Date().toISOString() });
      if (scores[game].length > 20) scores[game] = scores[game].slice(-20);
      localStorage.setItem(key, JSON.stringify(scores));
    } catch(e) {}
  }

  init();
})();