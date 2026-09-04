(function() {
  const container = document.getElementById('game-mines-container');
  if (!container) return;

  const W = 10, H = 10, MINES = 15, SIZE = 30;
  let board, revealed, flagged, first, over, won, startedAt, timer, longPressTimer, suppressNextClick = false, paused = false, pauseStarted = 0;

  function bevel(el, down) {
    el.style.borderStyle = 'solid';
    el.style.borderWidth = '2px';
    el.style.borderColor = down ? '#6c6c6c #fff #fff #6c6c6c' : '#fff #6c6c6c #6c6c6c #fff';
  }

  function init() {
    board = []; revealed = []; flagged = []; first = true; over = false; won = false; startedAt = 0; paused = false; pauseStarted = 0;
    if (timer) clearInterval(timer);
    timer = null;
    for (let y = 0; y < H; y++) {
      board.push(new Array(W).fill(0));
      revealed.push(new Array(W).fill(false));
      flagged.push(new Array(W).fill(false));
    }

    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px;background:linear-gradient(145deg,#d8d6cb,#b9b8ae);border:1px solid #8e8d84;box-shadow:inset 1px 1px #fff,inset -1px -1px #777;max-width:100%;overflow:auto;';

    const header = document.createElement('div');
    header.style.cssText = 'width:' + (W * SIZE + 4) + 'px;max-width:100%;display:grid;grid-template-columns:72px 1fr 72px;align-items:center;gap:8px;padding:7px;background:#c6c4b9;border:2px solid;border-color:#777 #fff #fff #777;';
    header.innerHTML = '<div id="mines-counter" aria-label="Mines remaining"></div><button id="mines-face" aria-label="Restart game">🙂</button><div id="mines-timer" aria-label="Elapsed time"></div>';
    container.appendChild(header);

    ['mines-counter','mines-timer'].forEach(id => {
      const el = header.querySelector('#' + id);
      el.style.cssText = 'height:34px;background:#210606;color:#ff3b30;border:2px inset #777;display:flex;align-items:center;justify-content:center;font:700 24px/1 Consolas,monospace;letter-spacing:2px;text-shadow:0 0 7px rgba(255,50,40,.75);';
    });
    const face = header.querySelector('#mines-face');
    face.style.cssText = 'justify-self:center;width:38px;height:34px;padding:0;background:linear-gradient(#f4f2e7,#b7b5aa);font-size:20px;line-height:1;cursor:pointer;border-radius:0;';
    bevel(face, false);
    face.onmousedown = () => bevel(face, true);
    face.onmouseup = face.onmouseleave = () => bevel(face, false);
    face.onclick = init;

    const grid = document.createElement('div');
    grid.id = 'mines-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(' + W + ',' + SIZE + 'px);gap:0;background:#8c8c84;padding:2px;width:fit-content;max-width:none;box-shadow:inset 2px 2px #777,inset -2px -2px #fff;touch-action:manipulation;';

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.style.cssText = 'width:' + SIZE + 'px;height:' + SIZE + 'px;padding:0;background:linear-gradient(135deg,#deddd5,#aaa99f);display:flex;align-items:center;justify-content:center;font:900 15px/1 Tahoma,sans-serif;cursor:pointer;user-select:none;border-radius:0;touch-action:manipulation;';
        bevel(cell, false);
        cell.dataset.x = x; cell.dataset.y = y;
        cell.setAttribute('aria-label', 'Hidden cell');
        cell.addEventListener('click', onLClick);
        cell.addEventListener('contextmenu', (e) => { e.preventDefault(); onRClick(x, y); });
        cell.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'touch') longPressTimer = setTimeout(() => { longPressTimer = null; suppressNextClick = true; onRClick(x, y); }, 480);
        });
        cell.addEventListener('pointerup', () => { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
        cell.addEventListener('pointercancel', () => { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
        cell.addEventListener('pointermove', () => { if (longPressTimer) clearTimeout(longPressTimer); longPressTimer = null; });
        grid.appendChild(cell);
      }
    }
    container.appendChild(grid);

    const status = document.createElement('div');
    status.id = 'mines-status';
    status.style.cssText = 'width:min(' + (W * SIZE + 4) + 'px,100%);min-height:30px;padding:7px 9px;background:#ecebe4;border:1px solid #9b9a92;color:#252525;font:11px/1.35 Tahoma,sans-serif;';
    container.appendChild(status);

    if (window.AizanoiGames) {
      container.appendChild(window.AizanoiGames.toolbar({
        game: 'mines', lowerBetter: true, onPause: togglePause, onRestart: init,
        formatBest: (value) => value + 's'
      }));
    }

    const hint = document.createElement('div');
    hint.style.cssText = 'font:10px Tahoma,sans-serif;color:#5b5b56;text-align:center;';
    hint.textContent = 'Click to reveal · Right-click or long-press to flag';
    container.appendChild(hint);
    updateStatus();
  }

  function startClock() {
    if (startedAt) return;
    startedAt = Date.now();
    timer = setInterval(() => {
      if (!container.isConnected || over) { clearInterval(timer); timer = null; return; }
      if (!paused) updateCounters();
    }, 500);
  }

  function onLClick(e) {
    if (over || paused) return;
    if (suppressNextClick) { suppressNextClick = false; return; }
    const x = +e.currentTarget.dataset.x;
    const y = +e.currentTarget.dataset.y;
    if (flagged[y][x]) return;
    if (first) { first = false; placeMines(x, y); startClock(); }
    if (board[y][x] === -1) { revealed[y][x] = true; end(false); return; }
    floodFill(x, y);
    checkWin();
  }

  function onRClick(x, y) {
    if (over || paused || revealed[y][x]) return;
    flagged[y][x] = !flagged[y][x];
    render();
    updateStatus();
  }

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
    if (timer) clearInterval(timer); timer = null;
    if (!won) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (board[y][x] === -1) revealed[y][x] = true;
    }
    render(); updateStatus();
    const face = document.getElementById('mines-face');
    if (face) face.textContent = won ? '😎' : '😵';
    if (won) {
      const result = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
      saveScore('mines', result);
      window.AizanoiGames?.refreshToolbar(container, 'mines', { lowerBetter: true, formatBest: (value) => value + 's' });
    }
  }

  function togglePause() {
    if (over) return;
    paused = !paused;
    if (paused) pauseStarted = Date.now();
    else if (startedAt && pauseStarted) startedAt += Date.now() - pauseStarted;
    const button = container.querySelector('[data-game-action="pause"]');
    if (button) { button.textContent = paused ? 'Resume' : 'Pause'; button.setAttribute('aria-pressed', paused ? 'true' : 'false'); }
    updateStatus();
  }

  function render() {
    const grid = document.getElementById('mines-grid');
    if (!grid) return;
    const colors = ['','#2364d2','#178322','#c52222','#3030a5','#7e1f1f','#168787','#202020','#777'];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = grid.children[y * W + x], v = board[y][x], r = revealed[y][x], f = flagged[y][x];
      c.style.textShadow = 'none';
      if (r) {
        c.style.background = v === -1 ? 'radial-gradient(circle,#ff7770 0,#c92525 72%)' : '#d2d1c9';
        c.style.border = '1px solid #9a9992';
        if (v === -1) { c.textContent = '✹'; c.style.color = '#1b0909'; c.style.textShadow = '0 1px #fff7'; c.setAttribute('aria-label','Mine'); }
        else if (v > 0) { c.textContent = v; c.style.color = colors[v]; c.setAttribute('aria-label', v + ' adjacent mines'); }
        else { c.textContent = ''; c.setAttribute('aria-label','Empty'); }
      } else {
        bevel(c, false);
        c.style.background = f ? 'linear-gradient(135deg,#f0e2bd,#aaa99f)' : 'linear-gradient(135deg,#deddd5,#aaa99f)';
        c.textContent = f ? '⚑' : '';
        c.style.color = '#bd1d1d';
        c.setAttribute('aria-label', f ? 'Flagged cell' : 'Hidden cell');
      }
    }
    updateCounters();
  }

  function updateCounters() {
    let flags = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (flagged[y][x]) flags++;
    const counter = document.getElementById('mines-counter');
    const clock = document.getElementById('mines-timer');
    if (counter) counter.textContent = String(Math.max(0, MINES - flags)).padStart(3, '0');
    const seconds = startedAt ? Math.min(999, Math.floor((Date.now() - startedAt) / 1000)) : 0;
    if (clock) clock.textContent = String(seconds).padStart(3, '0');
  }

  function updateStatus() {
    const s = document.getElementById('mines-status');
    if (!s) return;
    if (paused) s.innerHTML = '<b>PAUSED</b> · Resume when ready.';
    else if (over) s.innerHTML = won ? '<b style="color:#166e27">FIELD CLEARED</b> · Nice work.' : '<b style="color:#a51d1d">BOOM</b> · Click the face to retry.';
    else s.textContent = first ? 'Choose a cell. Your first click is always safe.' : 'Clear every safe cell without hitting a mine.';
    updateCounters();
  }

  function saveScore(game, score) {
    try {
      if (window.AizanoiGames) { window.AizanoiGames.save(game, score); return; }
      const key = 'aizanoi-games', scores = JSON.parse(localStorage.getItem(key) || '{}');
      if (!scores[game]) scores[game] = [];
      scores[game].push({ score, at: new Date().toISOString() });
      if (scores[game].length > 20) scores[game] = scores[game].slice(-20);
      localStorage.setItem(key, JSON.stringify(scores));
    } catch (_) {}
  }

  init();
})();