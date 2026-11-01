/** Aizanoi Arcade — Signal Snake. Explicit mount/dispose factory; styling lives in arcade.css. */
(function () {
  'use strict';
  const W = 20, H = 15, CELL = 20, TICK_MS = 118;
  const FONT = '"Inter", system-ui, "Segoe UI", sans-serif';

  function mount(container) {
    const utils = window.AizanoiGames;
    let snake, dir, pendingDir, food, score, over, interval = null, pulse = 0, paused = false, disposed = false;

    container.innerHTML = `
      <div class="ag-cab" data-game="snake">
        <div class="ag-hud">
          <div class="ag-stat"><span>Score</span><output id="snake-score">0000</output></div>
          <div class="ag-stat"><span>Length</span><output id="snake-length">3</output></div>
        </div>
        <div class="ag-screen"><canvas id="snake-canvas" width="${W * CELL}" height="${H * CELL}" tabindex="0" aria-label="Signal Snake playfield. Use the arrow keys, or tap the playfield in the direction you want to turn."></canvas></div>
        <p class="ag-status" id="snake-status"></p>
        <p class="ag-hint"><kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> steer · <kbd>P</kbd> pause · <kbd>Space</kbd> restart. On touch, tap the playfield to turn toward that side of the snake.</p>
      </div>`;
    const cab = container.querySelector('.ag-cab');
    const canvas = container.querySelector('#snake-canvas');
    const ctx = canvas.getContext('2d');
    const scoreEl = container.querySelector('#snake-score');
    const lengthEl = container.querySelector('#snake-length');
    const statusEl = container.querySelector('#snake-status');
    cab.insertBefore(utils.toolbar({ game: 'snake', onPause: togglePause, onRestart: init }), cab.querySelector('.ag-screen'));
    const say = utils.liveRegion(cab);

    function init() {
      snake = [{ x: 10, y: 7 }, { x: 9, y: 7 }, { x: 8, y: 7 }];
      dir = pendingDir = { x: 1, y: 0 };
      score = 0; over = false; pulse = 0; paused = false;
      utils.setPauseButton(container, false);
      stopTimer();
      placeFood();
      draw();
      interval = setInterval(tick, TICK_MS);
      canvas.focus({ preventScroll: true });
    }

    function stopTimer() {
      if (interval) clearInterval(interval);
      interval = null;
    }

    function placeFood() {
      do { food = { x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * H) }; }
      while (snake.some((s) => s.x === food.x && s.y === food.y));
    }

    function setDirection(name) {
      const next = name === 'up' ? { x: 0, y: -1 } : name === 'down' ? { x: 0, y: 1 } : name === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };
      if (next.x === -dir.x && next.y === -dir.y) return;
      pendingDir = next;
    }

    function onPointerDown(e) {
      canvas.focus({ preventScroll: true });
      if (e.pointerType === 'mouse' || !snake?.length) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const x = (e.clientX - rect.left) * (canvas.width / rect.width);
      const y = (e.clientY - rect.top) * (canvas.height / rect.height);
      const dx = x - (snake[0].x + .5) * CELL, dy = y - (snake[0].y + .5) * CELL;
      if (Math.abs(dx) < CELL * .4 && Math.abs(dy) < CELL * .4) return;
      setDirection(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
    }

    function onKey(e) {
      if (!utils.acceptsKey(container, e, canvas)) return;
      const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
      if (map[e.key]) { e.preventDefault(); setDirection(map[e.key]); }
      else if ((e.key === ' ' || e.key === 'Enter') && over) { e.preventDefault(); init(); }
      else if (e.key.toLowerCase() === 'p' && !over) { e.preventDefault(); togglePause(); }
    }

    function onVisibility() {
      if (document.hidden && !paused && !over) togglePause();
    }

    function tick() {
      if (!container.isConnected) { dispose(); return; }
      if (over || paused) return;
      dir = pendingDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      if (head.x < 0 || head.y < 0 || head.x >= W || head.y >= H || snake.some((s) => s.x === head.x && s.y === head.y)) { end(); return; }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) { score += 10; pulse = 5; placeFood(); }
      else snake.pop();
      if (pulse > 0) pulse--;
      draw();
    }

    function rounded(x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
      ctx.fill();
    }

    function draw() {
      const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, '#081828'); bg.addColorStop(1, '#030b13');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = 'rgba(104,155,192,.10)'; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * CELL + .5, 0); ctx.lineTo(x * CELL + .5, canvas.height); ctx.stroke(); }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * CELL + .5); ctx.lineTo(canvas.width, y * CELL + .5); ctx.stroke(); }

      const fx = food.x * CELL + CELL / 2, fy = food.y * CELL + CELL / 2;
      ctx.save(); ctx.shadowColor = '#ff6d55'; ctx.shadowBlur = 14 + pulse * 2;
      const fg = ctx.createRadialGradient(fx - 3, fy - 4, 2, fx, fy, 9);
      fg.addColorStop(0, '#fff0ae'); fg.addColorStop(.24, '#ff855f'); fg.addColorStop(1, '#c8242d');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(fx, fy, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.restore();

      for (let i = snake.length - 1; i >= 0; i--) {
        const s = snake[i];
        const x = s.x * CELL + 2, y = s.y * CELL + 2, w = CELL - 4;
        const g = ctx.createLinearGradient(x, y, x + w, y + w);
        if (i === 0) { g.addColorStop(0, '#78f0b2'); g.addColorStop(1, '#168f62'); ctx.shadowColor = '#4ff1aa'; ctx.shadowBlur = 10; }
        else { g.addColorStop(0, '#45a6e6'); g.addColorStop(1, '#205cb8'); ctx.shadowBlur = 0; }
        ctx.fillStyle = g; rounded(x, y, w, w, 4);
        ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 3, y + 3, w - 6, 2);
        if (i === 0) {
          ctx.shadowBlur = 0; ctx.fillStyle = '#06131e';
          const ex = dir.y !== 0 ? 4 : dir.x > 0 ? 11 : 4, ex2 = dir.y !== 0 ? 11 : ex;
          const ey = dir.x !== 0 ? 5 : dir.y > 0 ? 11 : 5, ey2 = dir.x !== 0 ? 11 : ey;
          ctx.beginPath(); ctx.arc(x + ex, y + ey, 1.6, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x + ex2, y + ey2, 1.6, 0, Math.PI * 2); ctx.fill();
        }
      }
      ctx.shadowBlur = 0;

      if (paused && !over) {
        ctx.fillStyle = 'rgba(2,8,14,.58)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center'; ctx.fillStyle = '#eef8ff'; ctx.font = `700 25px ${FONT}`; ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2);
      }
      if (over) {
        ctx.fillStyle = 'rgba(2,8,14,.68)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.textAlign = 'center'; ctx.fillStyle = '#eef8ff'; ctx.font = `700 28px ${FONT}`; ctx.fillText('GAME OVER', canvas.width / 2, canvas.height / 2 - 8);
        ctx.fillStyle = '#8fc9ef'; ctx.font = `13px ${FONT}`; ctx.fillText('Press Space or New game to play again', canvas.width / 2, canvas.height / 2 + 20);
      }

      utils.setText(scoreEl, String(score).padStart(4, '0'));
      utils.setText(lengthEl, snake.length);
      statusEl.innerHTML = paused ? '<strong>Paused.</strong> Press P or Resume to continue.'
        : over ? `<strong>Run ended.</strong> Final score ${score}.`
        : 'Eat the glowing signal and avoid the walls and your own trail.';
    }

    function togglePause() {
      if (over) return;
      paused = !paused;
      utils.setPauseButton(container, paused);
      say(paused ? 'Paused' : 'Resumed');
      draw();
    }

    function end() {
      over = true;
      stopTimer();
      utils.save('snake', score);
      utils.refreshToolbar(container, 'snake');
      say(`Game over. Score ${score}.`);
      draw();
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      stopTimer();
      say.dispose();
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('pointerdown', onPointerDown);
    }

    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('pointerdown', onPointerDown);
    init();
    return dispose;
  }

  window.AizanoiArcadeSnake = { mount };
})();
